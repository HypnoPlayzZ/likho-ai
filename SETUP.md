# SETUP.md — Day 1 Setup Guide

> Read this once on Day 1. Then never again.

This file walks you through setting up the empty `likho-ai/` project folder and getting the Claude Code bootstrap prompt running.

---

## Step 1: Create the project folder

```bash
mkdir likho-ai
cd likho-ai
```

## Step 2: Copy the starter pack into it

Copy these files from this `likho-starter/` folder into your new `likho-ai/` folder:

- `CLAUDE.md`
- `SKILLS.md`
- `MISTAKES.md`
- `DECISIONS.md`
- `PROMPTS.md`
- `PRD-COMPACT.md`
- `TODO.md`
- `README.md`
- `.gitignore`
- `.env.example`

(Don't copy `SETUP.md` itself — you've already read it.)

## Step 3: Initialize git

```bash
git init
git add .
git commit -m "Initial: starter pack imported"
```

## Step 4: Open in VS Code

```bash
code .
```

Make sure you have:
- Claude in VS Code extension installed (or your preferred Claude integration)
- Claude Code CLI installed if you'll use the terminal version

## Step 5: Verify the prerequisites

You'll need installed:

```bash
node --version    # v20.0.0 or higher
npm --version     # v10.0.0 or higher
rustc --version   # 1.75+ (install via https://rustup.rs/)
cargo --version
```

For Tauri on Windows specifically:
```bash
# Install WebView2 (most Windows 11 has it)
# Install Microsoft C++ Build Tools (via Visual Studio Installer)
```

If you're missing any of these, install them now. Tauri's getting-started has a checker:
https://v2.tauri.app/start/prerequisites/

## Step 6: Run the BOOTSTRAP prompt

Open Claude Code in the project folder:

```bash
claude
```

Or open the chat in VS Code with the Claude extension.

Then paste the entire BOOTSTRAP prompt from `PROMPTS.md` (the section labeled "🚀 BOOTSTRAP — The Very First Prompt").

Claude will read the .md files, scaffold the Tauri project, set up Tailwind, configure the overlay window, and create a hello-world that opens on Alt+Space.

If anything fails, ask Claude to fix and retry. Don't move on until `npm run tauri dev` shows the placeholder window.

## Step 7: Update TODO.md

After Day 1 is complete, mark Day 1 items as `[x]` in `TODO.md` and verify Day 2 tasks are queued up.

## Step 8: Send the warm-network message

Don't skip this. While the code is scaffolding, send this to your 1,000-person network:

> "Hey — I'm building a Windows desktop app that helps Indians write professional English in any app (Outlook, WhatsApp Web, LinkedIn, anywhere). Press a hotkey, AI rewrites your text in 2 seconds. Built specifically for how we actually write — Hinglish input, lakh/crore conversions, no condescending Western tone. Looking for 5 people from this group to give me 15 minutes of feedback before I launch — and 50 founding members at ₹4,900 lifetime (vs ₹2,500/yr forever otherwise). Reply if interested."

Adjust to match your group's vibe. Goal: book 5 conversations for this week.

## Step 9: Submit Razorpay KYC

Go to https://razorpay.com → Sign up as Business → Submit KYC documents. This takes 5–10 days for approval. Start now so it's ready when you need it on Day 10.

## Step 10: Buy the domain

Buy `likho.ai` on Namecheap or any registrar. ~₹2,000/year. Point DNS at Cloudflare for free DDoS + CDN.

---

You're now set up. Tomorrow you start with Day 2's prompt from PROMPTS.md. Ship it.
