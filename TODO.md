# TODO.md — Current Sprint

> Update this at the end of every session. Mark completed items with [x].

## Today: Day 1 — Setup + Scaffold ✅

- [x] Open Claude Code in project folder. Scaffold Tauri 2.0 + React + TypeScript.
- [x] Configure Tailwind CSS with brand colours (likho-indigo, likho-cream, etc.).
- [x] Configure tauri.conf.json with overlay window settings (380x220, frameless, transparent, always-on-top).
- [x] Add global-shortcut, clipboard-manager, updater plugins.
- [x] Create hello-world overlay with system tray, Alt+Space toggle, Esc-to-close.
- [x] Verify `npm run tauri build --debug` succeeds — produces .exe, .msi, .nsis.
- [ ] Buy domain `likho.ai` (or chosen alternative). Cost ~₹2,000.
- [ ] Submit Razorpay KYC application (5–10 day approval window).
- [ ] Send the warm-network message to your 1,000-person group. Aim for 5 replies.
- [ ] Schedule 5 user conversations for this week (15 min each).

## Day 2 — Cursor-Positioned Overlay ✅

- [x] Position overlay near cursor on Alt+Space (cursor_position + monitor clamping).
- [x] Toggle behaviour: Alt+Space shows/hides.
- [x] Esc-to-close (global shortcut while visible, plus fallback in-window handler).
- [x] Overlay does NOT steal focus from source app on first appearance.
- [x] Monitor-bounds clamping so overlay never appears off-screen.
- [x] Shows "Hello, [current time]" updating every second.

## Day 3 — Selected Text Capture ✅

- [x] Implement Ctrl+C clipboard capture from any app (SKILLS.md pattern).
- [x] Save + restore original clipboard content after capture (per SKILLS.md).
- [x] Display captured text in the overlay instead of time.
- [x] Handle empty clipboard gracefully ("Select some text first" message).
- [x] 150ms delay after simulated Ctrl+C before reading clipboard (per MISTAKES.md).

## Day 6 — Hinglish Auto-Detection ✅

- [x] Proxy: added `detected_language: "english" | "hinglish" | "mixed"` to the `responseSchema`. Enum-restricted so the model can't return an arbitrary value.
- [x] Proxy: re-tuned system prompt with explicit detection rules (romanised Hindi specifically — Indian English idioms like "do the needful" classify as `english`, not Hinglish).
- [x] Proxy: defensive parse falls back to `"english"` if the field is missing or unrecognised.
- [x] Proxy: log `lang=` on every successful call (metadata only, never content).
- [x] Desktop UI: small "Hinglish" / "Mixed" badge next to the captured-text snippet in the `done` state. English is silent default.
- [x] Switched `gemini-2.5-flash` → `gemini-2.5-flash-lite` mid-day after the flash free tier (~20 req/day) ran out. DECISIONS.md has the variant note.
- [x] Verified all 5 cases: pure English idiom, pure Hinglish, mixed, short Hinglish ("kya haal hai bhai"), single-Hindi-word edge case ("Looking forward to the meeting yaar").

## Day 7 — UI polish + glass theme ✅

(The Day 7 self-test pass moves to Day 9; founder pivoted Day 7 to a UI/UX polish pass and Day 8 to demo mode + waitlist for pre-launch validation. See DECISIONS.md.)

- [x] Glass theme: dark transparent surface, white text hierarchy, saffron-orange accents (Indian-flavoured, replaces brand indigo for accents on glass).
- [x] Native Windows Acrylic blur via `window-vibrancy` crate. CSS backdrop-filter doesn't blur the OS desktop in WebView2 — needed the OS API. Light tint (`(0,0,0,50)`) keeps the desktop genuinely visible.
- [x] Window resized 380×220 → 440×320 to give three tone cards room to breathe.
- [x] Fade-in + slight slide-down animation (200ms ease-out) on every overlay-shown event (re-triggered via React key bump).
- [x] Tone cards: hover bumps to subtle saffron tint + 1% scale, label flips to white. Click affordance now obvious on glass.
- [x] Lucide icons for each tone (Briefcase / Zap / Smile) and the language badge (Languages icon).
- [x] Skeleton shimmer cards while AI is computing — same outer shape as live cards, two grey shimmer bars per card.
- [x] "Replaced ✓" emerald check toast for 1s after a successful click-to-replace; overlay then auto-hides.
- [x] Empty-state: cursor-icon-in-circle with `Alt + Space` shown as keycap-style `<kbd>` badges.
- [x] Esc hint in footer styled as a `<kbd>` badge.
- [x] index.css: text-shadow on body for legibility against bright wallpapers behind the glass; thin custom scrollbar.

## Day 8 — Demo mode + founding-member waitlist + Pro teaser ✅

- [x] First-launch intro screen: "Try Likho free — 5 rewrites, no signup".
- [x] localStorage demo counter capped at 5 lifetime.
- [x] Subtle "X of 5 demo rewrites used" pill on each rewrite.
- [x] Gated screen at 5: two CTAs — sign-up free (placeholder for Clerk Day 9+), reserve founding spot.
- [x] Pro teaser pill in overlay corner; glass modal with launch copy + email-capture.
- [x] Email capture writes to Cloudflare KV via worker `/waitlist`. Returns position. Local KV mock works in `wrangler dev`.
- [x] Live "X spots left" pulled from `/waitlist/count` (falls back to hardcoded 37 if worker unreachable).
- [x] DECISIONS.md entry for "demo + waitlist before auth/DB".

## Day 12 — Reply-to-thread (v0.5.0) ✅

- [x] Worker `/rewrite` accepts `mode: "rewrite" | "reply"`. Default `"rewrite"` for backwards compat.
- [x] New `buildReplySystemPrompt(audience)` — generates 3 distinct REPLIES (greeting + body + sign-off) instead of rewrites. Adapts to audience.
- [x] Cache key includes mode (`${mode}|${audience}|${text}` SHA-256) so reply and rewrite don't collide.
- [x] `callGemini` and `callWorkersAIRewrite` both threaded through the mode parameter.
- [x] Rust: registered `Alt+R` global shortcut alongside Alt+Space and Alt+V.
- [x] Rust: new `handle_alt_r()` — captures selection, opens overlay, emits `text-captured` with `mode: "reply"`.
- [x] Rust: `text-captured` payload changed from `String` to `CapturedText { text, mode }` (serde-serialized). Backwards compatible — frontend accepts both shapes.
- [x] Frontend: new status states `replying` and `reply_done`. Audience pill row + skeleton cards during loading. Same ToneCard component, but click → clipboard copy (not replace selection).
- [x] Frontend: `ReplyHeader` ("Replying to" label) and `ReplyDoneFooter` ("Click a tone to copy · Paste in your reply box").
- [x] Frontend: kbd 1/2/3 shortcuts work in reply_done state too.
- [x] Frontend: audience-change re-rolls reply tones live, same as rewrite mode.
- [x] Frontend: `no_selection` screen now adapts copy based on mode ("Select the email to reply to" vs "Select some text first").
- [x] DECISIONS.md entry on the design call (separate hotkey, mode param, click-to-copy semantics).
- [x] CLAUDE.md "Current Phase" updated to Day 12.
- [x] v0.5.0 built, signed, released. v0.4.x users auto-update on next launch.

## Day 11 — Cost defenses + UX polish (v0.4.0 + v0.4.1) ✅

### v0.4.0 — Hierarchy-aware tones
- [x] Worker `/rewrite` accepts `audience: "auto"|"senior"|"peer"|"junior"`. System prompt branches per audience; same JSON output schema. Adapted for Indian workplace hierarchy (formal/deferential for senior, direct for peer, action-oriented for junior).
- [x] Desktop: audience pill row above tone cards. Sticky preference. Click while a rewrite is showing → live re-roll for the new audience.
- [x] Tone labels adapt: Auto = Professional/Concise/Friendly · Senior = Formal/Brief/Polite · Peer = Direct/Brief/Casual · Junior = Clear/Brief/Encouraging.
- [x] UI calmed down: orange reserved for primary actions, removed accent gradient lines, softened header to "Rewriting" indicator + dot, kbd 1/2/3 hints on tone cards.
- [x] Window grew 440×320 → 460×380 to accommodate the audience selector cleanly.

### v0.4.1 — Cost defenses
- [x] Worker: rewrite cache (SHA-256 of `audience|text` → KV, 24h TTL). Skips Gemini call entirely on cache hit. ~30-50% AI savings projected once users have repeat patterns.
- [x] Worker: skip-polish heuristic in `/voice`. Clean English transcripts (no filler regex match) bypass the polish LLM. ~50% fewer polish calls for English speakers.
- [x] Worker: edge-cached `/founding/count` for 60s via Cache API. ~99% fewer KV reads on landing-page polling.
- [x] Worker: `/health` endpoint + cron `*/5 * * * *` pre-warm. Cold-start latency hidden.
- [x] Worker: Gemini → Workers AI Llama 3.3 70B fallback for `/rewrite`. Quota exhaustion no longer breaks the product (caught during testing — Gemini hit 429, would have been a hard outage without this).
- [x] Desktop: audience selector collapsed into single pill (`Audience: Auto ▾`) with click-to-expand. Saves ~70% of pre-existing visual chrome.
- [x] Desktop: demo counter only shown when ≤2 left, with positive framing ("2 demo rewrites left" instead of "1 of 5 used"). Less anxiety on every action.
- [x] Desktop: footer hints `Click a tone or press 1 / 2 / 3`. Keyboard shortcuts now discoverable.
- [x] DECISIONS.md entry on cost-defense rationale + provider fallback design.
- [x] COSTS.md created — projected per-user costs and break-even points at scale.

### Outstanding (v0.6.0+)
- [x] ~~Reply-to-thread (Alt+R)~~ — shipped in v0.5.0.
- [ ] **Personal style learning** — track tone picks locally, surface "your usual" hints. Tier 1 #3.
- [ ] **Per-recipient memory** — extension of style learning, keyed by recipient email. Tier 1 #4.
- [ ] **WhatsApp mode** — detect WhatsApp window, switch tones to short-form + emoji intelligence. Tier 1 #5.
- [ ] **Audio downsampling in cpal** — 16kHz mono before WAV encode. Cuts upload ~80%.
- [ ] **PostHog telemetry** — founder needs to create account + provide API key.
- [ ] **Sentry error reporting** — same.
- [ ] **First-run interactive demo** — embed a textarea in the intro screen with sample text + inline rewrite, so users feel the magic before going to a real app.
- [ ] **Tray icon state** — orange dot when busy/recording, default otherwise.
- [ ] **Outlook plugin** — biggest single unlock for crossing ₹5Cr ARR. Captures email at point of use.
- [ ] **Pro+ Razorpay plan** — founder action: create plan in dashboard, set `RAZORPAY_PRO_PLUS_PLAN_ID` Worker secret.
- [ ] **Code-signing cert** — buy at 200+ paying users.

## Day 10 — Voice mode (Alt+V) + Pro+ tier (v0.3.0) ✅

- [x] Worker: `POST /voice` endpoint. Accepts multipart audio + email, server-side entitlement gate (founding or pro_plus only — plain Pro and Free get 403 with upgrade nudge), per-email daily cap (100 clips/day).
- [x] Worker: Whisper-1 transcription with `verbose_json` so we get auto-detected language. Audio bytes never persisted — passed straight to OpenAI, then dropped.
- [x] Worker: Claude Haiku 4.5 polish step using the locked `VOICE_POLISH_PROMPT`. Falls back to raw transcript if polish fails so user always gets *something*.
- [x] Worker: `/license/check` extended with `entitlements: { unlimited_rewrites, voice_mode }` and `pro_plus` tier value. Backwards-compatible — older clients ignore the new field.
- [x] Worker: `POST /razorpay/subscription_pro_plus` — same as existing Pro endpoint but uses `RAZORPAY_PRO_PLUS_PLAN_ID` env var. Returns `pro_plus_not_configured` until founder sets the env.
- [x] Worker: `/razorpay/verify` now Razorpay-API-resolves the subscription's `plan_id` to determine whether it's Pro or Pro+ — writes to the correct KV prefix, sends the right welcome email.
- [x] Worker: `/razorpay/webhook` updates either `pro:subscription:*` or `pro_plus:subscription:*` records depending on which exists.
- [x] Worker: privacy logs only — `total_ms`, `whisper_ms`, `polish_ms`, `duration_s`, `lang`, `transcript_chars`, `polished_chars`, `email_chars`. Never the transcript or polished output.
- [x] Rust: `cpal` + `hound` deps added; bumped to v0.3.0.
- [x] Rust: `audio.rs` module — dedicated audio thread (cpal::Stream is !Send on Windows), command-channel API, supports F32/I16/U16 sample formats, encodes 16-bit PCM WAV via hound. 90s safety cap on the buffer.
- [x] Rust: registered `Alt+V` global shortcut alongside `Alt+Space`. Press-and-hold semantics — Pressed shows overlay + emits `voice:start`, Released emits `voice:stop`. JS owns license check + flow control.
- [x] Rust: `voice_start` / `voice_stop` / `voice_cancel` Tauri commands.
- [x] Rust: `voice_cancel` invoked on Esc-during-recording so we don't leak a hot mic.
- [x] Frontend: `voice_recording` / `voice_polishing` / `voice_done` / `voice_gated` / `voice_error` / `copied` status states.
- [x] Frontend: pulsing red dot + live elapsed timer + "auto-stops in Ns" warning under 10s remaining.
- [x] Frontend: 60s hard auto-stop timer in JS; Rust audio thread caps at 90s as backup.
- [x] Frontend: voice-gated screen with two-tier upgrade copy (Pro+ ₹499/mo · Founding ₹4,900 lifetime).
- [x] Frontend: voice-done flow — polished text becomes the input to `/rewrite` for 3 tones; click any tone → clipboard copy via `@tauri-apps/plugin-clipboard-manager` + "Copied ✓" toast.
- [x] Frontend: `LicenseTier` extended to include `pro_plus`; `LicenseCacheEntry.entitlements` added; `hasVoiceEntitlement` helper. Backwards-compat for pre-0.3.0 cached licenses (founding stays on voice).
- [x] DECISIONS.md entry on the architecture + tier pricing call.
- [x] PRD-COMPACT.md updated — voice moved from P1 to v1.0 and gated to Pro+, Pro tier no longer promises voice.
- [x] CLAUDE.md "Current Phase" updated to Day 10.
- [x] Worker: provider auto-routing — Workers AI `whisper-large-v3-turbo` (free) is the default ASR; Workers AI `llama-3.3-70b-instruct-fp8-fast` (free) is the default polish. Setting `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` Worker secrets switches the respective step to the paid provider. Test phase runs entirely free.
- [x] `wrangler.toml`: `[ai]` binding added so the Workers AI client is available with no extra config.
- [ ] **Outstanding (founder action):**
  - **Free testing path (now):** `cd proxy && wrangler deploy`. Workers AI is auto-bound — no API keys needed. Voice mode works immediately for founding members.
  - When ready for production-grade quality: `wrangler secret put OPENAI_API_KEY` (Whisper-1) and `wrangler secret put ANTHROPIC_API_KEY` (Claude Haiku 4.5). Code stays the same.
  - Create Razorpay Pro+ plan (₹499/mo recurring), set `RAZORPAY_PRO_PLUS_PLAN_ID` Worker secret. Until then voice unlocks only via founding membership.
  - Add Pro+ tier card to landing page pricing section.
  - Test on a clean Windows VM — first Alt+V triggers the Windows microphone privacy prompt; verify the UX.
  - Build + sign + release v0.3.0 (`cargo tauri build` with `TAURI_SIGNING_PRIVATE_KEY` env var, then GitHub Releases upload).

## Day 9 — Marketing landing page ✅

- [x] Scaffolded `web/` with Next.js 14 (App Router) + TailwindCSS + Framer Motion + lucide-react. Brand tokens mirror `desktop/tailwind.config.js`.
- [x] Aesthetic: white frosted-glass cards on a sunrise/sunset radial-gradient background. Inverted-glass counterpart of the desktop dark glass.
- [x] All 8 sections per brief: Hero / Problem / How it works / Features / Pricing / Founder note / FAQ / Footer.
- [x] **Interactive hero mockup**: textarea, 3 sample-text chips, "Try it" button → posts to Worker `/landing-rewrite`. Renders the same three-tone-card animation as the desktop overlay (Briefcase / Zap / Smile icons), with click-to-copy on each tone.
- [x] **Worker `/landing-rewrite` endpoint** with per-IP daily cap (3/day) backed by KV. Returns 429 with friendly copy after 3 calls.
- [x] **Founding-member email capture** (`WaitlistForm`) posts to `/waitlist` — same endpoint and same KV table the desktop app uses. Returns "you're #N" confirmation.
- [x] Scroll-triggered fade-up on each section (Framer Motion `whileInView`, `once: true`).
- [x] OpenGraph + Twitter card metadata in `app/layout.tsx`. References `/og-image.png` and `/favicon.svg` (asset files not created yet — preview cards will be image-less until those land).
- [x] Production build clean: 42.8 kB route, 130 kB First Load JS.
- [x] **Deployed:** `https://web-6nykedtei-hypnoplayzzs-projects.vercel.app` (Vercel, account `hypnoplayzz`).
- [ ] **Outstanding (founder action):** see DECISIONS.md 2026-04-30 (Day 9). Runs needed: `wrangler login` → `wrangler kv:namespace create LIKHO_KV` → `wrangler secret put GEMINI_API_KEY` → `wrangler deploy` → `vercel env add NEXT_PUBLIC_API_BASE` → `vercel --prod`. Until then, demo + waitlist surface friendly errors on the deployed page.
- [ ] **Outstanding (assets):** `web/public/og-image.png` (1200×630) and `web/public/favicon.svg`. Not blocking launch; preview cards just won't have hero image on social shares.
- [ ] **Outstanding (domain):** purchase `likho.ai`, then `vercel domains add likho.ai`.

## Day 9+ — Self-test pass + auth/DB rollout (deferred)

- [ ] Run through all real-world target apps: Outlook, Gmail web, WhatsApp Desktop, LinkedIn, Excel, Tally. Note where capture/replace fails.
- [ ] Test long input (200+ chars), multi-monitor positioning, rapid-fire Alt+Space, fresh/rich-text clipboard.
- [ ] Build production `.msi` installer; test on clean Windows VM.
- [ ] Provision Cloudflare KV namespace for waitlist (1 command).
- [ ] Provision Supabase project + migrate waitlist out of KV into a real `founding_member_waitlist` table.
- [ ] Provision Clerk; wire the gated-screen sign-up CTA to magic-link.
- [ ] Server-side demo rate limit (currently client-only via localStorage; install-id fingerprint can land here).

## Day 5 — Three Tones + Click-to-Replace ✅

- [x] Proxy: switch `/rewrite` to return JSON with `professional`, `concise`, `friendly`. System prompt re-tuned with per-tone guidance (formal vs short vs warm).
- [x] Proxy: enforce JSON output via Gemini `responseMimeType: "application/json"` + `responseSchema` so we don't rely on prompt-following alone (per MISTAKES.md "Don't trust the AI JSON output format"). Defensive code-fence stripping kept as a belt-and-braces parse.
- [x] Proxy: bumped `maxOutputTokens` 800 → 1200 for the wider payload.
- [x] Rust: `replace_selection(new_text)` Tauri command — hide overlay, save clipboard, set new text, simulate Ctrl+V (with VK_V + Alt-release safety), restore clipboard 500ms later in a spawned thread.
- [x] Desktop UI: rebuilt `done` state with three clickable tone cards. Hover/focus styles in likho-indigo. Click → invoke `replace_selection`.
- [x] Verified: Indian English idiom rewrite, click-to-replace into Notepad, Hinglish input, empty-selection regression.

## Day 4 — End-to-End AI Rewrite ✅

- [x] Scaffold `proxy/` Cloudflare Worker (wrangler.toml, tsconfig, package.json, .dev.vars/.dev.vars.example, .gitignore).
- [x] Implement single `POST /rewrite` endpoint — input validation, CORS, error mapping, cost-guard logging (chars + timing only, never content).
- [x] Switch default model from Claude Haiku 4.5 to Gemini Flash 2.5 (DECISIONS.md 2026-04-30).
- [x] Disable Gemini's "thinking" mode for rewrite calls — keeps latency under the 2.5s CLAUDE.md budget.
- [x] Wire desktop to proxy: capture → POST → render rewrite. Spinner + friendly error states (no jargon).
- [x] Capabilities file: `src-tauri/capabilities/default.json` — without it, Tauri 2 IPC silently hangs.
- [x] Fix global-shortcut deadlock (defer register/unregister to spawned threads).
- [x] Fix Esc-reopens-overlay bug (filter global handler on `Code::Space`).
- [x] Fix Ctrl+C empty-clipboard bug (80ms delay so user releases Alt; force Alt-up; use VK_C).
- [x] Verified end-to-end: Hinglish input ("mera naam chetan hai kripya kaam dhang se karo") → clean professional English in ~1.6s.
- [x] MISTAKES.md updated with all six lessons learned today.

## This Week (Days 1–7): Foundation

| Day | Goal |
|---|---|
| 1 | Setup + validation prep ✅ goal |
| 2 | Hello-world overlay on hotkey |
| 3 | Selected text capture from any app ✅ |
| 4 | First AI rewrite end-to-end (single tone, no auth yet) ✅ |
| 5 | 3 tone variants + click-to-replace ✅ |
| 6 | Hinglish auto-detection mode ✅ |
| 7 | UI polish: glass theme, animations, icons, skeletons, replaced toast ✅ |
| 8 | Demo mode + founding-member waitlist + Pro teaser modal ✅ |
| 9 | Marketing landing page (web/) ✅ |
| 10 | Voice mode (Alt+V) + Pro+ tier — Whisper + Claude Haiku polish ✅ |
| 11 | Hierarchy-aware tones + cost defenses + UX polish (v0.4.0/v0.4.1) ✅ |
| 12 | Reply-to-thread (Alt+R) — v0.5.0 ✅ |
| 13+ | Style learning · per-recipient memory · WhatsApp mode · self-test on Windows VM · pricing-page Pro+ card · Outlook plugin |

## Backlog (not yet scheduled)

- Multi-monitor edge case testing
- Dark mode toggle
- Custom tone preset editor
- Phrase memory over time
- Outlook desktop plugin
- Browser extension fallback for Google Docs
- Mobile companion app

## Blocked / Waiting

- Razorpay KYC approval (started Day 1)
- Domain DNS propagation (after purchase)
- Code signing cert order (place Day 14, lead time ~3–5 days)

## Done

(empty — fill as you complete items)

---

## Validation Conversations Tracker

> Aim for 5 by end of week 1. If 3+/5 say "yes I'd pay ₹299/mo for this", proceed to build. If not, pause and reassess.

| # | Name | Role | Day | Outcome | "Would pay?" |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
