// Day 5 proxy: still stateless, no auth, no rate limit.
// Single endpoint POST /rewrite { text: string } -> { professional, concise, friendly }
// Auth + rate limit + Supabase usage tracking land Day 8.
//
// Provider: Google Gemini Flash 2.5 (see DECISIONS.md 2026-04-30).

interface Env {
  GEMINI_API_KEY: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  LIKHO_KV: KVNamespace;
}

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

    // Landing-page demo rewrite (Day 9). Same model + system prompt as
    // /rewrite, but rate-limited per IP per day so it can't be abused as
    // a free Gemini proxy by scrapers.
    if (url.pathname === "/landing-rewrite" && request.method === "POST") {
      return handleLandingRewrite(request, env);
    }

    if (url.pathname === "/rewrite" && request.method === "POST") {
      return handleRewrite(request, env, "app");
    }

    // Razorpay checkout. Three endpoints:
    //   POST /razorpay/order        — create order (founding-member, one-time)
    //   POST /razorpay/subscription — create subscription (Pro, monthly recurring)
    //   POST /razorpay/verify       — verify signature for either flow
    if (url.pathname === "/razorpay/order" && request.method === "POST") {
      return handleRazorpayCreateOrder(request, env);
    }
    if (url.pathname === "/razorpay/subscription" && request.method === "POST") {
      return handleRazorpayCreateSubscription(request, env);
    }
    if (url.pathname === "/razorpay/verify" && request.method === "POST") {
      return handleRazorpayVerify(request, env);
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
    return json({ error: "razorpay_not_configured" }, 500);
  }

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

  const receipt = `founding_${Date.now()}`;
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
    return json({ error: "razorpay_unreachable" }, 502);
  }

  if (upstream.status === 401 || upstream.status === 403) {
    console.log(`[razorpay] auth_error status=${upstream.status}`);
    return json({ error: "razorpay_auth_failed" }, 401);
  }
  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => "");
    console.log(`[razorpay] order_error status=${upstream.status} body=${errBody.slice(0, 200)}`);
    return json({ error: "razorpay_error", status: upstream.status }, 500);
  }

  const order = (await upstream.json()) as { id?: string; amount?: number; currency?: string };
  if (!order.id) {
    console.log("[razorpay] order_missing_id");
    return json({ error: "razorpay_bad_response" }, 502);
  }

  console.log(`[razorpay] order_created id=${order.id} email_chars=${email.length}`);
  return json({
    order_id: order.id,
    amount: order.amount ?? FOUNDING_AMOUNT_PAISE,
    currency: order.currency ?? FOUNDING_CURRENCY,
    key_id: env.RAZORPAY_KEY_ID,
    receipt,
  });
}

async function handleRazorpayCreateSubscription(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    console.log("[razorpay] missing_credentials");
    return json({ error: "razorpay_not_configured" }, 500);
  }

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
    return json({ error: "razorpay_unreachable" }, 502);
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return json({ error: "razorpay_auth_failed" }, 401);
  }
  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => "");
    console.log(
      `[razorpay] subscription_error status=${upstream.status} body=${errBody.slice(0, 300)}`,
    );
    return json({ error: "razorpay_error", status: upstream.status }, 500);
  }

  const sub = (await upstream.json()) as { id?: string; status?: string };
  if (!sub.id) {
    return json({ error: "razorpay_bad_response" }, 502);
  }

  console.log(`[razorpay] subscription_created id=${sub.id} email_chars=${email.length}`);
  return json({
    subscription_id: sub.id,
    plan_id: PRO_PLAN_ID,
    key_id: env.RAZORPAY_KEY_ID,
    status: sub.status ?? "created",
  });
}

async function handleRazorpayVerify(request: Request, env: Env): Promise<Response> {
  if (!env.RAZORPAY_KEY_SECRET) {
    return json({ error: "razorpay_not_configured" }, 500);
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
    return json({ error: "invalid_json" }, 400);
  }

  const paymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const orderId = typeof body.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  const subscriptionId =
    typeof body.razorpay_subscription_id === "string" ? body.razorpay_subscription_id : "";

  if (!paymentId || !signature || (!orderId && !subscriptionId)) {
    return json({ error: "missing_fields" }, 400);
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
    return json({ error: "signature_mismatch" }, 400);
  }

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
      const prev = await env.LIKHO_KV.get("pro:_count");
      const next = (prev ? parseInt(prev, 10) || 0 : 0) + 1;
      await env.LIKHO_KV.put("pro:_count", String(next));
      console.log(
        `[razorpay] pro_subscribed #${next} sub=${subscriptionId} email_chars=${email.length}`,
      );
    }
    return json({ ok: true, kind: "subscription", subscription_id: subscriptionId });
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
    const prev = await env.LIKHO_KV.get("founding:_count");
    const next = (prev ? parseInt(prev, 10) || 0 : 0) + 1;
    await env.LIKHO_KV.put("founding:_count", String(next));
    console.log(
      `[razorpay] founding_paid #${next} payment=${paymentId} email_chars=${email.length}`,
    );
  }
  return json({ ok: true, kind: "order", payment_id: paymentId, order_id: orderId });
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
