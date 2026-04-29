# PROMPTS.md — Reusable Prompts for Claude Code & VS Code

> Copy-paste prompts for common tasks. Adjust the bracketed parts for your specific situation.

---

## 🚀 BOOTSTRAP — The Very First Prompt

Use this as your **very first message** to Claude Code in the empty project folder. It sets up the entire scaffold.

```
You are working on Likho.ai, a Windows desktop AI overlay for Indian professionals.

Read CLAUDE.md, SKILLS.md, MISTAKES.md, and PRD-COMPACT.md in this folder before doing anything. These contain the full project context.

Today is Day 1. Your task:

1. Create the directory structure as described in CLAUDE.md (desktop/, proxy/, web/, docs/).
2. Inside desktop/, scaffold a fresh Tauri 2.0 project using:
   npm create tauri-app@latest -- --template react-ts --name likho-ai-desktop
3. Configure the desktop app per the constraints in CLAUDE.md:
   - Set Tailwind CSS up properly (postcss + tailwind config + index.css with @tailwind directives)
   - Configure tauri.conf.json with the overlay window settings from SKILLS.md
   - Add the global-shortcut, clipboard-manager, and updater plugins
   - Update the brand colors in tailwind.config.js per SKILLS.md
4. Create a minimal "hello world" overlay that:
   - Lives in system tray (small "L" icon — placeholder is fine)
   - Opens an empty 380x220 floating window when Alt+Space is pressed
   - Shows the literal text "Hello, Likho." in the window
   - Closes when Esc is pressed
5. Create a `.env.example` file with the env var names we'll need (Anthropic key, Clerk keys, Supabase keys, Razorpay keys) — but don't add real values.
6. Create a basic README.md with run instructions.

After implementing:
- Update DECISIONS.md with one entry: today's date, "Initial scaffold using Tauri 2.0 + React TypeScript".
- Update TODO.md with Day 2's tasks (per the roadmap in CLAUDE.md).
- Verify the app builds with `npm run tauri dev`. If it fails, fix the errors before reporting back.

Show me the full file tree at the end and tell me what command to run to launch the dev server.
```

---

## 🔨 DAILY BUILD PROMPTS — Use One Per Day

### Day 2 — Hello-World Overlay

```
Read CLAUDE.md, SKILLS.md, MISTAKES.md, TODO.md.

Today's goal (Day 2): Make Alt+Space anywhere on Windows open a floating overlay window near the cursor that shows "Hello, [current time]" and closes on Esc.

Specifically:
1. Implement global hotkey registration per SKILLS.md "Pattern: Global Hotkey Registration".
2. Position overlay near cursor per SKILLS.md "Pattern: Floating Overlay Window Near Cursor".
3. Add Esc-to-close listener.
4. Make sure the overlay does NOT steal focus from the source app on first appearance (per MISTAKES.md).

Test it works while a Notepad window is in focus. The overlay should appear, you can dismiss with Esc, and Notepad regains focus immediately.

When done:
- Update TODO.md with Day 3's task.
- Update MISTAKES.md if you hit anything new.
- Commit with message: "Day 2: global hotkey + cursor-positioned overlay".
```

### Day 3 — Selected Text Capture

```
Read CLAUDE.md, SKILLS.md, MISTAKES.md, TODO.md.

Today's goal (Day 3): When the hotkey fires, capture whatever text the user has selected in any Windows app, and display it in the overlay.

Implement per SKILLS.md "Pattern: Selected Text Capture (Clipboard Method)". Critical: preserve the user's prior clipboard contents per MISTAKES.md.

Test sequence:
1. Open Notepad. Type "test message" and select it.
2. Press Alt+Space.
3. Verify overlay shows "test message".
4. Verify clipboard still contains "test message" 1 second after overlay opens (i.e., we restored it).

Test the empty-selection case too: hotkey pressed with nothing selected should show a friendly "Select some text first" message, not crash.

When done:
- Update TODO.md.
- Commit: "Day 3: selected text capture + clipboard preservation".
```

### Day 4 — First AI Rewrite

```
Read CLAUDE.md, SKILLS.md, MISTAKES.md, TODO.md.

Today's goal (Day 4): Connect the overlay to a Cloudflare Worker proxy that calls Claude Haiku 4.5 and returns one professional rewrite of the captured text.

Steps:
1. In proxy/, scaffold a Cloudflare Worker project (`npm create cloudflare`).
2. Implement the proxy per SKILLS.md "Pattern: Anthropic API Proxy with Rate Limiting" — but for today, skip the auth and rate limiting. Just hit Anthropic with a hardcoded API key from .dev.vars. We'll add auth Day 8.
3. Use the system prompt from SKILLS.md but for today, return only the "professional" version (full 3-tone version comes Day 5).
4. In the desktop app, on hotkey press: capture text → POST to the worker → display result in overlay.
5. Add a loading spinner per SKILLS.md.

Test: Select "kindly do the needful asap" in Notepad, press Alt+Space, verify overlay shows a clean professional rewrite within 2 seconds.

Cost guard: Add a console log of every API call so you can verify you're not accidentally calling Claude in a loop.

Update TODO.md, commit: "Day 4: end-to-end AI rewrite working".
```

### Use this template for every subsequent day

Replace the bracketed parts:

```
Read CLAUDE.md, SKILLS.md, MISTAKES.md, TODO.md.

Today's goal (Day [N]): [one-sentence goal from PRD-COMPACT.md or roadmap].

Specifically:
1. [Subtask 1]
2. [Subtask 2]
3. [Subtask 3]

Test sequence:
1. [Specific test]
2. [Specific test]

Edge cases to handle:
- [Edge case 1]
- [Edge case 2]

When done:
- Update TODO.md with tomorrow's task.
- Update MISTAKES.md if anything bit you.
- Commit with descriptive message.
- Tell me the file paths you changed and what to test manually.
```

---

## 🐛 DEBUGGING PROMPTS

### When something breaks

```
The app is failing with this error:

[paste error]

Steps to reproduce:
1. [Step 1]
2. [Step 2]

Expected: [what should happen]
Actual: [what happens]

Read CLAUDE.md, SKILLS.md, MISTAKES.md before suggesting a fix. Check if MISTAKES.md already has this. If yes, apply the documented fix. If no, diagnose, fix, and add a new entry to MISTAKES.md so we don't hit this again.

Don't just patch the symptom — explain the root cause and confirm the fix addresses it.
```

### When you suspect a config issue

```
Something is misconfigured. Audit the following files for inconsistencies with CLAUDE.md and SKILLS.md:

- desktop/tauri.conf.json
- desktop/src-tauri/Cargo.toml
- desktop/package.json
- desktop/tailwind.config.js
- proxy/wrangler.toml

List every divergence from the documented stack and propose fixes. Don't apply fixes yet — show me the diff for approval first.
```

---

## 🧪 TESTING PROMPTS

### Generate test cases for a feature

```
Read CLAUDE.md and SKILLS.md.

Generate a comprehensive list of test cases for the [feature name] feature. Cover:
- Happy path
- Edge cases (empty input, very long input, special characters, Unicode)
- Network failure modes
- Auth failure modes
- Concurrent usage edge cases

Format as a Markdown checklist. Don't write the tests yet — just enumerate them.
```

### Write actual tests

```
Write Vitest unit tests for [specific function/module]. 

Match the existing test style in the codebase. Use fixtures for common test data. Mock external API calls. Aim for 80%+ branch coverage.
```

---

## 📝 DOCUMENTATION PROMPTS

### Update support files after a session

```
We've made significant changes today. Please update the following files based on what we built:

- DECISIONS.md: Add an entry for any architectural choice we made today (date, context, decision, consequences).
- MISTAKES.md: Add entries for anything that bit us today.
- SKILLS.md: Add new patterns we created (especially anything we'd reuse).
- TODO.md: Mark today complete, write tomorrow's task list.
- PRD-COMPACT.md: Update if scope or pricing changed.

Show me each diff before applying.
```

### Create a release note

```
Create the release notes for v[X.Y.Z]. Read the git log since the last tagged release.

Format:
## v[X.Y.Z] — [Date]

### New
- [features]

### Improved
- [improvements]

### Fixed
- [bug fixes]

### Known issues
- [anything not yet addressed]

Tone: friendly, Indian English, no jargon. Written for the user, not for engineers.
```

---

## 🚢 LAUNCH PROMPTS

### Pre-launch readiness check

```
Read CLAUDE.md, MISTAKES.md, and PRD-COMPACT.md.

Audit the codebase for launch readiness. Check:

1. Code signing certificate is configured for the installer
2. Auto-update endpoint is set in tauri.conf.json
3. All env vars are documented in .env.example
4. No hardcoded API keys anywhere (grep for 'sk-', 'rzp_', 'pk_')
5. PostHog is wired up but only logs metadata, never user text content
6. Razorpay subscription flow works end-to-end (test with a real ₹1 plan)
7. Error states are user-friendly (no raw stack traces)
8. Cold-start to overlay time under 1.5s on a clean Windows VM
9. Installer size under 20MB
10. README has install + first-use instructions

Report a punch list — what's done, what's blocking. Cap response at 300 words.
```

### Launch day post-mortem

```
We launched [X hours] ago. Here are the metrics:

- Installs: [N]
- Activations (first rewrite): [N]
- Sign-ups: [N]
- Paying users: [N]
- Crashes / errors reported: [N]

Top 3 user complaints from feedback:
1. [complaint]
2. [complaint]
3. [complaint]

What should we ship in the next 48 hours to maximize conversion and retention? Prioritize ruthlessly. Maximum 5 items.
```

---

## 🔄 REFACTORING PROMPTS

### When code starts to feel messy

```
Read [specific file path]. It's gotten messy.

Refactor for clarity and testability without changing behavior. Specifically:
- Extract helper functions
- Reduce nesting depth
- Add type hints where missing
- Split functions over 50 lines

Keep the public interface unchanged. Run the tests after to verify no regressions.

Show me the diff before applying.
```

---

## 🤝 USER FEEDBACK PROMPTS

### Process user feedback

```
A user said this:

"[paste feedback verbatim]"

Read CLAUDE.md and PRD-COMPACT.md.

Categorize this feedback:
- [ ] Bug (something doesn't work as documented)
- [ ] Feature request (in scope for current phase)
- [ ] Feature request (out of scope, defer to v2)
- [ ] UX issue (works but feels wrong)
- [ ] Misunderstanding (we documented this poorly)

For each:
- If bug: write a TODO with reproduction steps.
- If feature in scope: add to TODO.md with priority.
- If out of scope: add to a separate BACKLOG.md.
- If UX: propose a tweak with mockup.
- If misunderstanding: improve the docs or in-app copy.

Suggest a one-line response back to the user that's warm, specific, and committal.
```

---

## ⚡ QUICK PROMPTS — Single-line tasks

```
Run the linter and fix any issues in the desktop/ folder.
```

```
Update package.json dependencies that have non-breaking newer versions, then run tests.
```

```
Find all TODO/FIXME comments in the codebase and consolidate them into TODO.md.
```

```
Generate a CHANGELOG.md from the git log of the last 30 days, grouped by week.
```

```
Profile the cold-start time of the desktop app and tell me what's slowest.
```

---

## 🧠 Working effectively with Claude — meta tips

1. **Always start every session with "Read CLAUDE.md, SKILLS.md, MISTAKES.md".** This loads all relevant context into Claude's working memory.
2. **Be specific about test cases.** "It works" is not enough. Tell Claude what to verify.
3. **Update docs as you go.** Treat MISTAKES.md and DECISIONS.md as first-class outputs of every session.
4. **Don't accept "I think this should work."** Make Claude actually run the tests or describe what manual test would prove it works.
5. **When Claude gets stuck in a loop, say "stop, summarize what you've tried, and ask me a clarifying question."**
6. **Use git commits as save points.** Commit after every working feature so rollback is one command.
7. **For long sessions, periodically say "summarize what we've done so I can update DECISIONS.md."**
