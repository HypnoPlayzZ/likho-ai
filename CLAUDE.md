# CLAUDE.md — Project Context for Likho.ai

> **Read this file first at the start of every session.** It contains everything you need to be productive on this codebase without re-asking the user.

---

## Project: Likho.ai

A Windows desktop AI overlay that helps Indian professionals write better English in any application — Outlook, Gmail web, WhatsApp Desktop, LinkedIn, Excel, Tally, anywhere.

**One-line product:** Press a hotkey anywhere on Windows → AI rewrites your selected text in 3 professional tones in 2 seconds.

**Why it exists:** ~200M Indian knowledge workers write business English daily as a second language. Existing tools (Grammarly, ChatGPT in browser) have high friction, no Indian context, no Hinglish support. Likho is desktop-native, Indian-context-aware, ₹299/month.

---

## Owner & Operating Context

- **Founder:** Chetan (solo, India-based)
- **Time available:** Build over ~30 days, 4–6 hrs/day
- **Coding mode:** Heavy use of Claude Code (CLI) + Claude in VS Code
- **Distribution channel for launch:** ~1,000-person warm Indian network
- **First paying users target:** 10–30 within 14 days of launch
- **Year-1 MRR target:** ₹15–18 lakh (~$18K USD)

---

## Architecture (one screen)

```
┌─────────────────────────────┐         ┌──────────────────────┐
│ Windows Desktop App         │  HTTPS  │ Cloudflare Workers   │
│ (Tauri 2.0 + React + Rust)  │ ──────► │ (API Proxy + Auth)   │
│                             │         │                      │
│ - Global hotkey (Alt+Space) │         │ - Hides Anthropic key│
│ - Clipboard text capture    │         │ - Rate limiting      │
│ - Floating overlay UI       │         │ - Usage logging      │
│ - System tray               │         └──────────┬───────────┘
└──────────────┬──────────────┘                    │
               │                                   ▼
               │                          ┌──────────────────┐
               │                          │ Claude Haiku 4.5 │
               │                          │ (rewrite engine) │
               │                          └──────────────────┘
               │
               ▼
        ┌──────────────────┐         ┌──────────────────┐
        │ Clerk (auth)     │         │ Supabase         │
        │ Email magic-link │         │ (Postgres: users,│
        └──────────────────┘         │  usage, billing) │
                                     └──────────────────┘

        ┌──────────────────┐
        │ Razorpay         │
        │ (subscriptions,  │
        │  UPI primary)    │
        └──────────────────┘
```

---

## Repo Structure (target)

```
likho-ai/
├── CLAUDE.md            # This file — project context
├── SKILLS.md            # Patterns and techniques to use
├── MISTAKES.md          # Pitfalls to avoid (updated as we hit them)
├── DECISIONS.md         # Architecture decision log
├── PROMPTS.md           # Reusable prompts for common tasks
├── PRD-COMPACT.md       # Condensed PRD for quick reference
├── TODO.md              # Current sprint task list
├── README.md            # Public-facing project description
├── .gitignore
│
├── desktop/             # Tauri desktop app
│   ├── src/             # React + Tailwind frontend
│   ├── src-tauri/       # Rust backend
│   ├── package.json
│   └── tauri.conf.json
│
├── proxy/               # Cloudflare Worker (AI proxy)
│   ├── src/
│   ├── wrangler.toml
│   └── package.json
│
├── web/                 # Landing page (likho.ai)
│   ├── src/
│   └── package.json
│
└── docs/                # Internal docs, screenshots, etc.
```

---

## Tech Stack — Locked In

| Layer | Choice | Don't change without DECISIONS.md entry |
|---|---|---|
| Desktop framework | Tauri 2.0 | Yes — picked over Electron for 12MB vs 120MB installer |
| Desktop UI | React 18 + TailwindCSS | Yes |
| Desktop language | Rust (backend) + TypeScript (frontend) | Yes |
| AI proxy | Cloudflare Workers | Yes |
| AI model | Gemini Flash 2.5 Lite (default — see DECISIONS.md 2026-04-30) | Yes |
| Auth | Clerk (free tier) | Yes |
| Database | Supabase Postgres (free tier) | Yes |
| Payments | Razorpay (primary) + Stripe (intl) | Yes — Razorpay for UPI |
| Analytics | PostHog (free tier) | Yes |
| Auto-update | Tauri's tauri-plugin-updater | Yes |
| Code signing | Sectigo OV → DigiCert EV at scale | Yes |

---

## Coding Conventions

- **Language:** TypeScript everywhere except Tauri's `src-tauri/` (Rust)
- **Style:** Prettier defaults. ESLint with `@typescript-eslint/recommended`.
- **React:** Functional components only. Hooks for state. No class components.
- **State:** Zustand for global state. React state for local. No Redux.
- **CSS:** TailwindCSS only. No CSS modules, no styled-components.
- **Naming:** `PascalCase` for components, `camelCase` for functions/variables, `SCREAMING_SNAKE` for env vars.
- **Files:** One component per file. Co-locate tests as `Component.test.tsx`.
- **Comments:** Only when the WHY is non-obvious. Don't comment WHAT the code does.
- **Errors:** Always handle. Never silently swallow. User-facing errors in Indian English (clear, friendly, no jargon).

---

## Key Constraints (do not violate)

1. **Installer must stay under 20MB.** This is critical for Indian internet speeds. Tauri makes this achievable; Electron does not.
2. **Cold-start to overlay-ready under 1.5s.** If the user hits Alt+Space, the overlay must appear in under 1.5 seconds or the muscle memory breaks.
3. **AI response under 2.5 seconds.** Claude Haiku 4.5 is fast enough. Don't add Sonnet 4.6 to the default path.
4. **No telemetry of user text content.** We log metadata only (timestamp, tone selected, response time). Never send user text to PostHog, Sentry, or any third party except Anthropic.
5. **Never hardcode API keys.** All keys live in environment variables, accessed only via the Cloudflare Worker proxy. The desktop app never holds an Anthropic key.
6. **Razorpay first, Stripe second.** Indian users expect UPI. Stripe is for the 5% paying via international card.
7. **Never block the UI thread.** All AI calls and clipboard operations must be async. Show a spinner if response > 500ms.

---

## Current Phase

**Day 9 — Marketing Landing Page.** Public Next.js 14 page deployed to Vercel (`web-6nykedtei-hypnoplayzzs-projects.vercel.app`) with hero, interactive mockup (driven by Worker `/landing-rewrite`, 3/day per IP), problem/how-it-works/features sections, pricing teaser, founder note, FAQ, footer. Founding-member email capture (`/waitlist`) shares the desktop app's KV-backed waitlist. White-glass aesthetic mirrors the desktop overlay's dark glass.

Update this section at the start of each week. Format:
```
**Day X — [Phase Name].** [One sentence about current focus.]
```

---

## How to Work With Claude On This Codebase

When asking Claude (in CLI or VS Code) for help:

1. **Read CLAUDE.md, SKILLS.md, MISTAKES.md before answering.** Always.
2. **If a coding decision is being made, check DECISIONS.md first.** If your suggestion contradicts an existing decision, raise it explicitly.
3. **Update MISTAKES.md when we learn something the hard way.** Future Claude (and future Chetan) will thank us.
4. **Update DECISIONS.md when an architectural call is made.** One-paragraph entries with date, context, decision, consequences.
5. **For new features, check PRD-COMPACT.md to confirm scope.** If the request is out of scope for current phase, say so.
6. **Default to the smallest possible change that solves the problem.** Don't over-engineer. We are a solo founder shipping in 30 days, not a 50-person team.
7. **When stuck, write down what you've tried in TODO.md before asking the user.** This forces clarity.

---

## Definition of Done (per feature)

A feature is "done" when:
- [ ] It works on a clean Windows 11 install
- [ ] It handles the obvious error cases gracefully (network down, AI API timeout, clipboard empty)
- [ ] It does not violate any constraint above
- [ ] It does not log user text content anywhere
- [ ] The user-facing strings are reviewed for Indian English clarity
- [ ] A 30-second screen recording proves the happy path works

---

## North Star

If a decision is unclear, ask: **"Does this make a busy Indian sales rep at 11pm in Pune type their email faster and feel more confident sending it?"**

If yes → ship. If no → don't.
