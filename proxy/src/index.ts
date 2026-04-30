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
// 12 monthly charges = 1 year cycle. Razorpay requires total_count for
// subscriptions; pick a long horizon and renew via webhook later.
const PRO_TOTAL_COUNT = 12;

// Day 8: founding-member waitlist (PRD pricing — first 50 lifetime at ₹4,900).
// Total cap is conservative enforcement only; the front-end shows "37 left"
// hardcoded today and will switch to live count when this number is shown
// in the UI in a follow-up.
const WAITLIST_CAP = 50;

// Day 9: landing-page interactive mockup. Per-IP daily cap to prevent the
// public demo route from being a free Gemini key for scrapers.
const LANDING_DEMO_DAILY_CAP = 3;

// 2026-04-30: switched off gemini-2.5-flash-lite — Google tightened its
// free-tier daily quota to 20 req/day, which gets exhausted in minutes.
// gemini-2.5-flash has a separate, higher free-tier quota that survives
// real usage. Slightly higher latency (~3s vs ~2s) but quality is better.
// For launch with paying users, enable billing on AI Studio or swap to
// Anthropic Claude Haiku per CLAUDE.md's original tech-stack decision.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Day 6 system prompt: three tones in strict JSON, plus language detection.
// Output is enforced via Gemini's responseSchema (below); prompt sets
// expectations for tone differentiation and detection rules.
const SYSTEM_PROMPT = `You are a professional writing assistant built for Indian English speakers writing business communication.

When given text to rewrite, return three distinct rewrites at three tones AND classify the language of the INPUT.

Tones:
- "professional": polished business English, suitable for emails to seniors, clients, or external stakeholders. British spelling. Slightly formal.
- "concise": shortest version that preserves intent. Strip filler. Suitable for chat or quick replies.
- "friendly": warm and conversational. Suitable for peers, casual messages, or informal team chat. Still professional, never overly casual.

Tone rules:
- Preserve the user's intent and meaning exactly. Never add facts.
- Convert Hinglish input to clean English automatically.
- Recognise and improve Indian English idioms ("do the needful", "PFA", "revert back", "prepone") without being condescending — just write the better version.
- Default to British English spelling (favour, organisation, colour) — Indian convention.
- For senior-tone contexts, use "could you" not "can you".
- Each tone must read as a complete, self-contained rewrite — not a fragment, not a continuation.
- Each of the three values must be different from the others. If the source text is already short and casual, "concise" and "friendly" will still differ — concise drops words, friendly keeps warmth.

Language detection (the "detected_language" field):
- "english" — text is fully English. Indian English idioms ("do the needful", "PFA", "revert back", "kindly", "prepone") DO NOT count as Hinglish — they are English written by Indian speakers. Most input falls here.
- "hinglish" — text is primarily romanised Hindi (Devanagari written in Latin script). Examples: "kya haal hai", "mera kaam ho gaya", "kripya kaam dhang se karo". Even if a few English connector words are mixed in, classify as "hinglish" if the core sentence structure or majority of content words are Hindi.
- "mixed" — meaningful chunks in BOTH English and romanised Hindi. Example: "Sir please send the report jaldi" or "Looking forward to the meeting yaar". A single Hindi loanword in otherwise English text counts as "mixed".

Decide on the dominant pattern, not on individual words. When in doubt between "english" and "mixed", prefer "english" (avoid false positives — common surnames, place names, and Indian English idioms are NOT Hindi).

Example input: Sir kindly do the needful regarding invoice asap, also PFA
Example output:
{
  "professional": "Could you please review and resolve the invoice issue at your earliest convenience? I have attached the relevant document for your reference.",
  "concise": "Please resolve the invoice issue. Document attached.",
  "friendly": "Hi — would you be able to take a look at the invoice issue? I've attached the document.",
  "detected_language": "english"
}

Example input: mera kal meeting hai pls confirm karo
Example output:
{
  "professional": "Could you please confirm the meeting scheduled for tomorrow?",
  "concise": "Please confirm tomorrow's meeting.",
  "friendly": "Hey, could you confirm our meeting for tomorrow?",
  "detected_language": "hinglish"
}`;

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

    // Landing-page demo rewrite (Day 9). Same model + system prompt as
    // /rewrite, but rate-limited per IP per day so it can't be abused as
    // a free Gemini proxy by scrapers.
    if (url.pathname === "/landing-rewrite" && request.method === "POST") {
      return handleLandingRewrite(request, env);
    }

    if (url.pathname === "/rewrite" && request.method === "POST") {
      return handleRewrite(request, env, "app");
    }

    // Razorpay checkout. Four endpoints:
    //   POST /razorpay/order        — create order (founding-member, one-time)
    //   POST /razorpay/subscription — create subscription (Pro, monthly recurring)
    //   POST /razorpay/verify       — verify signature for either flow
    //   POST /razorpay/webhook      — Razorpay-initiated lifecycle events
    //                                 (subscription.charged / cancelled / failed, etc.)
    if (url.pathname === "/razorpay/order" && request.method === "POST") {
      return handleRazorpayCreateOrder(request, env);
    }
    if (url.pathname === "/razorpay/subscription" && request.method === "POST") {
      return handleRazorpayCreateSubscription(request, env);
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

  let body: { text?: unknown };
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

  const startedAt = Date.now();
  console.log(`[gemini] call start chars=${text.length} model=${GEMINI_MODEL} src=${source}`);

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
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
    return json({ error: "upstream_unreachable" }, 502);
  }

  const elapsed = Date.now() - startedAt;
  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => "");
    console.log(
      `[gemini] error status=${upstream.status} after_ms=${elapsed} body_len=${errBody.length} src=${source}`,
    );
    return json({ error: "upstream_error", status: upstream.status }, 502);
  }

  const data = (await upstream.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  const rewrites = parseRewrites(raw);
  if (!rewrites) {
    console.log(`[gemini] parse_failed after_ms=${elapsed} raw_len=${raw.length} src=${source}`);
    return json({ error: "parse_failed" }, 502);
  }

  console.log(
    `[gemini] ok after_ms=${elapsed}` +
      ` p=${rewrites.professional.length}` +
      ` c=${rewrites.concise.length}` +
      ` f=${rewrites.friendly.length}` +
      ` lang=${rewrites.detected_language}` +
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

  return json(rewrites);
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

// Defensive parse: even though responseMimeType+responseSchema *should* give
// us pure JSON, we still strip code fences in case the upstream slips. Per
// MISTAKES.md "Don't trust the AI JSON output format".
function parseRewrites(raw: string): Rewrites | null {
  let cleaned = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences if present.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const p = typeof obj.professional === "string" ? obj.professional.trim() : "";
  const c = typeof obj.concise === "string" ? obj.concise.trim() : "";
  const f = typeof obj.friendly === "string" ? obj.friendly.trim() : "";
  if (!p || !c || !f) return null;

  // Default to "english" if Gemini omits or returns an unknown value — better
  // to silently treat as English (no badge) than to crash the rewrite flow.
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
    // Pro subscription mandate authorized.
    const recordKey = `pro:subscription:${subscriptionId}`;
    const existing = await env.LIKHO_KV.get(recordKey);
    if (!existing) {
      await env.LIKHO_KV.put(
        recordKey,
        JSON.stringify({
          email: email || null,
          subscription_id: subscriptionId,
          first_payment_id: paymentId,
          ts: Date.now(),
        }),
      );
      console.log(
        `[razorpay] pro_subscribed sub=${subscriptionId} email_chars=${email.length}`,
      );
      // Fire-and-forget the welcome email. We `await` so the Worker
      // doesn't terminate before the request completes — the latency
      // hit is acceptable on the post-payment path (user sees a spinner).
      if (email) {
        await sendProWelcomeEmail(env, email, subscriptionId);
      }
    }
    return json(
      { ok: true, kind: "subscription", subscription_id: subscriptionId },
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

  const recordKey = `pro:subscription:${subId}`;
  const existingRaw = await env.LIKHO_KV.get(recordKey);
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

  // Founding-member lookup. Walking the founding:payment:* records is fine
  // at this scale — cap is 50 records ever. If we grow past that, switch
  // to a secondary index (founding:by_email:<email>).
  const foundingList = await env.LIKHO_KV.list({ prefix: "founding:payment:" });
  for (const k of foundingList.keys) {
    const record = await env.LIKHO_KV.get(k.name, "json");
    if (!record) continue;
    const r = record as FoundingPayment;
    if (r.email && r.email.toLowerCase() === email) {
      console.log(`[license] founding match email_chars=${email.length}`);
      return json({ tier: "founding", valid: true, since: r.ts });
    }
  }

  // Pro subscription lookup. Up to ~thousands of records eventually; same
  // index-or-walk consideration applies. For now walk it.
  const proList = await env.LIKHO_KV.list({ prefix: "pro:subscription:" });
  for (const k of proList.keys) {
    const record = await env.LIKHO_KV.get(k.name, "json");
    if (!record) continue;
    const r = record as ProSubscription;
    if (r.email && r.email.toLowerCase() === email) {
      // Cancelled subscriptions don't grant Pro access. Other statuses
      // (active, halted-but-still-in-grace, etc.) all keep them in.
      if (r.status === "cancelled") {
        console.log(`[license] pro cancelled email_chars=${email.length}`);
        return json({ tier: "free", valid: false, reason: "cancelled" });
      }
      console.log(`[license] pro match email_chars=${email.length}`);
      return json({ tier: "pro", valid: true, since: r.ts });
    }
  }

  // Not a paid user. Still return 200 so the client can act on it.
  console.log(`[license] no match email_chars=${email.length}`);
  return json({ tier: "free", valid: false });
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
    `Your subscription is active. ₹299/month, unlimited rewrites, voice mode + custom presets when they ship.`,
    ``,
    `Download for Windows 11:`,
    downloadUrl,
    ``,
    `After installing, press Alt+Space anywhere on Windows. To unlock unlimited rewrites, right-click the tray icon → "Already a Founding or Pro member? Sign in" → enter this email (${email}).`,
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
      <p style="font-size: 15px;">Your subscription is active. ₹299/month, unlimited rewrites, voice mode + custom presets when they ship.</p>
      <p style="margin-top: 28px;">
        <a href="${downloadUrl}" style="display: inline-block; padding: 12px 22px; background: #F97316; color: #fff; font-weight: 700; text-decoration: none; border-radius: 999px;">Download Likho for Windows</a>
      </p>
      <p style="font-size: 14px; color: #475569; margin-top: 28px;">After installing, press <strong>Alt + Space</strong> anywhere on Windows. To unlock unlimited rewrites, right-click the tray icon → <em>"Already a Founding or Pro member? Sign in"</em> → enter <strong>${email}</strong>.</p>
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
