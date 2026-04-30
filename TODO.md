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

## Day 7 — Self-test day (planned)

- [ ] Run through all real-world target apps: Outlook, Gmail web, WhatsApp Desktop, LinkedIn, Excel, Tally. Note where capture/replace fails.
- [ ] Test on long input (200+ chars). Verify overlay sizing or implement scroll/expand.
- [ ] Test multi-monitor positioning (overlay should clamp to monitor under cursor).
- [ ] Test rapid-fire Alt+Space presses (debounce/race conditions).
- [ ] Test on a fresh user clipboard (no prior content) and on one with rich-text content.
- [ ] Build the production .msi installer and run it on a clean Windows VM if available — verify no runtime/dep issues per MISTAKES.md.
- [ ] Compile a list of 20+ items found and prioritise into Day 7 evening fix-list.

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
| 7 | Self-test all day. Fix list of 20+ items. |

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
