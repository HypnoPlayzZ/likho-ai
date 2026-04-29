# Likho.ai

Windows desktop AI overlay that helps Indian professionals write better English in any application.

Press `Alt+Space` anywhere on Windows. AI rewrites your selected text in 3 professional tones in under 2 seconds. Works in Outlook, Gmail web, WhatsApp Desktop, LinkedIn, Excel, Tally — anywhere you can type.

Built specifically for Indian English context. Hinglish input supported. ₹299/month.

## Prerequisites

- **Node.js** v20+ and npm v10+
- **Rust** 1.75+ via [rustup](https://rustup.rs/) — use the `stable-x86_64-pc-windows-msvc` target
- **VS 2022 Build Tools** with C++ workload (`winget install Microsoft.VisualStudio.2022.BuildTools`)
- **WebView2** (pre-installed on Windows 11)

## Quick Start (for the founder, not for users)

```bash
# Clone
git clone <your-repo>
cd likho-ai

# Setup desktop app
cd desktop
cp ../.env.example ../.env  # Fill in your real keys
npm install
npm run tauri dev

# In a separate terminal, start the proxy locally
cd ../proxy
npm install
npx wrangler dev
```

## Project Structure

- `CLAUDE.md` — Project context. Read first.
- `SKILLS.md` — Coding patterns to use.
- `MISTAKES.md` — Pitfalls to avoid.
- `DECISIONS.md` — Architecture decision log.
- `PROMPTS.md` — Reusable prompts for Claude Code / VS Code.
- `PRD-COMPACT.md` — Condensed product spec.
- `TODO.md` — Current sprint tasks.
- `desktop/` — Tauri 2.0 + React + TypeScript desktop app.
- `proxy/` — Cloudflare Worker AI proxy.
- `web/` — Landing page at likho.ai.

## Tech Stack

Tauri 2.0 + Rust + React 18 + TypeScript + TailwindCSS | Cloudflare Workers | Claude Haiku 4.5 | Clerk | Supabase | Razorpay | PostHog

## Status

🚧 In active development. v1.0 target ship date: end of May 2026.

## License

Proprietary. © Chetan, 2026.
