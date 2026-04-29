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

## (Add more entries as we build)

> Template:
>
> ## YYYY-MM-DD Short Title
> **Context:**
> **Decision:**
> **Alternatives considered:**
> **Consequences:**
