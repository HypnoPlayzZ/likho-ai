# PRD-COMPACT.md — Quick-Reference PRD

> Compact version of the full PRD. Used as Claude's working context when the full PRD is too long.

## What
Windows desktop AI overlay. Press Alt+Space anywhere → AI rewrites selected text in 3 tones in <2.5s.

## Who
Indian English-second-language professionals. ~200M TAM. 6 segments: sales reps, founders, support agents, HR, freelancers, Tier-2/3 SMB owners.

## Why now
Existing tools (Grammarly, ChatGPT) have wrong context for Indian English. Hinglish unsupported. Browser-based = high friction. Desktop-native + Indian-context-aware = open positioning.

## Pricing
- Free: 20 rewrites/day, 3 tones, basic Hinglish
- Pro: ₹299/mo unlimited, voice mode, summary mode
- Pro Annual: ₹2,499/yr (save 30%)
- Team: ₹199/seat/mo (5+ seats)
- Founding Lifetime: ₹4,900 one-time, capped at first 50

## P0 Features (v1.0 — must ship in 30 days)
1. Global hotkey (Alt+Space, configurable)
2. Selected-text capture via clipboard automation
3. 3-tone AI rewrite (Professional / Concise / Friendly)
4. One-click replace in source app
5. Hinglish → English mode
6. Free tier with 20/day limit, server-enforced
7. Razorpay UPI/card subscription
8. Email-only auth (Clerk magic link)
9. System tray + settings panel
10. Code-signed installer + auto-update

## P1 Features (v1.1 — weeks 5–8)
- Voice mode (Alt+V)
- Long-text summarization (Alt+S)
- Custom tone presets
- Personal phrase library
- Outlook plugin
- Lakh/crore auto-conversion

## P2 Features (v2 — months 3–6)
- Team plans + brand voice
- Tamil, Telugu, Marathi, Bengali support
- Browser extension
- Mobile companion
- Confidence scores

## Out of scope (v1)
- Mobile app
- Mac / Linux
- Browser extension
- Outlook/Word plugins
- Languages beyond Hinglish
- Real-time grammar (different problem)
- Plagiarism / academic features
- Custom AI fine-tuning per company

## Stack
Tauri 2.0 + React + TypeScript + Tailwind | Cloudflare Workers | Claude Haiku 4.5 (Sonnet for hard) | Clerk | Supabase | Razorpay | PostHog

## Success metrics (v1)
- Day-1 activation: 70%+
- Day-7 retention: 40%+
- Day-30 retention: 25%+
- Free→Paid conversion: 4–8% within 14 days of hitting limit
- Weekly rewrites per active user: 50+
- NPS after 30 days: 40+

## North star question
"Does this make a busy Indian sales rep at 11pm in Pune type their email faster and feel more confident sending it?"

If yes → ship. If no → don't.
