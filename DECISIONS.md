# DECISIONS.md — Architecture Decision Log

> Every meaningful technical or product decision goes here. One paragraph each. Future Chetan and future Claude need to know not just WHAT we decided but WHY.

> Format:
> ## [YYYY-MM-DD] Title
> **Context:** [Why this came up]
> **Decision:** [What we chose]
> **Alternatives considered:** [What else was on the table]
> **Consequences:** [What this implies — both good and bad]

---

## 2026-04-29 Pick Tauri 2.0 over Electron

**Context:** Need a desktop framework for the Windows overlay app. Two real options: Electron or Tauri.

**Decision:** Tauri 2.0 with Rust backend, React TypeScript frontend in webview.

**Alternatives considered:**
- Electron + React: more familiar, larger ecosystem, but ~120MB installer.
- .NET WPF: native Windows performance but limits future cross-platform.
- Pure Win32/WinUI: smallest installer but slowest to build.

**Consequences:**
- (+) ~12MB installer, critical for Indian internet conditions.
- (+) Lower memory usage on user machines (~40MB vs Electron's 200MB+).
- (+) Tauri's Rust backend means clipboard/hotkey APIs are robust.
- (−) Smaller community than Electron — fewer Stack Overflow answers, more reliance on Claude/AI for help.
- (−) Rust learning curve, but most logic stays in TypeScript via Tauri commands.

---

## 2026-04-29 Use Cloudflare Workers for AI proxy

**Context:** The desktop app needs to call Anthropic's API but can't ship the API key in the binary (extractable). Need a backend that hides the key, enforces rate limits, and is cheap at startup scale.

**Decision:** Cloudflare Workers as the AI proxy. Edge-hosted near Indian users. Hides Anthropic key, enforces daily limits, logs usage to Supabase.

**Alternatives considered:**
- Vercel Edge Functions: similar pattern, slightly more expensive at scale.
- Supabase Edge Functions: simpler but tied to Supabase platform.
- Self-hosted Node + Render/Railway: more control but more ops overhead.

**Consequences:**
- (+) Free tier (100K requests/day) covers first ~3,000 daily-active users.
- (+) Edge means <50ms latency from India.
- (+) Built-in DDoS protection.
- (−) Workers don't have full Node.js — must use fetch() not axios, no native Node modules.
- (−) Wrangler tooling has a learning curve.

---

## 2026-04-29 Pricing: ₹299/month for Pro tier

**Context:** Need a monthly price that's accessible to Indian professionals but doesn't signal "toy."

**Decision:** ₹299/month Pro, ₹2,499/year (saves 30%), ₹4,900 lifetime founding-member offer for first 50.

**Alternatives considered:**
- ₹99/month: too cheap, signals low quality.
- ₹499/month: aspirational ceiling but might hurt early conversion.
- ₹999/month: matches Western SaaS but kills Indian conversion.

**Consequences:**
- (+) ₹299 is the proven sweet spot for Indian B2C SaaS (Inshorts Premium, Cred, etc.).
- (+) Founders earning ₹50K+/month consider it negligible.
- (−) BPO support agents earning ₹15–25K may find it expensive — addressed by team plan at ₹199/seat.

---

## 2026-04-29 Razorpay primary, Stripe secondary

**Context:** Need payment processing for both Indian and the few international users.

**Decision:** Razorpay for all Indian users (UPI, cards, NetBanking). Stripe for international cards only.

**Alternatives considered:**
- Stripe-only: would lose ~70% of Indian conversions (UPI is the dominant payment method now).
- PayU: comparable to Razorpay but worse subscription UX.
- Cashfree: smaller player, less trust with users.

**Consequences:**
- (+) Razorpay UPI flow is the lowest-friction payment in India — single-tap approval.
- (+) Razorpay subscription product handles auto-billing reliably.
- (−) Razorpay KYC takes 5–10 days. Must start Day 1 of build.
- (−) Two payment integrations means more code to maintain.

---

## 2026-04-29 Initial scaffold using Tauri 2.0 + React TypeScript

**Context:** Day 1 — need to get the desktop app skeleton running so we can iterate on the overlay UI and hotkey flow.

**Decision:** Manually scaffolded the Tauri 2.0 project with React 18 + TypeScript + TailwindCSS. Added three Tauri plugins from day one: `tauri-plugin-global-shortcut` (Alt+Space hotkey), `tauri-plugin-clipboard-manager` (text capture), and `tauri-plugin-updater` (auto-update). Configured the overlay window as frameless, transparent, always-on-top, skip-taskbar, 380x220px per the SKILLS.md pattern. System tray with placeholder "L" icon.

**Alternatives considered:**
- Using `npm create tauri-app` CLI: failed in non-interactive terminal, and manual scaffold gives us more control over the exact configuration anyway.
- Starting without plugins: rejected — the global-shortcut plugin is needed for the core Alt+Space flow on Day 2, so better to wire it now.

**Consequences:**
- (+) App compiles and builds on Windows 11 with MSVC toolchain in ~23 seconds (incremental).
- (+) Tailwind brand colours (likho-indigo, likho-cream, etc.) ready for UI work.
- (+) Overlay window config matches SKILLS.md spec exactly.
- (-) Requires VS 2022 Build Tools installed — documented in README.

---

## 2026-04-30 Switch default model from Claude Haiku 4.5 to Gemini Flash 2.5

**Context:** Day 4 — wiring the desktop app to the AI proxy. Founder already holds a Google Gemini API key and is not yet onboarded with Anthropic billing. Standing up Anthropic billing on the same day as Day 4 would block the build until top-up clears.

**Decision:** Use `gemini-2.5-flash` as the default rewrite model via Google's Generative Language API, called from the Cloudflare Worker. Same proxy architecture, same system-prompt principles (Indian English, British spelling, Hinglish handling). System prompt is adapted slightly because Gemini and Claude differ in how strictly they obey "no preamble, plain text only" instructions.

**Alternatives considered:**
- Sign up for Anthropic and top up: rejected because it stalls Day 4. Founder can revisit after launch when revenue justifies multi-provider billing.
- OpenAI gpt-4o-mini: founder doesn't hold an OpenAI key either, same blocker.
- Local model (Ollama): rejected — adds 4GB+ to the install and contradicts the <20MB installer constraint in CLAUDE.md.

**Consequences:**
- (+) Founder unblocked on Day 4, no payment-step delay.
- (+) Gemini Flash 2.5 latency is comparable to Haiku 4.5 (~1–2s for short rewrites). Still meets the 2.5s budget.
- (+) Gemini Flash free tier (15 RPM, 1M tokens/day) is enough for solo development and early testers without immediate cost.
- (−) Gemini's instruction-following on "JSON only, no markdown" is less strict than Claude's. Day 5 (3-tone JSON output) will need defensive parsing — strip ```json fences, handle trailing prose.
- (−) System prompt needs re-tuning per provider. Patterns in SKILLS.md still apply conceptually; the exact prompt is now project-specific.
- (−) Indian English / Hinglish output quality between the two is comparable in spot-checks but not formally evaluated. Should A/B both providers post-launch on a sample of real user rewrites before locking in long-term.

**Follow-ups:** Add a provider abstraction (env-selectable) when/if we want to swap back or run both. Not done in v1 — keeping Day 4 minimal.

**Update 2026-04-30 (Day 6):** Switched the model variant from `gemini-2.5-flash` to `gemini-2.5-flash-lite` during development. The 2.5-flash free-tier quota turns out to be ~20 requests/day per project on AI Studio keys (we exhausted it during Day 6 testing within an hour). Flash-Lite has a much higher free-tier daily quota and comparable quality on short rewrites. The decision to standardise on Gemini Flash 2.5 still stands — this is a variant choice within the same family, not a provider switch. Revisit on paid tier or if real users see quality regressions.

---

## 2026-04-30 Demo mode + founding-member waitlist before auth/DB (Day 8)

**Context:** Original Day 8 plan was Clerk auth + Supabase + Razorpay so paid signups could happen. Founder pivoted: validate willingness-to-pay with a *founding-member waitlist* BEFORE building the auth/payments stack. No point in payment plumbing if the launch audience won't reserve a paid spot at the founder's price point.

**Decision:** Day 8 ships:
1. **Demo mode** — 5 lifetime rewrites, no signup required. localStorage counter (`likho_demo_used`). First-launch intro screen, "X of 5" footer, gated screen at 5 with two CTAs.
2. **Pro teaser modal** — small "✨ Pro" pill in the overlay, click opens a glass-themed modal pitching ₹4,900 lifetime founding-member access.
3. **Email-capture waitlist** — Cloudflare Worker `/waitlist` endpoint backed by **Cloudflare KV** (not Supabase yet). Stores `waitlist:email:<email>` and `waitlist:_count`. Returns "you're #N" on submit. Cap of 50 enforced server-side.

**Alternatives considered:**
- Provision Supabase + Clerk now: rejected for today — at least 2–3 hours of platform plumbing that doesn't validate the underlying assumption that anyone wants a founding-member tier.
- Stand up a simple form on a landing page (Tally, Google Form): rejected because the desktop overlay is the trigger context — interest spikes when the user has just felt the magic of a rewrite, not when they're scrolling a marketing page.
- Server-side fingerprint rate limiting on demo: deferred. Client-side localStorage cap is bypassable but the threat model is "marketing cost", not "revenue protection". When paid tier ships and abuse becomes economic, hard rate limiting goes onto the deployed Cloudflare KV.

**Consequences:**
- (+) Zero new platform dependencies today — KV's local mock works in `wrangler dev`. Worker compiles + runs unchanged.
- (+) Email capture is real and persistent (KV survives across worker restarts in dev mode).
- (+) Pre-launch we can answer "do people actually reserve at ₹4,900?" without paying for Supabase or Clerk.
- (+) Migration path is clean — when Supabase lands (Day 9+), iterate KV entries once into the `founding_member_waitlist` table; the API surface to the app stays `/waitlist`.
- (−) The "Sign up free for 20/day" CTA on the gated screen opens a placeholder URL (`https://likho.ai/signup`) until Clerk is wired. Click is dead-end for now — explicit TODO. Acceptable because gating only triggers after 5 rewrites, by which point the user is already engaged enough to wait.
- (−) Demo cap is bypassable by clearing localStorage. Not a real concern at this stage; tighten when paid tier exists.
- (−) `wrangler kv:namespace create LIKHO_KV` has to be run before `wrangler deploy` lands in prod, and the printed namespace id has to replace the placeholder in `wrangler.toml`. One-time step, documented in the file.

**Follow-ups for Day 9+:**
- Provision Cloudflare KV namespace; replace placeholder id.
- Provision Supabase project + `founding_member_waitlist` table; migrate KV → Supabase.
- Provision Clerk app; replace the placeholder signup URL with real magic-link flow.
- Hard server-side rate limit on demo using install-id fingerprint.
- Wire the Pro modal's "spots left" to refresh on focus, not just on overlay mount.

---

## 2026-04-30 Landing page on Next.js 14 + Vercel; reuse Worker for demo + waitlist (Day 9)

**Context:** Day 9 ships the public marketing landing page. Founder needs a live URL for warm-network outreach this week — the page is the launchpad for both the desktop-app download and the founding-member waitlist.

**Decision:**
- **Stack:** Next.js 14 (App Router) + TailwindCSS + Framer Motion + lucide-react. Deployed to Vercel under `hypnoplayzz` account. Domain pending — current URL is `web-6nykedtei-hypnoplayzzs-projects.vercel.app`.
- **Aesthetic:** white frosted-glass cards on a sunrise/sunset radial-gradient background, mirroring the desktop overlay's glass aesthetic but inverted (dark glass on desktop, white glass on web).
- **Backend reuse:** the page hits the **same Cloudflare Worker** the desktop app uses. New `/landing-rewrite` endpoint (per-IP daily cap of 3) drives the interactive mockup; existing `/waitlist` endpoint backs the founding-member email capture. **No Supabase yet** — the user prompt asked for Supabase but Day 8 already chose Cloudflare KV; flip-flopping today would mean building two integrations. KV → Supabase migration happens once for both clients.
- **OG tags + favicon:** static metadata referencing `/og-image.png` and `/favicon.svg`. Asset files not yet created — landing pages render without preview cards on social shares until those assets are added.

**Alternatives considered:**
- Astro / Vite + plain React: rejected — Next.js gets us OG tag generation, simple deploys, and Vercel's edge caching for free.
- Self-hosted on Cloudflare Pages: equivalent in capability but the founder is already authenticated to Vercel; one less account to manage.
- Supabase for waitlist on the page (per the user prompt): explicitly deferred — same backend as the desktop app keeps the data model unified for the migration.

**Consequences:**
- (+) One URL ready for outreach today.
- (+) Page reuses every brand token from `desktop/tailwind.config.js`. When the desktop app's accent colour shifts, only one place to update.
- (+) Worker gains a public-facing demo route with rate limiting; protects against scraper abuse of the free Gemini key.
- (−) Worker isn't deployed yet (`wrangler login` is interactive; needs founder to run it). Until that's done, the landing page's demo + waitlist surface friendly "couldn't reach the server" errors. Static page renders fine.
- (−) Founder needs to run, in this order, before the page is fully live:
    1. `cd proxy && wrangler login`
    2. `wrangler kv:namespace create LIKHO_KV` → copy printed id into `wrangler.toml`
    3. `wrangler secret put GEMINI_API_KEY` (paste the dev key, or rotate to a prod-only key)
    4. `wrangler deploy` → note the printed URL (something like `https://likho-proxy.<account>.workers.dev`)
    5. `vercel env add NEXT_PUBLIC_API_BASE production` and paste the Worker URL
    6. `vercel --prod` to redeploy with the env var
- (−) Domain (`likho.ai`) not yet purchased per TODO.md Day 1 backlog — using the Vercel-generated URL temporarily. Connecting the real domain is `vercel domains add likho.ai` once it's bought.

**Follow-ups:**
- Add `/og-image.png` (1200×630) and `/favicon.svg` to `web/public/`.
- Wire `NEXT_PUBLIC_API_BASE` env on Vercel after Worker is deployed.
- Mouse-position parallax on the hero mockup — left out for v1, easy follow-up using `useMouse` + Framer Motion.
- Connect the real domain when purchased.

---

## 2026-05-01 Voice Mode pipeline + Pro+ tier (Day 10, v0.3.0)

**Context:** Founder asked to ship voice mode — hold Alt+V, speak Hindi/English/Hinglish, get polished business English. The PRD originally listed voice in the Pro tier (₹299), but we pivoted: voice ships as part of a new **Pro+ tier (₹499/mo)** with founding members (₹4,900 lifetime) grandfathered in. Plain Pro stays text-only at ₹299. Reasoning: voice has a real per-use cost (Whisper $0.006/min + Claude polish), so bundling it into the cheapest paid tier would cap our gross margin. Pricing the upsell at ₹499 keeps Pro affordable for the broader market while monetising the heavy users.

**Decision (architecture):**

1. **Audio capture: cpal in Rust, not Web MediaRecorder.** Tauri's WebView2 denies `getUserMedia` by default — granting microphone permission requires intercepting the `PermissionRequested` event on `ICoreWebView2` via `webview2-com`, an unstable FFI surface that varies by WebView2 version. cpal goes straight to WASAPI on Windows, gives us a known-working capture path, and produces samples we control end-to-end. Cost: a dedicated audio thread in Rust (`src-tauri/src/audio.rs`) because `cpal::Stream` is `!Send` on Windows (COM apartment binding).

2. **WAV not Opus.** hound writes 16-bit PCM WAV from the cpal f32 buffer. Whisper accepts WAV, mp3, m4a, wav, opus etc., and the WAV size at 60s mono 48kHz (≈5.7MB) is well under the Worker's 8MB ceiling. Using opus would have added rust-opus or `audiopus` deps, more failure surface, and saved <70% bandwidth at the cost of significant complexity.

3. **Pipeline: Whisper → polish LLM.** Whisper auto-detects language (no `language` field — works well across Hindi/English/Hinglish). Polish uses a locked system prompt that converts Hinglish idioms ("do the needful", "PFA") to clean professional English. After polish, the desktop app pipes the polished text through the existing `/rewrite` endpoint to get 3 tone variants. End-to-end target: under 3s for a 15s clip.

   **Provider routing is automatic** based on which Worker secrets are set:
   - ASR: `OPENAI_API_KEY` set → OpenAI Whisper-1 (paid). Else → Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo` (free, 10K neurons/day).
   - Polish: `ANTHROPIC_API_KEY` set → Claude Haiku 4.5 (paid). Else → Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (free).
   - Both providers fall through to the raw transcript if their upstream fails — better UX than a 500.

   Default deploy needs **zero paid provider keys** — Workers AI is bound automatically via `[ai]` in wrangler.toml. Test phase runs entirely free; production swap is "set the secrets and redeploy", no code change. Surface `asr_provider` and `polish_provider` in the response so we can A/B quality once we have real users.

4. **Server-side gating.** `/voice` calls `lookupTier(email)` and returns 403 `pro_plus_required` for free / plain-Pro users. Client-side license cache (`hasVoiceEntitlement`) is the fast path so we don't even open the mic for non-entitled users — but the server is the source of truth.

5. **Pro+ via Razorpay.** New endpoint `POST /razorpay/subscription_pro_plus` mirrors the existing Pro flow but uses `RAZORPAY_PRO_PLUS_PLAN_ID` (a Worker secret). Until the founder creates that plan in Razorpay dashboard and sets the secret, the endpoint returns `pro_plus_not_configured` — the landing page degrades to "Pro+ launching shortly" and founding-member purchase still works (which already grants voice access).

6. **Verify endpoint plan-aware.** `/razorpay/verify` now fetches the subscription from Razorpay to read its actual `plan_id`, then writes to `pro_plus:subscription:*` or `pro:subscription:*` based on what it actually was. Stops a user from claiming Pro+ entitlement after paying for Pro.

**Alternatives considered:**
- **Web MediaRecorder via WebView2.** Rejected — WebView2 mic permission is opt-in via host code, and our overlay window's transparent/decorationless config interacts badly with permission UI. cpal sidesteps this entirely.
- **Polish via Gemini Flash 2.5.** Rejected for v1 — Claude Haiku 4.5's instruction-following on "output ONLY the polished text, no preamble" is materially better than Gemini's, which mattered for a single-shot polish step where any preamble lands in the user's email. Worth the extra provider dep (`ANTHROPIC_API_KEY`).
- **Voice in Pro tier (₹299).** Rejected on margin (see Context).
- **Send raw audio direct to Anthropic / OpenAI from the desktop app.** Rejected — same reasoning as the original AI proxy decision (MISTAKES.md "Don't put the API key in the desktop app"). All AI calls go through the Worker.

**Consequences:**
- (+) Solo-developer-friendly capture path (no WebView2 permission FFI).
- (+) Pro+ creates a clear monetisation ladder: free → Pro (₹299) → Pro+ (₹499) → Founding (₹4,900 once).
- (+) Audio buffer never persisted — only lives on the Rust audio thread until WAV-encoded, then in the Worker's request scope, then discarded after Whisper returns.
- (+) Logs metadata only (duration_s, language, polish_ms, transcript chars/polished chars). Per CLAUDE.md "No telemetry of user text content" + MISTAKES.md "Don't log user text content".
- (−) Two new external API deps: OpenAI (Whisper) and Anthropic (Haiku). New Worker secrets: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. Founder needs to add billing to both.
- (−) Pro+ purchase blocked until founder creates `plan_pro_plus_monthly` (₹499/mo) in Razorpay and sets `RAZORPAY_PRO_PLUS_PLAN_ID`. Until then, voice is unlockable only by founding membership — fine for early customers since the founding tier is the better deal anyway.
- (−) Existing Pro subscribers (₹299) don't get voice mode, contrary to the original PRD wording. Their welcome email still describes Pro as "unlimited rewrites + 3 tones + Hinglish" with an explicit upsell to Pro+/founding for voice. No bait-and-switch since voice was never delivered to anyone yet.
- (−) Live waveform visualisation deferred — using a pulsing red dot + live timer for v1. Adequate, but a real waveform would feel more responsive on long clips.

**Follow-ups for the founder (outside this code change):**
1. Create the Pro+ plan in Razorpay dashboard (₹499/mo recurring), copy the `plan_*` id, set as `RAZORPAY_PRO_PLUS_PLAN_ID` Worker secret.
2. Set `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` Worker secrets (add billing on both providers).
3. Update the landing page pricing section to add the Pro+ tier card. Today the desktop voice-gated screen mentions Pro+, but the public marketing page still shows only Pro + Founding. Easy follow-up.
4. Test on a clean Windows VM before publishing v0.3.0 — voice mode is the first feature that touches the microphone permission flow on Windows. First-press will trigger the Windows microphone privacy prompt; verify the UX.

## 2026-05-01 Cost defenses + provider fallbacks (Day 11, v0.4.1)

**Context:** Founder-and-staff audit before launch. The voice-mode pipeline was running entirely on Cloudflare Workers AI free tier (10K neurons/day) and Gemini Flash 2.5 free tier (~50 RPD on AI Studio). Both held up during testing, but a few hot users would exhaust either quota by lunchtime in week 1, breaking the product for everyone else. Needed cost defenses that keep UX intact.

Also surfaced during the audit: when Gemini quota IS exhausted (which it was, mid-debugging), `/rewrite` returned a hard 502 — no graceful fallback. Total outage. Unacceptable for a paid product.

**Decision:**

1. **Rewrite cache (KV-backed, 24h TTL).** SHA-256 hash of `audience|text` keyed in KV. Cache hit returns the prior `Rewrites` JSON without ever calling Gemini. Cuts AI calls 30-50% on repeat patterns (templated greetings, status updates, follow-up emails). Skipped for inputs <20 chars (overhead not worth it). Cache hits still increment the per-IP daily cap so abuse tracking stays consistent.

2. **Skip-polish heuristic for `/voice`.** Whisper-large-v3-turbo produces clean text. If `detected_language === "en"` AND no filler regex matches (`um|uh|like|you know|matlab|...`), skip the polish LLM entirely and return the raw transcript. ~50% fewer polish calls for English speakers, also faster (one fewer round-trip). Logged as `polish_provider=skipped_clean` for telemetry.

3. **Provider fallback chain on `/rewrite`.** Gemini Flash 2.5 first (structured-output JSON, cheaper, faster). On any failure (network error, non-2xx status, parse failure), fall through to Workers AI Llama 3.3 70B with a JSON-coerced prompt. `/rewrite` now degrades gracefully instead of returning 502 when Gemini quota is hit. Same chain pattern as the `/voice` polish step.

4. **Edge-cache `/founding/count` for 60s.** The landing-page badge polls this on every visitor mount; previously hammered KV. Now Cloudflare Cache API holds a 60s response, so the count is at most 60s stale (founding count rarely changes anyway — at most 50 events in product lifetime). Cuts KV reads ~99% on this endpoint.

5. **Cron pre-warm via `/5 * * * *`.** Cloudflare cron triggers fire every 5 minutes; the scheduled handler is a no-op. The cron firing alone is enough to keep the v8 isolate warm so the next user request doesn't pay cold-start latency. Free under Workers' cron quota.

**Alternatives considered:**
- **Self-host Whisper on a GPU droplet.** Rejected — operational complexity > savings until 10K daily voice users. Also adds a single point of failure that Cloudflare Workers AI doesn't have.
- **Move /rewrite to Workers AI as primary, Gemini as fallback.** Tempting (Workers AI is free at scale), but Gemini's structured-output mode is materially more reliable at JSON correctness. Llama 3.3 occasionally adds preamble or breaks the schema; Gemini doesn't. Keep Gemini primary while it works.
- **Cache /voice transcripts.** Audio bytes vary too much (different sample rates, compressions) for a content hash to be useful. Skipped.
- **PostHog wired up for telemetry.** Deferred — needs founder to create account + share key. 30-min wire-in once that's done.

**Consequences:**
- (+) Free tier survives much longer. At 1000 daily users with realistic repeat patterns: ~50% of /rewrite + ~50% of /voice polish = effectively halved AI quota burn.
- (+) Resilience: `/rewrite` no longer breaks when Gemini quota is hit. Workers AI takes over transparently.
- (+) `/founding/count` no longer stresses KV under landing-page traffic spikes.
- (+) Cold-start latency hidden via cron warm.
- (−) Cache adds 1 KV read on every /rewrite (cache miss path now has 1 extra KV operation). Negligible at our scale; KV reads are nearly free below 100K/day.
- (−) Workers AI Llama produces marginally worse rewrites than Gemini Flash on edge cases (occasional preamble that the parser strips, occasional JSON field collapse). Acceptable as a degraded-mode fallback; users only see this output when Gemini is unavailable, which should be rare with the cache absorbing repeat traffic.

**Follow-ups (for v0.5.0+):**
- Audio downsampling in Rust (cpal config or post-capture resample) — cuts /voice upload bandwidth ~80% with zero accuracy hit.
- PostHog telemetry — needs API key.
- Sentry error reporting — needs API key.
- `cleanPolishOutput()` strips wrapping quotes; should also strip leading bullet markers and trailing "Hope this helps!" sign-offs that some models add.
- Cache invalidation strategy for when we change the system prompt (currently relies on TTL — old cache entries expire within 24h, but a full prompt rewrite means stale results for that window).

## 2026-05-01 Reply-to-thread mode (Day 12, v0.5.0)

**Context:** Tier 1 #2 from the launch-readiness audit. Alt+Space rewrites the user's draft — useful, but only solves half of email pain. The other half is "I don't know how to start a reply." That's where users currently switch tabs to ChatGPT, paste the email they received, ask for a reply, copy back. Five steps where Likho should do one.

**Decision:**

1. **New `mode` parameter on `/rewrite`** — values `"rewrite"` (default) and `"reply"`. Same endpoint, same response schema (4 fields), same audience-aware tones. The system prompt branches significantly per mode. Rejected: a separate `/reply` endpoint — would have meant duplicating cache + provider-fallback + rate-limit code for negligible gain.

2. **Reply system prompt is fundamentally different.** Rewrite mode says "preserve the user's intent." Reply mode says "generate what the user should send back." Reply prompt explicitly:
   - Treats input as the message *being replied to*, not the draft.
   - Generates a complete reply (greeting + body + sign-off appropriate to tone).
   - Addresses each ask in the original.
   - Leaves `[bracketed placeholders]` where specific info would need filling in (dates, names, numbers).
   - Always replies in clean English even if the input is Hindi/Hinglish.

3. **Cache key includes mode.** SHA-256 of `${mode}|${audience}|${text}` so reply and rewrite for the same input don't collide.

4. **Alt+R registered as a separate global shortcut.** Not a modifier on Alt+Space (which would have meant changing the existing UX) — a totally separate hotkey with its own handler. Both share the clipboard-capture mechanism.

5. **Tauri event payload changed to include mode.** `text-captured` now emits `{ text, mode }` instead of plain string. Frontend handles both shapes for backwards-compat (older listeners receiving a string fall back to `mode: "rewrite"`).

6. **Reply tones COPY to clipboard, don't replace selection.** The captured text in reply mode is the email being replied to — overwriting it would destroy the user's context. Click → clipboard copy + "Copied" toast + auto-hide overlay. User pastes in their reply box manually.

7. **Audience selector applies to reply mode too.** A reply to a senior reads very differently from a reply to a junior. Live re-roll on audience change works the same way.

**Alternatives considered:**
- **AI-detect intent automatically** (skip the explicit Alt+R, let AI decide whether the input is a draft to rewrite or a message to reply to). Rejected — ambiguity is real ("Hi can you send the file" could be either) and a wrong guess wastes a Gemini call. Explicit hotkey is cleaner.
- **Embed an email-thread parser** to handle long threads (Gmail/Outlook quote chains). Deferred — for v0.5.0, the user just selects whatever they want to reply to. Smart parsing can come in v0.6+ if real users complain about long thread handling.
- **Subject-line generator** as part of reply mode. Skipped — most replies inherit the "Re: …" subject line automatically, so generating one is unnecessary friction.
- **Reply WITHOUT audience selection** (just default to "professional"). Rejected — losing the differentiator that makes Likho feel Indian-aware.

**Consequences:**
- (+) Solves half of email pain that Likho previously couldn't touch.
- (+) Reuses everything: cache, provider fallback, audience UI, kbd shortcuts, tone cards. Build cost ~1 day.
- (+) Backwards-compatible at every layer: older Worker clients can ignore `mode` and get rewrite. Older desktop clients on a newer Worker still get rewrites. Newer desktop clients on an older Worker (impossible if they auto-update, but worth thinking about) get rewrites for their reply requests since the Worker would treat `mode: "reply"` as unknown and default to rewrite — they'd see a tone-rewrite of the email they received, not a reply. Acceptable degradation.
- (+) The bracketed-placeholder pattern is explicit in the prompt, so the model surfaces "what info I'd need from you" cleanly without breaking the JSON schema.
- (−) Reply quality on long email threads is unproven at v0.5.0. Long-thread parsing + reply context is a real challenge — current implementation just sends the raw selected text to the LLM. Real users will tell us where this breaks.
- (−) No way to "save as draft" — reply tones are ephemeral. User must paste before closing the overlay. Acceptable for v1; "save reply for later" is a v2 feature.

**Follow-ups for v0.6+:**
- **Subject-line generator** — when reply context lacks a clear "Re:" prefix, suggest one.
- **Reply-with-context** — let the user add a one-line hint like "(I'm declining, deal fell through)" to steer the reply. Currently no way to pass extra context.
- **Outlook plugin reply mode** — the plugin should expose Alt+R inside Outlook's reply pane natively, so users don't need to copy-paste.
- **Long-thread truncation** — if input > 4000 chars (Worker cap), trim to most-recent message + brief summary of older context.

## (Add more entries as we build)

> Template:
>
> ## YYYY-MM-DD Short Title
> **Context:**
> **Decision:**
> **Alternatives considered:**
> **Consequences:**
