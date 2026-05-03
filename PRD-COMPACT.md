# PRD-COMPACT.md — Quick-Reference PRD

> Compact version of the full PRD. Used as Claude's working context when the full PRD is too long.

## What
Windows desktop AI overlay. Press Alt+Space anywhere → AI rewrites selected text in 3 tones in <2.5s.

## Who
Indian English-second-language professionals. ~200M TAM. 6 segments: sales reps, founders, support agents, HR, freelancers, Tier-2/3 SMB owners.

## Why now
Existing tools (Grammarly, ChatGPT) have wrong context for Indian English. Hinglish unsupported. Browser-based = high friction. Desktop-native + Indian-context-aware = open positioning.

## Pricing (v0.3.0)
- Free: 5 lifetime demo rewrites
- Pro: ₹299/mo unlimited rewrites, 3 tones, full Hinglish — **no voice mode**
- Pro+: ₹499/mo everything in Pro **plus voice mode (Alt+V)**, summary mode, custom presets
- Pro+ Annual: ₹4,199/yr (save 30%)
- Team: ₹199/seat/mo (5+ seats) — Pro tier
- Founding Lifetime: ₹4,900 one-time, capped at first 50, **everything for life including voice**

## P0 Features (v1.0 — must ship in 30 days)
1. Global hotkey (Alt+Space, configurable)
2. Selected-text capture via clipboard automation
3. 3-tone AI rewrite (Professional / Concise / Friendly)
4. One-click replace in source app
5. Hinglish → English mode
6. Free tier with demo cap (5 lifetime), server-enforced
7. Razorpay UPI/card subscription (Pro + Pro+ + Founding)
8. Email-only sign-in (license check by email)
9. System tray + settings panel
10. Code-signed installer + auto-update
11. **Voice mode (Alt+V)** — Pro+ feature (shipped Day 10, v0.3.0). Whisper ASR + Claude Haiku 4.5 polish. Hindi/English/Hinglish.

## P1 Features (v1.1 — weeks 5–8)
- Long-text summarization (Alt+S)
- Custom tone presets
- Personal phrase library
- Outlook plugin
- Lakh/crore auto-conversion
- Live waveform during voice recording (currently a pulsing dot)
- Magic-link sign-in (currently email-only license check)

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
