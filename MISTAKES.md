# MISTAKES.md — What We've Already Learned The Hard Way

> Living document. Every time we hit a problem worth remembering, add it here. Future Claude (and future Chetan) will thank us.

> Format: **[Date] — Mistake.** What happened. What to do instead.

---

## Pre-Build Mistakes (added before any code is written, based on common Tauri/Windows/AI gotchas)

### [Apr 29, 2026] — Don't put the Anthropic API key in the desktop app
**What would happen:** A user could decompile the Tauri app, extract the key, and rack up your Anthropic bill in hours. This has happened to multiple indie devs publicly.
**Do instead:** Always proxy through Cloudflare Workers. The desktop app authenticates to your proxy with a Clerk JWT; the proxy holds the only Anthropic key.

### [Apr 29, 2026] — Don't use `WidthType.PERCENTAGE` for anything
**What would happen:** Tauri overlay window sizing breaks on high-DPI Windows displays.
**Do instead:** Always use absolute pixel dimensions in `tauri.conf.json` and CSS. Test on a 1080p AND a 4K monitor before shipping.

### [Apr 29, 2026] — Don't simulate Ctrl+C on a global hotkey thread
**What would happen:** Sometimes the simulated Ctrl+C gets swallowed by the source app and clipboard stays empty.
**Do instead:** Add 150ms delay AFTER the simulated Ctrl+C before reading clipboard. If clipboard is still empty after that, fall back to "ask the user to paste."

### [Apr 29, 2026] — Don't trust `cursor_position()` on multi-monitor setups in Tauri
**What would happen:** Overlay can appear on the wrong monitor or off-screen.
**Do instead:** Get cursor position, then call `monitor_at_position()` to clamp the overlay to that monitor's bounds.

### [Apr 29, 2026] — Don't ship without code signing on Windows
**What would happen:** Every install triggers Microsoft SmartScreen "this could harm your computer." 90%+ of users abandon.
**Do instead:** Buy at minimum an OV (Organisation Validation) cert before launch (~₹15,000/year via Sectigo, Comodo, or Indian reseller). Upgrade to EV (~₹40,000/year) once you have 2,000+ active users.

### [Apr 29, 2026] — Don't optimize prematurely with caching
**What would happen:** You spend 2 days building an LRU cache for AI responses. Users hate the stale-cache results.
**Do instead:** Skip caching in v1. Claude Haiku 4.5 at ₹0.10/rewrite is cheap enough that caching saves <₹500/month at v1 scale and isn't worth the complexity.

### [Apr 29, 2026] — Don't make the user wait for AI to render the overlay
**What would happen:** Overlay only appears after AI responds (2 seconds). Feels broken.
**Do instead:** Show overlay immediately with a spinner. AI populates rewrites when ready. Cancel button if user changes mind.

### [Apr 29, 2026] — Don't enforce daily limits client-side
**What would happen:** A determined user inspects local storage and resets their counter. You lose money.
**Do instead:** Daily limit enforcement happens in the Cloudflare Worker, against Supabase. Client-side is for UX only ("17/20 rewrites today").

### [Apr 29, 2026] — Don't log user text content
**What would happen:** Users send legal contracts, medical info, salary negotiations through Likho. If you log content, you're storing PII and potentially violating DPDP Act when it kicks in May 2027. You also become a juicy hacking target.
**Do instead:** Log metadata only (char count, tone selected, response time, model used). Never store the text.

### [Apr 29, 2026] — Don't put the Razorpay key on the client
**What would happen:** Users can manipulate subscription state.
**Do instead:** Razorpay subscription creation goes through the Cloudflare Worker. Client only receives the short_url to redirect to.

### [Apr 29, 2026] — Don't skip Razorpay KYC until you need it
**What would happen:** You finish the build day 28, then realize Razorpay needs 5–10 days for KYC approval. Launch slips by a week.
**Do instead:** Submit Razorpay KYC on Day 1 of the build. Even if you don't need it for 2 weeks, the clock is ticking.

### [Apr 29, 2026] — Don't show a generic "error occurred" to users
**What would happen:** Users abandon and never reopen.
**Do instead:** Specific friendly errors. "Looks like your internet's slow — let me try again?" or "We're a bit overloaded right now, please try in a minute." Indian English casual register.

### [Apr 29, 2026] — Don't ship without testing on a clean Windows VM
**What would happen:** Works on your dev machine, breaks on a fresh install (missing VC++ runtime, missing WebView2, etc.).
**Do instead:** Spin up a Windows 11 VM in VirtualBox or use a separate physical machine. Test the .msi installer flow end-to-end on an OS that has never seen your dev tools.

### [Apr 29, 2026] — Don't let the overlay window steal focus from typing
**What would happen:** User is mid-sentence in Outlook, hits hotkey, overlay appears, then can't keep typing in Outlook because focus left.
**Do instead:** Only steal focus when the user clicks inside the overlay. Initial appearance should be `noActivate` style on Windows. Use `set_focus(false)` on first show.

### [Apr 29, 2026] — Don't use `axios` in the Cloudflare Worker
**What would happen:** Workers don't have full Node.js runtime. axios will silently fail or balloon bundle size.
**Do instead:** Use the native `fetch()` API. Workers support it natively, zero bundle cost.

### [Apr 29, 2026] — Don't trust the Anthropic JSON output format
**What would happen:** Sometimes Claude wraps the JSON in ```json...``` markdown blocks. JSON.parse() throws.
**Do instead:** Strip markdown code fences before parsing. Or use `tool_use` (structured outputs) to force schema compliance.

```typescript
function safeParse(text: string): Rewrites {
  const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}
```

### [Apr 29, 2026] — Don't ship `console.log` statements
**What would happen:** Tauri logs to a file by default. User support requests will include logs full of your debugging noise.
**Do instead:** Use a real logger (`tracing` in Rust, `pino` or just custom function in TS). Set log level to `info` in production, `debug` in dev.

---

## Mistakes Discovered During Build (add as we go)

> When something breaks, add it here BEFORE fixing it. Then fix. Then verify.

### Template:
### [DATE] — Short title
**What happened:** [What went wrong]
**Root cause:** [Why it went wrong]
**Fix:** [What we did]
**Prevention:** [How to avoid in future]

### [Apr 30, 2026] — Tauri 2 webview hangs forever on `listen()` if no capabilities file exists
**What happened:** Frontend `listen("text-captured", ...)` from `@tauri-apps/api/event` never resolved. UI rendered but events from Rust were never received. Spent ~30 minutes adding debug instrumentation before realizing.
**Root cause:** Tauri 2 uses an ACL/capabilities system. If `src-tauri/capabilities/*.json` doesn't exist, the generated capabilities are `{}` — meaning the webview has zero IPC permissions. `listen()` makes an IPC call to register the listener; that call hangs forever (not rejects) because the permission isn't denied so much as not granted.
**Fix:** Created `src-tauri/capabilities/default.json` with `core:default`, `core:event:default`, `core:window:default`, `core:webview:default` and `windows: ["overlay"]`.
**Prevention:** Every new Tauri 2 project needs a capabilities file from day one. The Tauri CLI scaffold normally creates one; if you scaffold manually (we did), you have to add it. If `listen()` calls hang silently, suspect capabilities first.

### [Apr 30, 2026] — `tauri-plugin-global-shortcut` deadlocks when handler calls `on_shortcut`/`unregister`
**What happened:** App froze ("not responding") on every Alt+Space press. Windows logged `AppHangB1` in the Application event log.
**Root cause:** The plugin's event dispatcher holds an internal `Mutex<HashMap>` for the *entire duration* of the user's handler invocation (see `tauri-plugin-global-shortcut-2.3.1/src/lib.rs:417`). Calling `on_shortcut(...)` or `unregister(...)` from inside the handler tries to take the same Mutex → deadlock → UI thread freezes → AppHang.
**Fix:** Defer dynamic register/unregister to a separate `std::thread::spawn` so the handler returns and releases the lock before the (un)registration runs.
**Prevention:** Never call any plugin method that touches the shortcuts registry from inside `with_handler`. If you need dynamic register/unregister (we do — we register Escape only when overlay is visible), use `thread::spawn`.

### [Apr 30, 2026] — Global `with_handler` fires for every shortcut, not just the one you registered
**What happened:** After fixing the deadlock, pressing Esc would hide the overlay and then immediately re-show it near the cursor.
**Root cause:** `tauri-plugin-global-shortcut`'s dispatcher calls BOTH the per-shortcut handler set via `on_shortcut("Escape", ...)` AND the global handler set via `with_handler(...)` for every event. Esc hid the overlay (per-shortcut), then the global handler ran, saw `is_visible == false`, and re-opened it.
**Fix:** In the global handler, guard with `if shortcut.key != Code::Space { return; }` so only Alt+Space triggers the toggle logic.
**Prevention:** When using both `with_handler` and `on_shortcut`, always check which shortcut fired in the global handler.

### [Apr 30, 2026] — Don't simulate Ctrl+C while the user is still holding Alt
**What happened:** Selected text capture worked locally for hand-held tests but produced empty clipboard on real Alt+Space presses.
**Root cause:** The global hotkey handler fires the moment the OS detects Alt+Space. The user's physical Alt key is still held down. Sending synthetic Ctrl+C immediately means the app sees Ctrl+**Alt**+C, which is not a copy command. Clipboard stays empty.
**Fix:** Sleep ~80ms before sending Ctrl+C so the user has time to release Alt. As a safety net, also send a synthetic Alt-up via enigo first. Use `Key::Other(0x43)` (VK_C) instead of `Key::Unicode('c')` for more reliable accelerator handling on Windows.
**Prevention:** Any "synthesise an OS shortcut from inside a hotkey handler" flow needs to wait for the trigger key to be released first.

### [Apr 30, 2026] — `app.emit()` doesn't reach hidden-then-shown webview's listeners reliably
**What happened:** Even with capabilities fixed, broadcasting `app.emit("text-captured", ...)` from a spawned Rust thread sometimes didn't reach the React listener.
**Root cause:** Not fully nailed down — likely an ordering quirk between webview lifecycle (hidden→shown) and the global emit channel on Windows + WebView2. The window-scoped emit went through reliably while the broadcast didn't.
**Fix:** Use `app.get_webview_window("overlay").emit("text-captured", ...)` instead of `app.emit(...)`. Window-scoped emits go through the window's IPC channel directly and don't rely on the broadcast routing.
**Prevention:** When emitting to a *known* target window, prefer `window.emit()` over `app.emit()`. Reserve `app.emit()` for genuine multi-window broadcasts (which we don't have).

### [Apr 30, 2026] — Google Cloud API keys are blocked from Gemini API by default in Workspace orgs
**What happened:** Used a Google API key from a personal-looking Cloud Console project; got `API_KEY_SERVICE_BLOCKED` even after enabling Gemini API on the project.
**Root cause:** If the Google account is part of a Workspace organisation (`@spectatr.ai`, etc.), an org policy blocks API keys from accessing Vertex/Gemini APIs unless the key is bound to a service account. Even creating a "new project" inside that org inherits the policy.
**Fix:** Use a personal `@gmail.com` account with Google AI Studio (`https://aistudio.google.com/apikey`) — keys created there are on Google-managed projects outside any org policy.
**Prevention:** For free-tier Gemini access, always use AI Studio with a personal Google account. Never use the same account that's tied to a Workspace org.

---

## Mistakes Discovered Post-Launch

> User-reported issues that taught us something. Each one becomes a permanent guard rail.

(Empty until launch.)

---

## Meta-Mistakes (Process, Not Code)

### [Apr 29, 2026] — Don't build before talking to 5 users
**What would happen:** 30 days of building, 0 paying customers, idea was wrong.
**Do instead:** Week 1 = 5 user conversations BEFORE writing real code. Validate the pain, the tone, the price point. If 3+/5 don't say "yes I would pay", pivot now.

### [Apr 29, 2026] — Don't add features users haven't asked for
**What would happen:** v1 ships at day 60 with 12 features instead of day 30 with 5.
**Do instead:** Strict P0 list (in PRD). Anything not on it goes to v1.1 backlog. The phrase "great idea, on the v2 roadmap" is your most-used response in week 4.

### [Apr 29, 2026] — Don't try to make the founding launch viral
**What would happen:** You burn launch energy on a Product Hunt that gets 12 upvotes.
**Do instead:** First 30 paying users come from your 1,000-person network through direct outreach. NOT from a public launch. Public launch is week 4, after you have testimonials and have fixed the obvious bugs.
