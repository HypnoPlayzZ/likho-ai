// Day 5 proxy: still stateless, no auth, no rate limit.
// Single endpoint POST /rewrite { text: string } -> { professional, concise, friendly }
// Auth + rate limit + Supabase usage tracking land Day 8.
//
// Provider: Google Gemini Flash 2.5 (see DECISIONS.md 2026-04-30).

interface Env {
  GEMINI_API_KEY: string;
  LIKHO_KV: KVNamespace;
}

// Day 8: founding-member waitlist (PRD pricing — first 50 lifetime at ₹4,900).
// Total cap is conservative enforcement only; the front-end shows "37 left"
// hardcoded today and will switch to live count when this number is shown
// in the UI in a follow-up.
const WAITLIST_CAP = 50;

// gemini-2.5-flash-lite chosen over gemini-2.5-flash during dev because the
// free-tier daily request quota is much higher on lite (~1000/day vs ~20/day
// observed on flash). Quality is comparable for short business-message
// rewrites in spot-checks. Revisit when paid tier is enabled.
const GEMINI_MODEL = "gemini-2.5-flash-lite";
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Founding-member waitlist endpoints (Day 8).
    if (url.pathname === "/waitlist" && request.method === "POST") {
      return handleWaitlistPost(request, env);
    }
    if (url.pathname === "/waitlist/count" && request.method === "GET") {
      return handleWaitlistCount(env);
    }

    if (url.pathname !== "/rewrite" || request.method !== "POST") {
      return json({ error: "not_found" }, 404);
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

    // Cost guard: log every outbound call. Privacy guard: never log content.
    const startedAt = Date.now();
    console.log(`[gemini] call start chars=${text.length} model=${GEMINI_MODEL}`);

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
            // Three rewrites need more budget than a single one.
            maxOutputTokens: 1200,
            temperature: 0.6,
            // Disable Gemini 2.5's "thinking" mode for rewrite calls — keeps
            // latency under the CLAUDE.md 2.5s budget.
            thinkingConfig: { thinkingBudget: 0 },
            // Force the model to return valid JSON matching the schema.
            // Eliminates the markdown-code-fence and trailing-prose failures
            // documented in MISTAKES.md.
            responseMimeType: "application/json",
            responseSchema: REWRITE_SCHEMA,
          },
        }),
      });
    } catch {
      console.log(`[gemini] network_error after_ms=${Date.now() - startedAt}`);
      return json({ error: "upstream_unreachable" }, 502);
    }

    const elapsed = Date.now() - startedAt;
    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => "");
      console.log(`[gemini] error status=${upstream.status} after_ms=${elapsed} body_len=${errBody.length}`);
      return json({ error: "upstream_error", status: upstream.status }, 502);
    }

    const data = (await upstream.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const raw = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    const rewrites = parseRewrites(raw);
    if (!rewrites) {
      console.log(`[gemini] parse_failed after_ms=${elapsed} raw_len=${raw.length}`);
      return json({ error: "parse_failed" }, 502);
    }

    // detected_language is metadata, not text content — safe to log.
    // Useful for telling whether the Hinglish-detection path is firing for
    // real users without inspecting any content.
    console.log(
      `[gemini] ok after_ms=${elapsed}` +
        ` p=${rewrites.professional.length}` +
        ` c=${rewrites.concise.length}` +
        ` f=${rewrites.friendly.length}` +
        ` lang=${rewrites.detected_language}`,
    );
    return json(rewrites);
  },
};

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

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
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
