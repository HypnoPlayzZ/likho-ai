// Day 4 proxy: stateless, no auth, no rate limit.
// Single endpoint POST /rewrite { text: string } -> { rewrite: string }
// The desktop app calls this from the overlay after capturing selected text.
// Auth + rate limit + Supabase usage tracking land Day 8.
//
// Provider: Google Gemini Flash 2.5 (see DECISIONS.md 2026-04-30 for why we
// picked this over Claude Haiku 4.5 for v1).

interface Env {
  GEMINI_API_KEY: string;
}

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Stripped-down version of the SKILLS.md prompt for Day 4:
// - same Indian English / Hinglish / British spelling rules
// - returns ONE professional rewrite as plain text (Day 5 expands to JSON with 3 tones)
// - extra emphasis on "plain text only" because Gemini is less strict than Claude
//   about not adding preambles like "Here's the rewrite:"
const SYSTEM_PROMPT = `You are a professional writing assistant built for Indian English speakers writing business communication.

When given text to rewrite, return EXACTLY one professional rewrite as plain text — and nothing else.

Output rules — these are absolute:
- Do not add a preamble like "Here is the rewrite:" or "Sure!" — output the rewritten text only.
- Do not wrap the output in quotes or markdown.
- Do not explain the changes you made.
- Do not include the original text.
- One rewrite. Plain text. Nothing else.

Rewriting rules:
- Preserve the user's intent and meaning exactly. Never add facts.
- Convert Hinglish input to clean English automatically.
- Recognise and improve Indian English idioms ("do the needful", "PFA", "revert back", "prepone") without being condescending — just write the better version.
- Default to British English spelling (favour, organisation, colour) — Indian convention.
- Keep tone respectful for hierarchy when context suggests writing to a senior. Use "could you" not "can you".

Example input: Sir kindly do the needful regarding invoice asap, also PFA
Example output: Could you please review and resolve the invoice issue at your earliest convenience? I have attached the relevant document for your reference.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
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

    // Cost guard: log every outbound call. Privacy guard: never log the text content
    // (per CLAUDE.md and MISTAKES.md). Char count + timestamp only.
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
            maxOutputTokens: 800,
            temperature: 0.5,
            // Disable Gemini 2.5's "thinking" mode for rewrite calls.
            // Rewriting doesn't need internal reasoning, and thinking adds
            // ~1–2s of latency that pushes us past the CLAUDE.md 2.5s budget.
            thinkingConfig: { thinkingBudget: 0 },
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
    const rewrite = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    console.log(`[gemini] ok after_ms=${elapsed} out_chars=${rewrite.length}`);

    if (!rewrite) {
      return json({ error: "empty_response" }, 502);
    }
    return json({ rewrite });
  },
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
