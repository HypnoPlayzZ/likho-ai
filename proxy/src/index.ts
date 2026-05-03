// Day 5 proxy: still stateless, no auth, no rate limit.
// Single endpoint POST /rewrite { text: string } -> { professional, concise, friendly }
// Auth + rate limit + Supabase usage tracking land Day 8.
//
// Provider: Google Gemini Flash 2.5 (see DECISIONS.md 2026-04-30).

interface Env {
  GEMINI_API_KEY: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  // Voice mode (Day 10) — Pro+ feature.
  // Provider routing is automatic:
  //   1. If OPENAI_API_KEY is set         → use OpenAI Whisper-1 (paid, ~₹0.50/min).
  //   2. Else if env.AI is bound          → use Workers AI whisper-large-v3-turbo (free, 10K neurons/day).
  //   3. If ANTHROPIC_API_KEY is set      → use Claude Haiku 4.5 polish (paid, best quality).
  //   4. Else if env.AI is bound          → use Workers AI llama-3.3-70b polish (free).
  // Testing phase ships with no secrets set → all-free Workers AI path.
  // Production swap is "set the secrets and redeploy" — no code change.
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  // Cloudflare Workers AI binding. See wrangler.toml `[ai]` block.
  AI: Ai;
  // Razorpay plan id for the Pro+ tier (₹499/mo, includes voice mode).
  // Create in Razorpay dashboard, paste here as a Worker secret. Until set,
  // Pro+ subscriptions are disabled and voice mode is unlockable only via
  // the founding-member tier (which already includes it).
  RAZORPAY_PRO_PLUS_PLAN_ID?: string;
  LIKHO_KV: KVNamespace;
}

// Resend sandbox sender — works without domain verification but only
// delivers to the email address that registered the Resend account.
// Replace with "hello@likho.ai" (or similar) once the domain is verified
// in the Resend dashboard so real customer emails actually arrive.
const EMAIL_FROM = "Likho <onboarding@resend.dev>";

// Hard cap for the "first 50 founding spots" promise. Enforced on order
// creation by counting actual founding:payment:* keys in KV.
const FOUNDING_CAP = 50;

// Per-IP daily limit on /rewrite. Real users won't hit it; scrapers will.
// Until Day 11+ adds Clerk JWT auth this is the only thing protecting the
// Gemini key from being drained by anyone who finds the Worker URL.
const REWRITE_DAILY_CAP_PER_IP = 100;

// Body size limit on /rewrite to prevent denial-of-wallet via huge JSON
// payloads (Workers charge per CPU-ms; parsing 50 MB JSON is not free).
const MAX_REWRITE_BODY_BYTES = 100_000;

// Rewrite cache (v0.4.1) — same input + same audience within 24h returns
// the cached result. Cuts Gemini calls ~30-50% once users have repeat
// patterns (greeting templates, meeting reminders, follow-up phrasing).
// KV layout: `rewrite:cache:<sha256-prefix>` → JSON Rewrites.
// Hash includes audience so different audiences don't collide.
const REWRITE_CACHE_TTL_S = 24 * 60 * 60;
// Don't cache extremely short or one-off content — short text is rarely
// reused, and very long text hashes are unique anyway. Sweet spot: 20–4000 chars.
const REWRITE_CACHE_MIN_CHARS = 20;

// Founding-member price in paise (₹4,900 = 490,000 paise). Locked here so
// the client can't pass an arbitrary amount — the order endpoint ignores
// any caller-supplied amount and uses this constant instead.
const FOUNDING_AMOUNT_PAISE = 490000;
const FOUNDING_CURRENCY = "INR";

// Pro monthly plan, created via Razorpay Plans API.
//   ₹299 / month · plan_SjlmaGFnRAAXCw
// Locked here so the client can't pass an arbitrary plan id. If we add
// more tiers (yearly, etc.), make this a server-side lookup, never trust
// a plan id from the client.
const PRO_PLAN_ID = "plan_SjlmaGFnRAAXCw";
// Razorpay requires total_count for subscriptions; we don't actually want
// auto-cancellation, so pick a long horizon (120 months = 10 years). The
// subscription will keep auto-renewing until the customer cancels in their
// Razorpay account email or we cancel it server-side.
const PRO_TOTAL_COUNT = 120;

// Day 8: founding-member waitlist (PRD pricing — first 50 lifetime at ₹4,900).
// Total cap is conservative enforcement only; the front-end shows "37 left"
// hardcoded today and will switch to live count when this number is shown
// in the UI in a follow-up.
const WAITLIST_CAP = 50;

// Day 9: landing-page interactive mockup. Per-IP daily cap to prevent the
// public demo route from being a free Gemini key for scrapers.
const LANDING_DEMO_DAILY_CAP = 3;

// Day 10: Voice mode caps.
//   Per-email cap so a single Pro+/founding email can't burn the OpenAI bill
//   if their machine is compromised. 100 voice clips/day is generous —
//   real users average <20.
const VOICE_DAILY_CAP_PER_EMAIL = 100;
//   Hard ceiling on audio payload size. WAV at 48kHz mono for 70s ≈ 6.7MB.
//   8MB gives us headroom for stereo or higher sample rates without DoSing
//   the Worker. Anything bigger is almost certainly malicious.
const VOICE_MAX_AUDIO_BYTES = 8 * 1024 * 1024;
//   Pro+ tier monthly price (₹499 = 49,900 paise). Locked here so a tampered
//   client can't initiate a ₹1 subscription. Razorpay's plan controls the
//   actual amount; this is for log/UI consistency.
const PRO_PLUS_TOTAL_COUNT = 120;

// Polish system prompt for voice mode. Converts raw Whisper transcript
// (Hindi / English / Hinglish) into clean professional English. The bar
// is intentionally LIGHT — Whisper-large-v3-turbo already produces clean
// text. Polish should only translate Hindi/Hinglish to English and strip
// filler words. Don't paraphrase, don't formalise, don't restructure.
// The downstream /rewrite step is what generates tone variants.
const VOICE_POLISH_PROMPT = `You are cleaning up speech-to-text output from an Indian professional. The input may be in Hindi, English, or a mix (Hinglish).

YOUR ONLY JOB: produce a clean English version. Do as little as possible.

Specifically:
- If the input is already clean English: return it nearly unchanged. Only remove obvious fillers (um, uh, like, you know).
- If the input has Hindi or Hinglish: translate ONLY the non-English parts to natural English. Keep the speaker's voice and word choices wherever possible.
- DO NOT paraphrase. DO NOT formalise. DO NOT restructure sentences.
- DO NOT add information the speaker didn't say.
- DO NOT change the tone (don't make casual messages sound corporate).
- British spelling (favour, organisation, colour).
- If the speaker said an Indian English idiom ("do the needful", "PFA", "revert", "kindly"), keep it — these are correct English in Indian context.

CRITICAL OUTPUT RULES:
- Output ONLY the cleaned text. Nothing else.
- No preamble like "Here is the polished version:" or "Sure,".
- No quotes around the output.
- No explanation, no notes, no markdown.
- If input is empty or unclear, output a single space.`;

// 2026-04-30: switched off gemini-2.5-flash-lite — Google tightened its
// free-tier daily quota to 20 req/day, which gets exhausted in minutes.
// gemini-2.5-flash has a separate, higher free-tier quota that survives
// real usage. Slightly higher latency (~3s vs ~2s) but quality is better.
// For launch with paying users, enable billing on AI Studio or swap to
// Anthropic Claude Haiku per CLAUDE.md's original tech-stack decision.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Audiences (v0.4.0) — hierarchy-aware tone generation. Indian work
// culture is hierarchical in a way no Western tool models. Same input
// to a senior, a peer, and a junior should produce DIFFERENT rewrites.
//
// Output schema stays { professional, concise, friendly } regardless of
// audience — the meaning of each tone is what shifts. Client maps these
// keys to audience-specific labels:
//   auto:   Professional / Concise / Friendly
//   senior: Formal       / Brief    / Polite
//   peer:   Direct       / Brief    / Casual
//   junior: Clear        / Brief    / Encouraging
type Audience = "auto" | "senior" | "peer" | "junior";

const AUDIENCE_GUIDANCE: Record<Audience, string> = {
  auto:
    "AUDIENCE: not specified — pick the most useful three tones for the input. Default behaviour: " +
    "professional = polished business English suitable for any work context; " +
    "concise = shortest version preserving intent; " +
    "friendly = warm and conversational, still professional.",
  senior:
    "AUDIENCE: this message is going to a SENIOR (boss, manager, client, external stakeholder, government official). " +
    "All three rewrites must be respectful and audience-appropriate. " +
    "professional → fully formal. Use 'could you', 'kindly', 'I would appreciate', 'at your earliest convenience'. No contractions. Use complete sentences. " +
    "concise → brief but still respectful. Drop filler, never drop politeness. Keep 'please' and 'thank you'. " +
    "friendly → warm but deferential. Acknowledge the reader's seniority. Avoid casual register. No slang, no exclamation marks beyond one. " +
    "Avoid: 'guys', 'hey', 'sup', 'thanks!', exclamation marks, emojis. Use British spelling.",
  peer:
    "AUDIENCE: this message is going to a PEER (colleague at similar level, teammate, cross-functional partner). " +
    "Direct and efficient — they're busy too. " +
    "professional → clean, direct, no over-formality. Drop unnecessary 'kindly' and 'please'. Use 'can you' (not 'could you'). " +
    "concise → terse and action-focused. Bullet-point structure if multiple items. " +
    "friendly → casual and warm. 'Hey', contractions, even one well-placed exclamation are fine. " +
    "Avoid: stiff formality, 'I would be most grateful', long throat-clearing openers. Use British spelling.",
  junior:
    "AUDIENCE: this message is going to a JUNIOR (direct report, intern, vendor you're managing). " +
    "Clear, action-oriented, kind. State expectations directly without being condescending. " +
    "professional → clear instructions. Lead with the ask. State deadlines explicitly. " +
    "concise → bullet-point action items. Numbers, deadlines, owners. " +
    "friendly → encouraging and warm. Acknowledge their effort. Tone signals 'I trust you'. " +
    "Avoid: passive voice that hides the ask, vague deadlines like 'soon', condescension. Use British spelling.",
};

// /rewrite supports two modes (v0.5.0):
//   - "rewrite": user has drafted text → rewrite into 3 tones (default).
//   - "reply":   user has selected an email/thread → DRAFT a reply in 3 tones.
//
// Reply mode is the bigger UX unlock — Alt+R generates from nothing
// instead of rewriting an existing draft. Same JSON output schema either
// way; the prompt branches significantly.
type RewriteMode = "rewrite" | "reply";

function buildSystemPrompt(audience: Audience, mode: RewriteMode = "rewrite"): string {
  if (mode === "reply") {
    return buildReplySystemPrompt(audience);
  }
  return `You are a professional writing assistant built for Indian English speakers writing business communication.

When given text to rewrite, return three distinct rewrites at three tones AND classify the language of the INPUT.

${AUDIENCE_GUIDANCE[audience]}

Universal tone rules (always apply, regardless of audience):
- Preserve the user's intent and meaning exactly. Never add facts.
- Convert Hinglish input to clean English automatically.
- Recognise and improve Indian English idioms ("do the needful", "PFA", "revert back", "prepone") without being condescending — just write the better version.
- Default to British English spelling (favour, organisation, colour) — Indian convention.
- Each tone must read as a complete, self-contained rewrite — not a fragment, not a continuation.
- Each of the three values must be different from the others.

Language detection (the "detected_language" field):
- "english" — text is fully English. Indian English idioms ("do the needful", "PFA", "revert back", "kindly", "prepone") DO NOT count as Hinglish — they are English written by Indian speakers. Most input falls here.
- "hinglish" — text is primarily romanised Hindi. Examples: "kya haal hai", "mera kaam ho gaya". Even if a few English connector words are mixed in, classify as "hinglish" if the core sentence structure or majority of content words are Hindi.
- "mixed" — meaningful chunks in BOTH English and romanised Hindi. Example: "Sir please send the report jaldi" or "Looking forward to the meeting yaar". A single Hindi loanword in otherwise English text counts as "mixed".

When in doubt between "english" and "mixed", prefer "english" (avoid false positives — common surnames, place names, and Indian English idioms are NOT Hindi).

Output JSON only. No markdown, no preamble, no explanation.`;
}

// Reply-mode system prompt. Input is an email / thread / message the user
// received; output is THREE distinct REPLIES in three tones, adapted to
// audience. The hard constraint: don't fabricate facts. If the user
// would need to fill in specific information (a date, a number, a name),
// leave a `[bracketed placeholder]` for them.
function buildReplySystemPrompt(audience: Audience): string {
  return `You are drafting a REPLY to an email or message for an Indian professional.

The user has selected the message they received. Your job: write what THEY should send back. Three distinct drafts in three tones.

${AUDIENCE_GUIDANCE[audience]}

REPLY MODE RULES (these override the rewrite-mode rules):
- The input is the message being REPLIED TO. Do not rewrite or summarise it. Write the response.
- Each output is a complete reply, ready to paste into the user's email/chat client. Include greeting + body + sign-off appropriate to the tone.
- Address the sender's main asks/questions/concerns directly. If they asked three things, your reply should address all three (or acknowledge each).
- Do not fabricate facts. If the reply needs information the user must supply (a specific date, a number, a name, a confirmation), leave a clear bracketed placeholder like [confirm date], [your answer], or [name of contact].
- Detect the original sender's language. The reply is ALWAYS in clean professional English regardless of the input language (Hindi/Hinglish input → English reply).
- Keep replies tight. Senior recipients still get formal openers like "Thank you for your email" or "Hi <name>,". Peer/junior replies can drop straight into the substance.
- Tone differentiation:
  - "professional" → polished, full sentences, complete reply. Greeting + body + sign-off.
  - "concise" → as short as possible while still answering. May omit pleasantries entirely if the audience allows.
  - "friendly" → conversational, warm, may use contractions. Still answers the actual asks.

Universal rules (still apply):
- British spelling (favour, organisation, colour).
- Recognise Indian English idioms — they're correct, don't "fix" them in the input or avoid them in the output.

Language detection ("detected_language" field) — describes the language of the INPUT, not the output:
- "english", "hinglish", or "mixed" per the same rules as rewrite mode.

Output JSON only. Same four keys: professional, concise, friendly, detected_language. No markdown, no preamble, no explanation.`;
}

// Default prompt (audience=auto, mode=rewrite) — kept as a stable export
// for any code path that doesn't pass hints (legacy /landing-rewrite, etc).
const SYSTEM_PROMPT = buildSystemPrompt("auto");

// Gemini's structured-output schema. Forces a JSON object with the four keys
// below. Combined with responseMimeType, this means the model literally cannot
// return markdown fences or trailing prose.
//
// detected_language uses an enum so the model can't return arbitrary values.
const REWRITE_SCHEMA = {
  type: "object",
  properties: {
    professional: { type: "string" },
    concise: { type: "string" },
    friendly: { type: "string" },
    detected_language: { type: "string", enum: ["english", "hinglish", "mixed"] },
  },
  required: ["professional", "concise", "friendly", "detected_language"],
} as const;

// Origins allowed to hit /razorpay/* (creates/verifies real payments).
// /rewrite stays origin-open because the Tauri WebView2 sends a "tauri://"
// origin that browsers can't replicate, and per-IP rate-limiting now
// covers the abuse vector that wide-open CORS used to enable.
const RAZORPAY_ALLOWED_ORIGINS = new Set<string>([
  "https://web-three-omega-81.vercel.app",
  "https://web-hypnoplayzz-hypnoplayzzs-projects.vercel.app",
  "https://web-hypnoplayzzs-projects.vercel.app",
  "https://likho.ai",
  "https://www.likho.ai",
  "http://localhost:3000",
]);

function corsHeaders(request: Request, lockToAllowedOrigins = false): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  let allow = "*";
  if (lockToAllowedOrigins) {
    allow = RAZORPAY_ALLOWED_ORIGINS.has(origin) ? origin : "";
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

// Backwards-compat alias for endpoints that don't need origin-locking.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type DetectedLanguage = "english" | "hinglish" | "mixed";

interface Rewrites {
  professional: string;
  concise: string;
  friendly: string;
  detected_language: DetectedLanguage;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const lockOrigin = url.pathname.startsWith("/razorpay/");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request, lockOrigin) });
    }

    // Founding-member waitlist endpoints (Day 8).
    if (url.pathname === "/waitlist" && request.method === "POST") {
      return handleWaitlistPost(request, env);
    }
    if (url.pathname === "/waitlist/count" && request.method === "GET") {
      return handleWaitlistCount(env);
    }

    // Live count of paid founding-member spots — drives the "X of 50 left"
    // counter on the landing page so visitors see real social proof
    // instead of a hardcoded baseline.
    if (url.pathname === "/founding/count" && request.method === "GET") {
      return handleFoundingCount(request, env);
    }

    // Health check (v0.4.1). Hit by the cron pre-warm trigger every 5
    // minutes so cold-starts don't delay the first user request of the
    // day. Also useful for uptime monitoring.
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(
        JSON.stringify({ ok: true, ts: Date.now() }),
        { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
      );
    }

    // Landing-page demo rewrite (Day 9). Same model + system prompt as
    // /rewrite, but rate-limited per IP per day so it can't be abused as
    // a free Gemini proxy by scrapers.
    if (url.pathname === "/landing-rewrite" && request.method === "POST") {
      return handleLandingRewrite(request, env);
    }

    if (url.pathname === "/rewrite" && request.method === "POST") {
      return handleRewrite(request, env, "app");
    }

    // Voice mode (Day 10) — Pro+ feature. Multipart upload of an audio
    // blob; server transcribes via Whisper, polishes via Claude Haiku 4.5,
    // and returns { transcript, polished, language }. Gated server-side so
    // a free or Pro user can't bypass by hand-crafting the request.
    if (url.pathname === "/voice" && request.method === "POST") {
      return handleVoice(request, env);
    }

    // Razorpay checkout. Five endpoints:
    //   POST /razorpay/order             — create order (founding-member, one-time)
    //   POST /razorpay/subscription      — create subscription (Pro, monthly recurring)
    //   POST /razorpay/subscription_pro_plus — create Pro+ subscription (₹499/mo, voice mode)
    //   POST /razorpay/verify            — verify signature for either flow
    //   POST /razorpay/webhook           — Razorpay-initiated lifecycle events
    //                                      (subscription.charged / cancelled / failed, etc.)
    if (url.pathname === "/razorpay/order" && request.method === "POST") {
      return handleRazorpayCreateOrder(request, env);
    }
    if (url.pathname === "/razorpay/subscription" && request.method === "POST") {
      return handleRazorpayCreateSubscription(request, env);
    }
    if (url.pathname === "/razorpay/subscription_pro_plus" && request.method === "POST") {
      return handleRazorpayCreateProPlusSubscription(request, env);
    }
    if (url.pathname === "/razorpay/verify" && request.method === "POST") {
      return handleRazorpayVerify(request, env);
    }
    if (url.pathname === "/razorpay/webhook" && request.method === "POST") {
      return handleRazorpayWebhook(request, env);
    }

    // License check — desktop app calls this with the user's email after
    // they "sign in" to bypass the 5-rewrite demo cap. Looks up paid records
    // in KV and reports the tier. Until Clerk JWT auth lands this is the
    // simplest paid-user gating we can do.
    if (url.pathname === "/license/check" && request.method === "POST") {
      return handleLicenseCheck(request, env);
    }

    // Admin: send a test welcome email to the address you used to register
    // your Resend account. Useful for verifying RESEND_API_KEY + sandbox
    // delivery without making a real ₹4,900 payment. No auth right now —
    // anyone can fire one to a Resend-verified email, which is harmless.
    if (url.pathname === "/admin/test-email" && request.method === "POST") {
      return handleAdminTestEmail(request, env);
    }

    return json({ error: "not_found" }, 404);
  },

  // Cron pre-warm (v0.4.1). Fires every 5 minutes per wrangler.toml's
  // [triggers] crons. The Worker doesn't actually need to *do* anything
  // — even an empty scheduled handler keeps the v8 isolate warm for
  // ~30s, which is plenty to absorb the next genuine user request
  // without a cold start. Cost: free under Workers' cron quota.
  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // No-op. Presence of the handler + cron trigger is the whole point.
  },
};

// Shared rewrite implementation used by both /rewrite (the desktop app) and
// /landing-rewrite (the public marketing demo). The `source` tag goes into
// the cost-guard log so we can tell which surface burned tokens.
async function handleRewrite(
  request: Request,
  env: Env,
  source: "app" | "landing",
): Promise<Response> {
  // Body size guard before parsing — blocks denial-of-wallet via huge JSON.
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_REWRITE_BODY_BYTES) {
    return json({ error: "body_too_large", limit: MAX_REWRITE_BODY_BYTES }, 413);
  }

  // Per-IP daily cap on the desktop /rewrite endpoint. The landing demo path
  // already runs through handleLandingRewrite which has its own (lower) cap;
  // this cap fires only when source === "app".
  if (source === "app") {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const today = new Date().toISOString().slice(0, 10);
    const counterKey = `rw_ip:${ip}:${today}`;
    const used = parseInt((await env.LIKHO_KV.get(counterKey)) || "0", 10) || 0;
    if (used >= REWRITE_DAILY_CAP_PER_IP) {
      console.log(`[rewrite] rate_limited ip_chars=${ip.length} used=${used} src=${source}`);
      return json(
        {
          error: "rate_limited",
          message: `Daily rewrite limit (${REWRITE_DAILY_CAP_PER_IP}) reached.`,
        },
        429,
      );
    }
  }

  let body: { text?: unknown; audience?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return json({ error: "empty_text" }, 400);
  }
  if (text.length > 4000) {
    return json({ error: "text_too_long", limit: 4000 }, 400);
  }

  // Audience defaults to "auto" if missing or invalid. Server is the
  // gate — clients can't ask for a tier they shouldn't get because all
  // four audiences are universally available; this is purely a content
  // hint, not an entitlement check.
  const audienceRaw = typeof body.audience === "string" ? body.audience : "auto";
  const audience: Audience =
    audienceRaw === "senior" || audienceRaw === "peer" || audienceRaw === "junior"
      ? audienceRaw
      : "auto";

  // Mode (v0.5.0): "rewrite" rewrites the user's draft, "reply" drafts a
  // reply to a received message. Default rewrite for backwards compat
  // with v0.4.x clients that don't send the field.
  const modeRaw = typeof body.mode === "string" ? body.mode : "rewrite";
  const mode: RewriteMode = modeRaw === "reply" ? "reply" : "rewrite";

  // ---- Cache lookup (v0.4.1+) ----
  // Cache key includes mode so reply and rewrite for the same input
  // don't collide (different system prompts → different valid outputs).
  // Skip cache for short text — overhead isn't worth it.
  const cacheable = text.length >= REWRITE_CACHE_MIN_CHARS;
  const cacheKey = cacheable ? await rewriteCacheKey(text, audience, mode) : null;
  if (cacheKey) {
    const cached = await env.LIKHO_KV.get(cacheKey, "json");
    if (cached && isCachedRewrites(cached)) {
      console.log(
        `[gemini] cache_hit chars=${text.length} aud=${audience} src=${source}`,
      );
      // Still count the call against the per-IP daily cap — user got a
      // rewrite, even if it cost us nothing.
      if (source === "app") {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const today = new Date().toISOString().slice(0, 10);
        const counterKey = `rw_ip:${ip}:${today}`;
        const used = parseInt((await env.LIKHO_KV.get(counterKey)) || "0", 10) || 0;
        await env.LIKHO_KV.put(counterKey, String(used + 1), {
          expirationTtl: 60 * 60 * 26,
        });
      }
      return json(cached);
    }
  }

  // ---- Provider chain (v0.4.1+) ----
  // Try Gemini first (structured output, cheaper, faster). Fall back to
  // Workers AI Llama 3.3 70B on quota / 5xx — slightly less reliable on
  // strict JSON but available when Gemini's daily quota is exhausted.
  let provider: "gemini" | "workers_ai" | "error" = "gemini";
  let rewrites: Rewrites | null = null;
  const startedAt = Date.now();

  rewrites = await callGemini(text, audience, mode, env, source);
  let elapsed = Date.now() - startedAt;

  if (!rewrites && env.AI) {
    console.log(
      `[rewrite] gemini_failed_fallback_to_workers_ai after_ms=${elapsed} src=${source} mode=${mode}`,
    );
    provider = "workers_ai";
    const wStart = Date.now();
    rewrites = await callWorkersAIRewrite(text, audience, mode, env);
    elapsed = Date.now() - wStart;
  }

  if (!rewrites) {
    provider = "error";
    console.log(`[rewrite] all_providers_failed after_ms=${elapsed} src=${source}`);
    return json({ error: "upstream_error" }, 502);
  }

  console.log(
    `[${provider}] ok after_ms=${elapsed}` +
      ` p=${rewrites.professional.length}` +
      ` c=${rewrites.concise.length}` +
      ` f=${rewrites.friendly.length}` +
      ` lang=${rewrites.detected_language}` +
      ` aud=${audience}` +
      ` mode=${mode}` +
      ` src=${source}`,
  );

  // Increment the per-IP counter on successful rewrites for the desktop
  // path. Errors (validation / Gemini fail) intentionally don't burn quota.
  if (source === "app") {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const today = new Date().toISOString().slice(0, 10);
    const counterKey = `rw_ip:${ip}:${today}`;
    const used = parseInt((await env.LIKHO_KV.get(counterKey)) || "0", 10) || 0;
    await env.LIKHO_KV.put(counterKey, String(used + 1), {
      expirationTtl: 60 * 60 * 26,
    });
  }

  // Write to cache for future requests. Fire-and-forget — if KV write
  // fails we still return the rewrite to the user, just lose the cache
  // entry.
  if (cacheKey) {
    env.LIKHO_KV.put(cacheKey, JSON.stringify(rewrites), {
      expirationTtl: REWRITE_CACHE_TTL_S,
    }).catch((e) => console.log(`[gemini] cache_write_failed ${(e as Error).message}`));
  }

  return json(rewrites);
}

// Primary rewrite provider — Gemini Flash 2.5 with structured-output
// schema. Returns null on any failure (network, non-2xx, parse error)
// so the caller can fall through to the Workers AI fallback.
async function callGemini(
  text: string,
  audience: Audience,
  mode: RewriteMode,
  env: Env,
  source: "app" | "landing",
): Promise<Rewrites | null> {
  const startedAt = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(audience, mode) }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.6,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseSchema: REWRITE_SCHEMA,
        },
      }),
    });
  } catch {
    console.log(`[gemini] network_error after_ms=${Date.now() - startedAt} src=${source}`);
    return null;
  }
  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => "");
    console.log(
      `[gemini] error status=${upstream.status} after_ms=${Date.now() - startedAt} body_len=${errBody.length} src=${source}`,
    );
    return null;
  }
  const data = (await upstream.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  const parsed = parseRewrites(raw);
  if (!parsed) {
    console.log(`[gemini] parse_failed raw_len=${raw.length} src=${source}`);
  }
  return parsed;
}

// Fallback rewrite provider — Workers AI Llama 3.3 70B. No structured-
// output mode; we coerce JSON via prompt + defensive parse. Used when
// Gemini quota is exhausted or Gemini errors.
async function callWorkersAIRewrite(
  text: string,
  audience: Audience,
  mode: RewriteMode,
  env: Env,
): Promise<Rewrites | null> {
  const sysPrompt = buildSystemPrompt(audience, mode) + `

OUTPUT FORMAT (CRITICAL):
Return ONLY a JSON object with exactly these keys: "professional", "concise", "friendly", "detected_language".
No preamble. No markdown code fence. No explanation. Start the response with { and end with }.`;
  try {
    // Workers AI's response shape varies between models and tool-use modes.
    // Sometimes response is a string; sometimes it's nested under .result;
    // sometimes the API returns the full message array. Coerce defensively.
    const result = (await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as keyof AiModels,
      {
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: text },
        ],
        max_tokens: 1500,
        temperature: 0.6,
      },
    )) as unknown;

    // Workers AI sometimes returns the JSON pre-parsed when it detects
    // JSON-shaped output: { response: { professional, concise, ... }, ... }
    // Handle that case directly without re-stringifying.
    if (result && typeof result === "object") {
      const r = result as Record<string, unknown>;
      if (r.response && typeof r.response === "object" && !Array.isArray(r.response)) {
        if (isCachedRewrites(r.response)) {
          return r.response as Rewrites;
        }
      }
    }

    // Otherwise extract a string and parseRewrites it.
    const raw = extractWorkersAiText(result);
    if (!raw) {
      const dump = JSON.stringify(result).slice(0, 300);
      console.log(`[workers_ai_rewrite] no_text_in_response dump=${dump}`);
      return null;
    }
    const parsed = parseRewrites(raw.trim());
    if (!parsed) {
      console.log(
        `[workers_ai_rewrite] parse_failed raw_len=${raw.length} preview=${raw.slice(0, 80)}`,
      );
    }
    return parsed;
  } catch (e) {
    console.log(`[workers_ai_rewrite] error msg=${(e as Error).message}`);
    return null;
  }
}

// Workers AI returns text under one of several keys depending on model
// and version. This helper covers the shapes we've actually observed:
//   { response: "..." }           — older/simpler models
//   { result: "..." }             — some models
//   { result: { response: "..." }} — newer wrapped shape
//   { response: [...] }           — chat-with-tools shape (we extract text)
function extractWorkersAiText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.response === "string") return obj.response;
  if (typeof obj.result === "string") return obj.result;
  // Wrapped result.response
  if (obj.result && typeof obj.result === "object") {
    const inner = obj.result as Record<string, unknown>;
    if (typeof inner.response === "string") return inner.response;
  }
  // Array shape — pick the assistant text content if present
  if (Array.isArray(obj.response)) {
    for (const item of obj.response) {
      if (item && typeof item === "object") {
        const it = item as Record<string, unknown>;
        if (typeof it.content === "string") return it.content;
        if (typeof it.text === "string") return it.text;
      }
    }
  }
  return null;
}

// SHA-256 of `mode|audience|text`, first 16 bytes hex-encoded. Stable
// across Workers instances. Used as the KV cache key for /rewrite
// results. Mode is included so reply and rewrite for the same input
// don't collide (different system prompts → different valid outputs).
async function rewriteCacheKey(
  text: string,
  audience: Audience,
  mode: RewriteMode,
): Promise<string> {
  const data = new TextEncoder().encode(`${mode}|${audience}|${text}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `rewrite:cache:${hex}`;
}

// Type guard for cached rewrites — defends against malformed KV records
// (corrupted writes, schema migrations, etc).
function isCachedRewrites(value: unknown): value is Rewrites {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.professional === "string" &&
    typeof r.concise === "string" &&
    typeof r.friendly === "string" &&
    typeof r.detected_language === "string"
  );
}

// Day 9: landing-page demo route. Wraps handleRewrite() with a per-IP
// daily rate limit so the public marketing demo can't be abused as a
// free Gemini proxy by scrapers.
async function handleLandingRewrite(request: Request, env: Env): Promise<Response> {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const counterKey = `demo_ip:${ip}:${today}`;

  const rawCount = await env.LIKHO_KV.get(counterKey);
  const used = rawCount ? parseInt(rawCount, 10) || 0 : 0;
  if (used >= LANDING_DEMO_DAILY_CAP) {
    console.log(`[landing-rewrite] rate_limited ip_hash=${ip.length} used=${used}`);
    return json(
      {
        error: "rate_limited",
        message: `Daily demo limit (${LANDING_DEMO_DAILY_CAP}) reached. Try again tomorrow, or download the desktop app.`,
        cap: LANDING_DEMO_DAILY_CAP,
      },
      429,
    );
  }

  const result = await handleRewrite(request, env, "landing");
  // Only count successful calls. Errors (validation, upstream) shouldn't
  // burn the visitor's quota — same reasoning as the desktop demo cap.
  if (result.ok) {
    await env.LIKHO_KV.put(counterKey, String(used + 1), {
      expirationTtl: 60 * 60 * 26, // 26h — covers timezone wraparound
    });
  }
  return result;
}

// ---------- Voice mode (Day 10) ----------
//
// Pipeline (target <3s end-to-end for a 15s clip):
//   1. Server-side entitlement check — must be founding or Pro+ tier.
//   2. Whisper transcription (auto-detect language).
//   3. Claude Haiku 4.5 polish into clean professional English.
//   4. Return { transcript, polished, language } — client then runs the
//      polished text through /rewrite to get 3 tones.
//
// Privacy: audio bytes never persisted. Logs metadata only — duration_s,
// detected_language, transcript_chars, polish_ms — never the transcript or
// polished text. Per MISTAKES.md "Don't log user text content".
async function handleVoice(request: Request, env: Env): Promise<Response> {
  // Local response helper — voice mustn't origin-lock. The desktop calls
  // /voice from `https://tauri.localhost` (prod MSI) or
  // `http://localhost:1420` (dev), neither of which is in the Razorpay
  // origin allowlist. Origin-locking here returns `Access-Control-Allow-
  // Origin: ''` which browsers reject before the request even fires —
  // surfaces as "Couldn't reach the AI service" client-side.
  // Abuse protection is the per-email VOICE_DAILY_CAP_PER_EMAIL.
  const r = (payload: unknown, status: number) =>
    json(payload, status, request, false);

  // Either OpenAI Whisper (paid) or Workers AI Whisper (free, default).
  // Workers AI is bound automatically via `[ai] binding = "AI"` in
  // wrangler.toml, so the only way `env.AI` is undefined is if someone
  // edits the binding out — fail fast in that case.
  if (!env.OPENAI_API_KEY && !env.AI) {
    console.log("[voice] no_asr_provider_configured");
    return r({ error: "voice_not_configured" }, 500);
  }

  // Body size guard before parsing — Whisper accepts up to 25MB but our
  // ceiling is tighter (8MB ≈ 70s of mono 48kHz WAV) to keep CPU and
  // bandwidth bounded.
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > VOICE_MAX_AUDIO_BYTES) {
    return r({ error: "audio_too_large", limit: VOICE_MAX_AUDIO_BYTES }, 413);
  }

  // Two body shapes accepted:
  //   1. JSON: { email, audio_b64 } — preferred. WebView2 has flaky
  //      multipart upload behaviour from Tauri 2 (request gets dropped
  //      before leaving the OS network stack), so v0.3.1+ desktop
  //      sends JSON. base64 inflates payload ~33% but eliminates the
  //      multipart-from-Tauri failure mode.
  //   2. multipart/form-data: { email, audio } — kept for v0.3.0
  //      installs that already shipped, and for curl-based testing.
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  let email = "";
  let audioBlob: Blob;

  if (contentType.startsWith("application/json")) {
    let body: { email?: unknown; audio_b64?: unknown };
    try {
      body = await request.json();
    } catch {
      return r({ error: "invalid_json" }, 400);
    }
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !isValidEmail(email)) {
      return r({ error: "invalid_email" }, 400);
    }
    if (typeof body.audio_b64 !== "string" || !body.audio_b64) {
      return r({ error: "missing_audio" }, 400);
    }
    let bytes: Uint8Array;
    try {
      // atob → binary string → Uint8Array.
      const bin = atob(body.audio_b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return r({ error: "invalid_base64" }, 400);
    }
    if (bytes.length === 0) {
      return r({ error: "empty_audio" }, 400);
    }
    if (bytes.length > VOICE_MAX_AUDIO_BYTES) {
      return r({ error: "audio_too_large", limit: VOICE_MAX_AUDIO_BYTES }, 413);
    }
    audioBlob = new Blob([bytes], { type: "audio/wav" });
  } else {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return r({ error: "invalid_multipart" }, 400);
    }
    email =
      typeof formData.get("email") === "string"
        ? (formData.get("email") as string).trim().toLowerCase()
        : "";
    const audio = formData.get("audio");
    if (!email || !isValidEmail(email)) {
      return r({ error: "invalid_email" }, 400);
    }
    if (
      !audio ||
      typeof audio === "string" ||
      typeof (audio as Blob).size !== "number" ||
      typeof (audio as Blob).arrayBuffer !== "function"
    ) {
      return r({ error: "missing_audio" }, 400);
    }
    audioBlob = audio as Blob;
    if (audioBlob.size === 0) {
      return r({ error: "empty_audio" }, 400);
    }
    if (audioBlob.size > VOICE_MAX_AUDIO_BYTES) {
      return r({ error: "audio_too_large", limit: VOICE_MAX_AUDIO_BYTES }, 413);
    }
  }

  // Entitlement check. Voice mode is Pro+ only. Founding members are
  // grandfathered in (lifetime access to all features). Plain Pro
  // subscribers (₹299/mo, no voice) get a 403 + upgrade nudge.
  const tier = await lookupTier(email, env);
  const entitled = tier === "founding" || tier === "pro_plus";
  if (!entitled) {
    console.log(`[voice] gated tier=${tier} email_chars=${email.length}`);
    return r(
      {
        error: "pro_plus_required",
        message:
          "Voice mode is part of Likho Pro+. Upgrade to unlock — founding members already have it.",
        upgrade_url: "https://likho.ai/#pricing",
        current_tier: tier,
      },
      403,
    );
  }

  // Per-email daily cap. Protects against a compromised paid email burning
  // the OpenAI bill — 100 voice clips/day is well above any real user.
  const today = new Date().toISOString().slice(0, 10);
  const counterKey = `voice_email:${email}:${today}`;
  const used = parseInt((await env.LIKHO_KV.get(counterKey)) || "0", 10) || 0;
  if (used >= VOICE_DAILY_CAP_PER_EMAIL) {
    console.log(`[voice] rate_limited used=${used} email_chars=${email.length}`);
    return r(
      {
        error: "voice_daily_cap",
        message: `Daily voice limit (${VOICE_DAILY_CAP_PER_EMAIL}) reached. Resets at midnight UTC.`,
      },
      429,
    );
  }

  const startedAt = Date.now();

  // ---- 1. Transcription ----
  let transcript = "";
  let detectedLang = "unknown";
  let durationS = 0;
  let asrProvider: "openai" | "workers_ai" = "openai";
  let whisperMs = 0;

  if (env.OPENAI_API_KEY) {
    // Paid path: OpenAI Whisper-1.
    const whisperFd = new FormData();
    whisperFd.append("file", audioBlob, "voice.wav");
    whisperFd.append("model", "whisper-1");
    whisperFd.append("response_format", "verbose_json");

    let whisperRes: Response;
    try {
      whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: whisperFd,
      });
    } catch (e) {
      console.log(`[voice] whisper_network_error msg=${(e as Error).message}`);
      return r({ error: "whisper_unreachable" }, 502);
    }
    whisperMs = Date.now() - startedAt;
    if (!whisperRes.ok) {
      const errBody = await whisperRes.text().catch(() => "");
      console.log(
        `[voice] whisper_error status=${whisperRes.status} after_ms=${whisperMs} body=${errBody.slice(0, 200)}`,
      );
      return r({ error: "whisper_error", status: whisperRes.status }, 502);
    }
    const whisperData = (await whisperRes.json()) as {
      text?: string;
      language?: string;
      duration?: number;
    };
    transcript = (whisperData.text || "").trim();
    detectedLang = whisperData.language || "unknown";
    durationS = whisperData.duration ?? 0;
  } else {
    // Free path: Workers AI whisper-large-v3-turbo.
    // IMPORTANT: this model takes audio as a base64-encoded string, not a
    // number[] like the older @cf/openai/whisper model. Passing number[]
    // returns a 502. Output shape: { text, language?, words?, vtt? }.
    asrProvider = "workers_ai";
    const audioBytes = new Uint8Array(await audioBlob.arrayBuffer());
    try {
      // btoa can't take String.fromCharCode(...big array) (stack overflow),
      // so we chunk into 32KB blocks. Same trick MDN recommends for
      // arrayBuffer-to-base64 in browsers.
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < audioBytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(audioBytes.subarray(i, i + chunkSize)),
        );
      }
      const audioBase64 = btoa(binary);
      const whisperResult = (await env.AI.run(
        "@cf/openai/whisper-large-v3-turbo" as keyof AiModels,
        { audio: audioBase64 },
      )) as { text?: string; language?: string };
      whisperMs = Date.now() - startedAt;
      transcript = (whisperResult.text || "").trim();
      detectedLang = whisperResult.language || "unknown";
      // whisper-large-v3-turbo doesn't return duration. Estimate from
      // bytes — close enough for logging only.
      durationS = 0;
    } catch (e) {
      console.log(`[voice] workers_ai_whisper_error msg=${(e as Error).message}`);
      return r({ error: "whisper_error" }, 502);
    }
  }

  if (!transcript) {
    console.log(
      `[voice] empty_transcript asr=${asrProvider} whisper_ms=${whisperMs} duration_s=${durationS}`,
    );
    return r({ error: "empty_transcript" }, 422);
  }

  // ---- 2. Polish ----
  // Provider precedence (highest quality first):
  //   1. ANTHROPIC_API_KEY → Claude Haiku 4.5 (best instruction-following)
  //   2. GEMINI_API_KEY    → Gemini Flash 2.5 (already wired for /rewrite,
  //                          tuned for our Indian-English tone, free at
  //                          AI Studio quota)
  //   3. env.AI            → Workers AI Llama 3.3 70B (LAST RESORT —
  //                          tends to over-rewrite and break the speaker's
  //                          voice; only used if neither key is set)
  //   4. fallback          → return raw transcript unchanged
  //
  // SKIP-POLISH HEURISTIC (v0.4.1): if the transcript is already clean
  // English with no fillers, the LLM can only make it worse. Returning
  // the raw transcript is faster and cheaper. Saves ~50% of polish calls
  // for English-speaking users.
  let polished = "";
  let polishProvider:
    | "anthropic"
    | "gemini"
    | "workers_ai"
    | "fallback"
    | "skipped_clean" = "fallback";
  const polishStartedAt = Date.now();

  // Helper: defensively strip preamble that some models add despite the
  // "output ONLY" rule. Common patterns: "Here is...", "Sure, ...",
  // wrapping quotes, leading bullet points.
  const cleanPolishOutput = (text: string): string => {
    let t = text.trim();
    // Drop leading code-fence (``` or ```text)
    t = t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "");
    // Drop wrapping quotes
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1);
    }
    // Drop common preambles followed by colon/newline.
    t = t.replace(
      /^(here(?:'s| is)|sure(?:,|!|\.)?|okay(?:,|!|\.)?|alright(?:,|!|\.)?)[^\n:]{0,80}[:\n]\s*/i,
      "",
    );
    return t.trim();
  };

  // Skip-polish heuristic — if transcript is clean English with no
  // fillers, return it as-is. The LLM can only make it worse, and we
  // save the polish API call entirely (~50% of clips for English users).
  const FILLER_RE =
    /\b(um+|uh+|like|you know|i mean|sort of|kind of|basically|literally|so yeah|matlab|yaani|haan toh)\b/i;
  const isEnglishCode = detectedLang === "en" || detectedLang === "english";
  const looksClean = isEnglishCode && !FILLER_RE.test(transcript) && transcript.length >= 4;

  if (looksClean) {
    polishProvider = "skipped_clean";
    polished = transcript;
  } else if (env.ANTHROPIC_API_KEY) {
    polishProvider = "anthropic";
    try {
      const polishedRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: VOICE_POLISH_PROMPT,
          messages: [{ role: "user", content: transcript }],
        }),
      });
      if (polishedRes.ok) {
        const polishedData = (await polishedRes.json()) as {
          content?: Array<{ type?: string; text?: string }>;
        };
        polished =
          cleanPolishOutput(polishedData.content?.[0]?.text || "") || transcript;
      } else {
        const errBody = await polishedRes.text().catch(() => "");
        console.log(
          `[voice] anthropic_error status=${polishedRes.status} body=${errBody.slice(0, 200)}`,
        );
        polishProvider = "fallback";
        polished = transcript;
      }
    } catch (e) {
      console.log(`[voice] anthropic_network_error msg=${(e as Error).message}`);
      polishProvider = "fallback";
      polished = transcript;
    }
  } else if (env.GEMINI_API_KEY) {
    // Free path: Gemini Flash 2.5. Same model + key already used by
    // /rewrite. Strict instruction-following + good Hinglish handling
    // make it materially better than Llama 3.3 for this step. Direct
    // call to Gemini API (not env.AI binding) since we own the key.
    polishProvider = "gemini";
    try {
      const geminiRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": env.GEMINI_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: VOICE_POLISH_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: transcript }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.3, // low temp — we want *minimal* rewriting
            thinkingConfig: { thinkingBudget: 0 },
            // No responseSchema here — we want plain text out, not JSON.
          },
        }),
      });
      if (geminiRes.ok) {
        const geminiData = (await geminiRes.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const raw = (geminiData.candidates?.[0]?.content?.parts ?? [])
          .map((p) => p.text ?? "")
          .join("")
          .trim();
        polished = cleanPolishOutput(raw) || transcript;
      } else {
        const errBody = await geminiRes.text().catch(() => "");
        console.log(
          `[voice] gemini_polish_error status=${geminiRes.status} body=${errBody.slice(0, 200)}`,
        );
        polishProvider = "fallback";
        polished = transcript;
      }
    } catch (e) {
      console.log(`[voice] gemini_polish_network_error msg=${(e as Error).message}`);
      polishProvider = "fallback";
      polished = transcript;
    }
  } else if (env.AI) {
    // Last-resort free path: Workers AI Llama 3.3 70B. Tends to
    // over-rewrite — kept as a fallback only if no other provider exists.
    polishProvider = "workers_ai";
    try {
      const llamaResult = (await env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as keyof AiModels,
        {
          messages: [
            { role: "system", content: VOICE_POLISH_PROMPT },
            { role: "user", content: transcript },
          ],
          max_tokens: 1024,
          temperature: 0.3,
        },
      )) as { response?: string };
      polished = cleanPolishOutput(llamaResult.response || "") || transcript;
    } catch (e) {
      console.log(`[voice] workers_ai_polish_error msg=${(e as Error).message}`);
      polishProvider = "fallback";
      polished = transcript;
    }
  } else {
    // No polish provider available — return raw transcript. Better than
    // a 500 since the user still gets usable text.
    polishProvider = "fallback";
    polished = transcript;
  }

  const polishMs = Date.now() - polishStartedAt;
  const totalMs = Date.now() - startedAt;
  console.log(
    `[voice] ok asr=${asrProvider} polish=${polishProvider} total_ms=${totalMs}` +
      ` whisper_ms=${whisperMs} polish_ms=${polishMs}` +
      ` duration_s=${durationS} lang=${detectedLang}` +
      ` transcript_chars=${transcript.length} polished_chars=${polished.length}` +
      ` email_chars=${email.length}`,
  );

  await env.LIKHO_KV.put(counterKey, String(used + 1), {
    expirationTtl: 60 * 60 * 26,
  });

  return r(
    {
      transcript,
      polished,
      language: detectedLang,
      duration_s: durationS,
      // Surface the providers used so the UI / logs / future ab-tests can
      // attribute quality differences. Not strictly needed by the client.
      asr_provider: asrProvider,
      polish_provider: polishProvider,
    },
    200,
  );
}

// Defensive parse: tolerates Gemini's structured output AND Llama's
// freeform-with-preamble output. Strategy:
//   1. Try strict JSON.parse on the trimmed input (Gemini case).
//   2. Strip markdown code fences and retry.
//   3. Find the first '{' and last '}' and parse the slice between them
//      (handles "Here's the JSON: {...} Hope this helps!" patterns Llama
//      sometimes produces).
function parseRewrites(raw: string): Rewrites | null {
  const cleaned = raw.trim();
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  // Attempt 1: strict — Gemini structured output should land here.
  let parsed = tryParse(cleaned);

  // Attempt 2: strip markdown fences.
  if (!parsed) {
    const fenceless = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    parsed = tryParse(fenceless);
  }

  // Attempt 3: find { ... } block — handles Llama's preamble/postamble.
  if (!parsed) {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last > first) {
      parsed = tryParse(cleaned.slice(first, last + 1));
    }
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const p = typeof obj.professional === "string" ? obj.professional.trim() : "";
  const c = typeof obj.concise === "string" ? obj.concise.trim() : "";
  const f = typeof obj.friendly === "string" ? obj.friendly.trim() : "";
  if (!p || !c || !f) return null;

  // Default to "english" if missing or unknown — better to silently
  // treat as English (no badge) than to crash the rewrite flow.
  const langRaw = typeof obj.detected_language === "string" ? obj.detected_language : "";
  const detected_language: DetectedLanguage =
    langRaw === "hinglish" || langRaw === "mixed" ? langRaw : "english";

  return { professional: p, concise: c, friendly: f, detected_language };
}

function json(
  payload: unknown,
  status = 200,
  request?: Request,
  lockOrigin = false,
): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (request) {
    Object.assign(headers, corsHeaders(request, lockOrigin));
  } else {
    Object.assign(headers, CORS_HEADERS);
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

// ---------- Waitlist (Day 8) ----------
//
// KV layout:
//   waitlist:_count            — string-encoded total entry count
//   waitlist:email:<email>     — JSON { email, position, ts }
//
// Pre-launch validation only. Race conditions on concurrent inserts are
// possible (KV has no atomic increment) but the cost is at most a few
// position-number duplicates which we don't surface to users. Day 9+
// migrates to Supabase with a real autoincrement column.

interface WaitlistEntry {
  email: string;
  position: number;
  ts: number;
}

async function handleWaitlistPost(request: Request, env: Env): Promise<Response> {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return json({ error: "invalid_email" }, 400);
  }

  const emailKey = `waitlist:email:${email}`;
  const existing = await env.LIKHO_KV.get(emailKey, "json");
  if (existing) {
    const entry = existing as WaitlistEntry;
    const total = await getCount(env);
    console.log(`[waitlist] duplicate email_chars=${email.length} pos=${entry.position}`);
    return json({ position: entry.position, total, already_listed: true });
  }

  const total = await getCount(env);
  if (total >= WAITLIST_CAP) {
    console.log(`[waitlist] full total=${total}`);
    return json({ error: "waitlist_full", total }, 409);
  }

  const newPosition = total + 1;
  const entry: WaitlistEntry = { email, position: newPosition, ts: Date.now() };
  await env.LIKHO_KV.put(emailKey, JSON.stringify(entry));
  await env.LIKHO_KV.put("waitlist:_count", String(newPosition));

  // Privacy: log the position and char-count, never the email.
  console.log(`[waitlist] new pos=${newPosition} email_chars=${email.length}`);
  return json({ position: newPosition, total: newPosition, already_listed: false });
}

async function handleWaitlistCount(env: Env): Promise<Response> {
  const total = await getCount(env);
  return json({ total, cap: WAITLIST_CAP, remaining: Math.max(0, WAITLIST_CAP - total) });
}

// Counts actual paid founding-member records, not waitlist entries. KV's
// list() is consistent within a single read, and 50 is well under the 1000
// pagination boundary, so a single call is enough.
//
// Edge-cached for 60s via the Cloudflare Cache API (v0.4.1) — the count
// only changes when someone pays, which is rare. Cuts KV reads ~99% on
// the busy landing page where this endpoint is polled by the
// FoundingSpotsBadge on every visitor mount.
async function handleFoundingCount(request: Request, env: Env): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request("https://likho-internal/founding-count", { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    // Re-attach CORS headers (caches.default strips them per spec); body
    // is already serialised JSON.
    const headers = new Headers(cached.headers);
    Object.assign(headers, CORS_HEADERS);
    return new Response(cached.body, { status: cached.status, headers });
  }

  const list = await env.LIKHO_KV.list({ prefix: "founding:payment:" });
  const paid = list.keys.length;
  const remaining = Math.max(0, FOUNDING_CAP - paid);
  const body = JSON.stringify({ paid, cap: FOUNDING_CAP, remaining, full: paid >= FOUNDING_CAP });

  // Build the cacheable response — only Content-Type + Cache-Control.
  // CORS headers go on the *return* response (added after) since the
  // browser-facing one needs them but the cached one doesn't have to.
  const cacheResp = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
  // waitUntil so the put doesn't block the response. Workers' cache.put
  // requires the response to be fresh; clone it.
  await cache.put(cacheKey, cacheResp.clone());

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

async function getCount(env: Env): Promise<number> {
  const raw = await env.LIKHO_KV.get("waitlist:_count");
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function isValidEmail(s: string): boolean {
  // Pragmatic check — RFC 5322 is too permissive in practice. We just want
  // to catch obvious typos before storing.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

// ---------- Razorpay Standard Checkout ----------
//
// Two-step flow: client calls /razorpay/order to create an order, opens the
// Razorpay modal with the returned order_id + key_id, then on success posts
// the three Razorpay-returned fields to /razorpay/verify which HMACs them.
//
// The amount is locked server-side (FOUNDING_AMOUNT_PAISE) so a tampered
// client can't initiate a ₹1 order. Only the email is caller-supplied and
// it's validated.
//
// KV layout for paid founding members:
//   founding:payment:<payment_id>  — JSON { email, amount, payment_id, order_id, ts }
//   founding:_count                — string-encoded total paid count

async function handleRazorpayCreateOrder(request: Request, env: Env): Promise<Response> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    console.log("[razorpay] missing_credentials");
    return json({ error: "razorpay_not_configured" }, 500, request, true);
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, request, true);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return json({ error: "invalid_email" }, 400, request, true);
  }

  // Hard-cap at 50 founding-member spots. Counted by listing actual paid
  // KV records — read-modify-write on a counter key would race under
  // concurrent traffic and could over-issue spots. KV list() is consistent
  // within a single read; founding-tier max is small so pagination isn't
  // a concern.
  const paidList = await env.LIKHO_KV.list({ prefix: "founding:payment:" });
  if (paidList.keys.length >= FOUNDING_CAP) {
    console.log(`[razorpay] founding_full count=${paidList.keys.length}`);
    return json(
      {
        error: "founding_full",
        message: "All 50 founding spots are taken. Welcome to Pro instead?",
      },
      409,
      request,
      true,
    );
  }

  // crypto.randomUUID gives a unique receipt even under burst concurrency
  // (Date.now() can collide within the same millisecond).
  const receipt = `founding_${crypto.randomUUID()}`;
  const auth = "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);

  let upstream: Response;
  try {
    upstream = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: FOUNDING_AMOUNT_PAISE,
        currency: FOUNDING_CURRENCY,
        receipt,
        notes: { email, plan: "founding_member_lifetime" },
      }),
    });
  } catch (e) {
    console.log(`[razorpay] order_network_error msg=${(e as Error).message}`);
    return json({ error: "razorpay_unreachable" }, 502, request, true);
  }

  if (upstream.status === 401 || upstream.status === 403) {
    console.log(`[razorpay] auth_error status=${upstream.status}`);
    return json({ error: "razorpay_auth_failed" }, 401, request, true);
  }
  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => "");
    console.log(`[razorpay] order_error status=${upstream.status} body=${errBody.slice(0, 200)}`);
    return json({ error: "razorpay_error", status: upstream.status }, 500, request, true);
  }

  const order = (await upstream.json()) as { id?: string; amount?: number; currency?: string };
  if (!order.id) {
    console.log("[razorpay] order_missing_id");
    return json({ error: "razorpay_bad_response" }, 502, request, true);
  }

  console.log(`[razorpay] order_created id=${order.id} email_chars=${email.length}`);
  return json(
    {
      order_id: order.id,
      amount: order.amount ?? FOUNDING_AMOUNT_PAISE,
      currency: order.currency ?? FOUNDING_CURRENCY,
      key_id: env.RAZORPAY_KEY_ID,
      receipt,
    },
    200,
    request,
    true,
  );
}

async function handleRazorpayCreateSubscription(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    console.log("[razorpay] missing_credentials");
    return json({ error: "razorpay_not_configured" }, 500, request, true);
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, request, true);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return json({ error: "invalid_email" }, 400, request, true);
  }

  const auth = "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);

  let upstream: Response;
  try {
    upstream = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: PRO_PLAN_ID,
        total_count: PRO_TOTAL_COUNT,
        customer_notify: 1,
        notes: { email, plan: "pro_monthly" },
      }),
    });
  } catch (e) {
    console.log(`[razorpay] subscription_network_error msg=${(e as Error).message}`);
    return json({ error: "razorpay_unreachable" }, 502, request, true);
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return json({ error: "razorpay_auth_failed" }, 401, request, true);
  }
  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => "");
    console.log(
      `[razorpay] subscription_error status=${upstream.status} body=${errBody.slice(0, 300)}`,
    );
    return json({ error: "razorpay_error", status: upstream.status }, 500, request, true);
  }

  const sub = (await upstream.json()) as { id?: string; status?: string };
  if (!sub.id) {
    return json({ error: "razorpay_bad_response" }, 502, request, true);
  }

  console.log(`[razorpay] subscription_created id=${sub.id} email_chars=${email.length}`);
  return json(
    {
      subscription_id: sub.id,
      plan_id: PRO_PLAN_ID,
      key_id: env.RAZORPAY_KEY_ID,
      status: sub.status ?? "created",
    },
    200,
    request,
    true,
  );
}

// Pro+ subscription (₹499/mo, voice mode + everything in Pro). Only enabled
// once RAZORPAY_PRO_PLUS_PLAN_ID is set as a Worker secret — until then,
// returns pro_plus_not_configured so the landing page can degrade gracefully.
async function handleRazorpayCreateProPlusSubscription(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return json({ error: "razorpay_not_configured" }, 500, request, true);
  }
  if (!env.RAZORPAY_PRO_PLUS_PLAN_ID) {
    console.log("[razorpay] pro_plus_plan_not_configured");
    return json(
      {
        error: "pro_plus_not_configured",
        message:
          "Pro+ checkout is launching shortly. Founding members already have voice mode included.",
      },
      503,
      request,
      true,
    );
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, request, true);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return json({ error: "invalid_email" }, 400, request, true);
  }

  const auth = "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);

  let upstream: Response;
  try {
    upstream = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: env.RAZORPAY_PRO_PLUS_PLAN_ID,
        total_count: PRO_PLUS_TOTAL_COUNT,
        customer_notify: 1,
        notes: { email, plan: "pro_plus_monthly" },
      }),
    });
  } catch (e) {
    console.log(`[razorpay] pro_plus_network_error msg=${(e as Error).message}`);
    return json({ error: "razorpay_unreachable" }, 502, request, true);
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return json({ error: "razorpay_auth_failed" }, 401, request, true);
  }
  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => "");
    console.log(
      `[razorpay] pro_plus_error status=${upstream.status} body=${errBody.slice(0, 300)}`,
    );
    return json({ error: "razorpay_error", status: upstream.status }, 500, request, true);
  }

  const sub = (await upstream.json()) as { id?: string; status?: string };
  if (!sub.id) {
    return json({ error: "razorpay_bad_response" }, 502, request, true);
  }

  console.log(`[razorpay] pro_plus_subscribed id=${sub.id} email_chars=${email.length}`);
  return json(
    {
      subscription_id: sub.id,
      plan_id: env.RAZORPAY_PRO_PLUS_PLAN_ID,
      key_id: env.RAZORPAY_KEY_ID,
      tier: "pro_plus",
      status: sub.status ?? "created",
    },
    200,
    request,
    true,
  );
}

async function handleRazorpayVerify(request: Request, env: Env): Promise<Response> {
  if (!env.RAZORPAY_KEY_SECRET) {
    return json({ error: "razorpay_not_configured" }, 500, request, true);
  }

  let body: {
    razorpay_order_id?: unknown;
    razorpay_subscription_id?: unknown;
    razorpay_payment_id?: unknown;
    razorpay_signature?: unknown;
    email?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, request, true);
  }

  const paymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const orderId = typeof body.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  const subscriptionId =
    typeof body.razorpay_subscription_id === "string" ? body.razorpay_subscription_id : "";

  if (!paymentId || !signature || (!orderId && !subscriptionId)) {
    return json({ error: "missing_fields" }, 400, request, true);
  }

  // Two signature schemes:
  //   Order        — HMAC(order_id        + "|" + payment_id, secret)
  //   Subscription — HMAC(payment_id      + "|" + subscription_id, secret)  ← reversed!
  const dataString = subscriptionId
    ? `${paymentId}|${subscriptionId}`
    : `${orderId}|${paymentId}`;

  const ok = await verifyRazorpaySignature(dataString, signature, env.RAZORPAY_KEY_SECRET);
  if (!ok) {
    console.log(
      `[razorpay] sig_mismatch payment=${paymentId} ${subscriptionId ? `sub=${subscriptionId}` : `order=${orderId}`}`,
    );
    return json({ error: "signature_mismatch" }, 400, request, true);
  }

  // Counts are derived via KV list() in the order/founding handlers, so
  // we don't maintain a counter key here. Eliminates the read-modify-write
  // race that could lose increments under concurrent verification.
  if (subscriptionId) {
    // Look up the subscription on Razorpay to determine its actual plan_id.
    // We can't trust the client's claim of which tier it bought — verify
    // via the source of truth so a user can't pay ₹299 and claim Pro+.
    let planId = "";
    try {
      const auth = "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
      const subRes = await fetch(
        `https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
        { headers: { Authorization: auth } },
      );
      if (subRes.ok) {
        const subData = (await subRes.json()) as { plan_id?: string };
        planId = subData.plan_id ?? "";
      } else {
        console.log(`[razorpay] sub_lookup_failed status=${subRes.status} sub=${subscriptionId}`);
      }
    } catch (e) {
      console.log(`[razorpay] sub_lookup_error msg=${(e as Error).message}`);
    }

    const isProPlus =
      !!env.RAZORPAY_PRO_PLUS_PLAN_ID && planId === env.RAZORPAY_PRO_PLUS_PLAN_ID;
    const tierKey = isProPlus ? "pro_plus" : "pro";
    const recordKey = `${tierKey}:subscription:${subscriptionId}`;
    const existing = await env.LIKHO_KV.get(recordKey);
    if (!existing) {
      await env.LIKHO_KV.put(
        recordKey,
        JSON.stringify({
          email: email || null,
          subscription_id: subscriptionId,
          first_payment_id: paymentId,
          plan_id: planId || null,
          tier: tierKey,
          ts: Date.now(),
        }),
      );
      console.log(
        `[razorpay] ${tierKey}_subscribed sub=${subscriptionId} plan=${planId} email_chars=${email.length}`,
      );
      // Welcome email. Await so the Worker doesn't terminate before the
      // POST completes — latency hit is acceptable post-payment (user sees
      // a spinner). Different copy for Pro vs Pro+.
      if (email) {
        if (isProPlus) {
          await sendProPlusWelcomeEmail(env, email, subscriptionId);
        } else {
          await sendProWelcomeEmail(env, email, subscriptionId);
        }
      }
    }
    return json(
      {
        ok: true,
        kind: "subscription",
        subscription_id: subscriptionId,
        tier: tierKey,
      },
      200,
      request,
      true,
    );
  }

  // Founding-member one-time order.
  const recordKey = `founding:payment:${paymentId}`;
  const existing = await env.LIKHO_KV.get(recordKey);
  if (!existing) {
    await env.LIKHO_KV.put(
      recordKey,
      JSON.stringify({
        email: email || null,
        amount: FOUNDING_AMOUNT_PAISE,
        currency: FOUNDING_CURRENCY,
        payment_id: paymentId,
        order_id: orderId,
        ts: Date.now(),
      }),
    );
    console.log(
      `[razorpay] founding_paid payment=${paymentId} email_chars=${email.length}`,
    );
    if (email) {
      await sendFoundingWelcomeEmail(env, email, paymentId);
    }
  }
  return json(
    { ok: true, kind: "order", payment_id: paymentId, order_id: orderId },
    200,
    request,
    true,
  );
}

// ---------- Razorpay Webhook (lifecycle events) ----------
//
// Razorpay POSTs here for: subscription.charged, subscription.cancelled,
// subscription.completed, subscription.halted, payment.failed, etc. We
// authenticate the webhook using HMAC-SHA256 of the *raw request body*
// against RAZORPAY_WEBHOOK_SECRET (separate from KEY_SECRET).
//
// Configure once in Razorpay dashboard:
//   Settings → Webhooks → Add → URL: https://<worker>/razorpay/webhook
//   → Active events: subscription.charged, subscription.cancelled,
//     subscription.completed, subscription.halted, payment.failed
//   → Secret: <pick a strong random string, also set as
//     RAZORPAY_WEBHOOK_SECRET on the Worker>
async function handleRazorpayWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    console.log("[webhook] secret_not_configured");
    // Accept-and-ignore so Razorpay doesn't retry while we're still wiring.
    return json({ ok: true, ignored: "no_secret" }, 200);
  }

  const sigHeader = request.headers.get("X-Razorpay-Signature") || "";
  // Read body as text so we can both HMAC the raw bytes and JSON.parse() it.
  const rawBody = await request.text();
  const ok = await verifyWebhookSignature(rawBody, sigHeader, env.RAZORPAY_WEBHOOK_SECRET);
  if (!ok) {
    console.log("[webhook] sig_mismatch");
    return json({ error: "signature_mismatch" }, 400);
  }

  let event: {
    event?: string;
    payload?: {
      subscription?: { entity?: { id?: string; status?: string } };
      payment?: { entity?: { id?: string; subscription_id?: string; status?: string } };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const eventType = event.event ?? "";
  const subId =
    event.payload?.subscription?.entity?.id ||
    event.payload?.payment?.entity?.subscription_id ||
    "";
  console.log(`[webhook] event=${eventType} sub=${subId}`);

  if (!subId) {
    // Non-subscription event we don't track yet (e.g. payment.failed for
    // a one-time order). Acknowledge so Razorpay stops retrying.
    return json({ ok: true });
  }

  // Subscription records live under either pro:subscription:* or
  // pro_plus:subscription:* depending on which plan was bought. Probe
  // both — whichever exists is the one to update.
  const proKey = `pro:subscription:${subId}`;
  const proPlusKey = `pro_plus:subscription:${subId}`;
  const proExisting = await env.LIKHO_KV.get(proKey);
  const proPlusExisting = await env.LIKHO_KV.get(proPlusKey);
  const recordKey = proPlusExisting ? proPlusKey : proKey;
  const existingRaw = proPlusExisting ?? proExisting;
  const existing = existingRaw ? JSON.parse(existingRaw) : {};

  switch (eventType) {
    case "subscription.charged": {
      // Successful monthly renewal — update last_charged_ts.
      existing.last_charged_ts = Date.now();
      existing.last_payment_id = event.payload?.payment?.entity?.id ?? null;
      existing.status = "active";
      break;
    }
    case "subscription.cancelled":
    case "subscription.halted":
    case "subscription.completed": {
      existing.status = "cancelled";
      existing.cancelled_ts = Date.now();
      break;
    }
    case "payment.failed": {
      existing.last_failure_ts = Date.now();
      existing.last_failure_payment_id = event.payload?.payment?.entity?.id ?? null;
      break;
    }
    default:
      // Unknown event — store nothing but acknowledge so Razorpay doesn't retry.
      return json({ ok: true, ignored: eventType });
  }

  // Defensive: if we got a webhook for a subscription we never recorded
  // (out-of-order with verify), seed the record so we don't lose state.
  if (!existing.subscription_id) {
    existing.subscription_id = subId;
    existing.ts = existing.ts ?? Date.now();
  }
  await env.LIKHO_KV.put(recordKey, JSON.stringify(existing));

  return json({ ok: true, event: eventType, subscription_id: subId });
}

async function verifyWebhookSignature(
  rawBody: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  // Webhook signatures use HMAC over the raw POST body (not a "data1|data2"
  // concat like the order/subscription verify flow).
  const sigBytes = hexToBytes(signatureHex);
  if (!sigBytes) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(rawBody));
}

// HMAC-SHA256 verification using Web Crypto. Razorpay returns the signature
// as lowercase hex; we hex-decode it and use crypto.subtle.verify, which
// performs a constant-time comparison.
async function verifyRazorpaySignature(
  data: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  const sigBytes = hexToBytes(signatureHex);
  if (!sigBytes) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

// ---------- License check ----------
//
// The desktop app's demo cap (5 rewrites lifetime) gates all users
// indiscriminately — including paying founding members and Pro subscribers.
// This endpoint lets the desktop client trade an email for its tier:
// founding-paid customers and Pro subscribers bypass the cap.
//
// "Trust" model: email-only is weak (anyone could enter someone else's email
// and unlock Pro). Acceptable for launch — Pro features aren't built yet, so
// the only thing being unlocked is "no demo cap." Real per-device licence
// keys land Day 11+ alongside Clerk auth.

interface FoundingPayment {
  email?: string | null;
  payment_id: string;
  ts: number;
}

interface ProSubscription {
  email?: string | null;
  subscription_id: string;
  status?: string;
  cancelled_ts?: number;
  ts: number;
}

type Tier = "free" | "pro" | "pro_plus" | "founding";

// Shared tier-resolution. Used by /license/check and /voice (entitlement
// gate). Walks the KV records — fine at launch scale. Switch to a
// by-email secondary index if we cross a few thousand paid users.
//
// Precedence: founding > pro_plus > pro > free. So a user who has both
// Pro+ AND a stale Pro subscription is reported as Pro+ (the better tier).
async function lookupTier(email: string, env: Env): Promise<Tier> {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return "free";

  // Founding members get everything for life.
  const foundingList = await env.LIKHO_KV.list({ prefix: "founding:payment:" });
  for (const k of foundingList.keys) {
    const record = await env.LIKHO_KV.get(k.name, "json");
    if (!record) continue;
    const r = record as FoundingPayment;
    if (r.email && r.email.toLowerCase() === cleaned) {
      return "founding";
    }
  }

  // Pro+ subscribers (₹499/mo, includes voice mode).
  const proPlusList = await env.LIKHO_KV.list({ prefix: "pro_plus:subscription:" });
  for (const k of proPlusList.keys) {
    const record = await env.LIKHO_KV.get(k.name, "json");
    if (!record) continue;
    const r = record as ProSubscription;
    if (r.email && r.email.toLowerCase() === cleaned && r.status !== "cancelled") {
      return "pro_plus";
    }
  }

  // Pro subscribers (₹299/mo, no voice mode).
  const proList = await env.LIKHO_KV.list({ prefix: "pro:subscription:" });
  for (const k of proList.keys) {
    const record = await env.LIKHO_KV.get(k.name, "json");
    if (!record) continue;
    const r = record as ProSubscription;
    if (r.email && r.email.toLowerCase() === cleaned && r.status !== "cancelled") {
      return "pro";
    }
  }

  return "free";
}

// Capability flags for a tier — keeps the desktop client from having to
// know the rules. Server is the single source of truth.
function entitlementsFor(tier: Tier): {
  unlimited_rewrites: boolean;
  voice_mode: boolean;
} {
  switch (tier) {
    case "founding":
      return { unlimited_rewrites: true, voice_mode: true };
    case "pro_plus":
      return { unlimited_rewrites: true, voice_mode: true };
    case "pro":
      return { unlimited_rewrites: true, voice_mode: false };
    case "free":
      return { unlimited_rewrites: false, voice_mode: false };
  }
}

async function handleLicenseCheck(request: Request, env: Env): Promise<Response> {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return json({ error: "invalid_email", tier: "free" }, 400);
  }

  const tier = await lookupTier(email, env);
  const entitlements = entitlementsFor(tier);
  console.log(`[license] tier=${tier} email_chars=${email.length}`);

  // Stable response shape for the desktop client to cache:
  //   { tier, valid, entitlements: { unlimited_rewrites, voice_mode } }
  // Older clients that only look at .tier and .valid keep working;
  // newer clients (v0.3.0+) read entitlements.voice_mode to gate Alt+V.
  return json({
    tier,
    valid: tier !== "free",
    entitlements,
  });
}

// ---------- Email (transactional, via Resend) ----------
//
// Sandbox sender (onboarding@resend.dev) only delivers to the email that
// owns the Resend account. To deliver to real customers, verify a domain
// in the Resend dashboard, add the SPF/DKIM/DMARC DNS records, then change
// EMAIL_FROM at the top of this file to e.g. "Likho <hello@likho.ai>".

interface ResendError {
  statusCode?: number;
  message?: string;
  name?: string;
}

async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not configured — skipping send");
    return { ok: false, error: "not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
    });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as ResendError;
      console.log(
        `[email] send_failed status=${res.status} reason=${errBody.message ?? errBody.name ?? "unknown"} to_chars=${to.length}`,
      );
      return { ok: false, error: errBody.message ?? `status_${res.status}` };
    }
    const data = (await res.json()) as { id?: string };
    console.log(`[email] sent id=${data.id} to_chars=${to.length} subject="${subject}"`);
    return { ok: true, id: data.id };
  } catch (e) {
    console.log(`[email] send_exception msg=${(e as Error).message}`);
    return { ok: false, error: (e as Error).message };
  }
}

async function sendFoundingWelcomeEmail(
  env: Env,
  email: string,
  paymentId: string,
): Promise<void> {
  const subject = "Welcome to Likho — you're a founding member 🎉";
  const downloadUrl =
    "https://github.com/HypnoPlayzZ/likho-ai/releases/latest/download/Likho-Setup.msi";
  const text = [
    `Welcome aboard.`,
    ``,
    `Your founding-member spot is locked in for life — ₹4,900 once, never again. The Pro features that ship in the coming weeks are yours forever, no more subscription invoices.`,
    ``,
    `Download Likho for Windows 11:`,
    downloadUrl,
    ``,
    `After installing, hit Alt+Space anywhere on Windows to open the overlay. Right-click the tray icon → "Already a Founding or Pro member? Sign in" → enter this email (${email}) and you'll bypass the demo cap immediately.`,
    ``,
    `Payment receipt: ${paymentId}`,
    ``,
    `Reply to this email if anything's broken — I read every reply.`,
    ``,
    `— Chetan`,
    `Founder, Likho`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1F2937; line-height: 1.55;">
      <h1 style="font-size: 22px; font-weight: 700; color: #3730A3; margin-bottom: 8px;">Welcome aboard.</h1>
      <p style="font-size: 15px;">Your founding-member spot is locked in <strong>for life</strong> — ₹4,900 once, never again. The Pro features that ship in the coming weeks are yours forever, no more subscription invoices.</p>
      <p style="margin-top: 28px;">
        <a href="${downloadUrl}" style="display: inline-block; padding: 12px 22px; background: #F97316; color: #fff; font-weight: 700; text-decoration: none; border-radius: 999px;">Download Likho for Windows</a>
      </p>
      <p style="font-size: 14px; color: #475569; margin-top: 28px;">After installing, press <strong>Alt + Space</strong> anywhere on Windows to open the overlay. To unlock unlimited rewrites, right-click the tray icon → <em>"Already a Founding or Pro member? Sign in"</em> → enter <strong>${email}</strong>.</p>
      <p style="font-size: 12px; color: #94A3B8; margin-top: 28px;">Payment receipt: ${paymentId}</p>
      <p style="font-size: 14px; margin-top: 28px;">Reply to this email if anything's broken — I read every reply.</p>
      <p style="font-size: 14px; margin-top: 8px;">— Chetan<br><span style="color: #64748B;">Founder, Likho</span></p>
    </div>
  `;
  await sendEmail(env, email, subject, html, text);
}

async function sendProWelcomeEmail(
  env: Env,
  email: string,
  subscriptionId: string,
): Promise<void> {
  const subject = "Welcome to Likho Pro";
  const downloadUrl =
    "https://github.com/HypnoPlayzZ/likho-ai/releases/latest/download/Likho-Setup.msi";
  const text = [
    `Welcome to Likho Pro.`,
    ``,
    `Your subscription is active. ₹299/month for unlimited rewrites in 3 tones, with full Hinglish and Indian English support.`,
    ``,
    `Want voice mode (hold Alt+V → speak Hindi/English → polished business English)? Upgrade to Pro+ at ₹499/month, or grab a founding-member spot for ₹4,900 lifetime while they last.`,
    ``,
    `Download for Windows 11:`,
    downloadUrl,
    ``,
    `After installing, press Alt+Space anywhere on Windows. To unlock unlimited rewrites, right-click the tray icon → "Sign in" → enter this email (${email}).`,
    ``,
    `Subscription ID: ${subscriptionId}`,
    `Manage anytime via Razorpay (you'll get a separate confirmation from them).`,
    ``,
    `— Chetan`,
    `Founder, Likho`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1F2937; line-height: 1.55;">
      <h1 style="font-size: 22px; font-weight: 700; color: #3730A3; margin-bottom: 8px;">Welcome to Likho Pro.</h1>
      <p style="font-size: 15px;">Your subscription is active. ₹299/month for unlimited rewrites in 3 tones, with full Hinglish and Indian English support.</p>
      <p style="font-size: 14px; color: #475569;">Want voice mode (hold <strong>Alt+V</strong> → speak Hindi/English → polished business English)? Upgrade to Pro+ at ₹499/month, or grab a <strong>founding-member spot</strong> for ₹4,900 lifetime while they last.</p>
      <p style="margin-top: 28px;">
        <a href="${downloadUrl}" style="display: inline-block; padding: 12px 22px; background: #F97316; color: #fff; font-weight: 700; text-decoration: none; border-radius: 999px;">Download Likho for Windows</a>
      </p>
      <p style="font-size: 14px; color: #475569; margin-top: 28px;">After installing, press <strong>Alt + Space</strong> anywhere on Windows. To unlock unlimited rewrites, right-click the tray icon → <em>"Sign in"</em> → enter <strong>${email}</strong>.</p>
      <p style="font-size: 12px; color: #94A3B8; margin-top: 28px;">Subscription ID: ${subscriptionId}</p>
      <p style="font-size: 14px; margin-top: 28px;">— Chetan<br><span style="color: #64748B;">Founder, Likho</span></p>
    </div>
  `;
  await sendEmail(env, email, subject, html, text);
}

async function sendProPlusWelcomeEmail(
  env: Env,
  email: string,
  subscriptionId: string,
): Promise<void> {
  const subject = "Welcome to Likho Pro+ — voice mode unlocked";
  const downloadUrl =
    "https://github.com/HypnoPlayzZ/likho-ai/releases/latest/download/Likho-Setup.msi";
  const text = [
    `Welcome to Likho Pro+.`,
    ``,
    `Voice mode is unlocked. Hold Alt+V anywhere on Windows, speak in Hindi or English, release — Likho returns polished business English ready to paste.`,
    ``,
    `Download for Windows 11:`,
    downloadUrl,
    ``,
    `After installing, right-click the tray icon → "Sign in" → enter this email (${email}). Then press Alt+V to use voice mode.`,
    ``,
    `Subscription ID: ${subscriptionId}`,
    `Manage anytime via Razorpay.`,
    ``,
    `— Chetan`,
    `Founder, Likho`,
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1F2937; line-height: 1.55;">
      <h1 style="font-size: 22px; font-weight: 700; color: #3730A3; margin-bottom: 8px;">Welcome to Likho Pro+.</h1>
      <p style="font-size: 15px;"><strong>Voice mode is unlocked.</strong> Hold <strong>Alt+V</strong> anywhere on Windows, speak in Hindi or English, release — Likho returns polished business English ready to paste.</p>
      <p style="margin-top: 28px;">
        <a href="${downloadUrl}" style="display: inline-block; padding: 12px 22px; background: #F97316; color: #fff; font-weight: 700; text-decoration: none; border-radius: 999px;">Download Likho for Windows</a>
      </p>
      <p style="font-size: 14px; color: #475569; margin-top: 28px;">After installing, right-click the tray icon → <em>"Sign in"</em> → enter <strong>${email}</strong>. Then press <strong>Alt+V</strong> to use voice mode.</p>
      <p style="font-size: 12px; color: #94A3B8; margin-top: 28px;">Subscription ID: ${subscriptionId}</p>
      <p style="font-size: 14px; margin-top: 28px;">— Chetan<br><span style="color: #64748B;">Founder, Likho</span></p>
    </div>
  `;
  await sendEmail(env, email, subject, html, text);
}

async function handleAdminTestEmail(request: Request, env: Env): Promise<Response> {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return json({ error: "invalid_email" }, 400);
  }
  const result = await sendEmail(
    env,
    email,
    "Likho — test email from your Worker",
    `<p>If you're reading this in your inbox, the Resend integration is wired correctly and you're ready to take real founding-member payments.</p>`,
    `If you're reading this in your inbox, the Resend integration is wired correctly and you're ready to take real founding-member payments.`,
  );
  return json(result, result.ok ? 200 : 502);
}
