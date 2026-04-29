# SKILLS.md — Patterns and Techniques for Likho.ai

> Reference patterns Claude should know and apply when writing code for this project. When you find yourself solving the same problem twice, add the pattern here.

---

## Tauri 2.0 — Desktop App Patterns

### Pattern: Global Hotkey Registration

Use `tauri-plugin-global-shortcut` (Tauri 2.0 plugin). Register the hotkey in Rust, emit an event to the frontend.

```rust
// src-tauri/src/lib.rs
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts(["Alt+Space"]).unwrap()
            .with_handler(|app, shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    app.emit("hotkey-pressed", ()).unwrap();
                }
            })
            .build())
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
```

```typescript
// src/App.tsx
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
    const unlisten = listen('hotkey-pressed', () => {
        captureSelectedText();
        showOverlay();
    });
    return () => { unlisten.then(fn => fn()); };
}, []);
```

### Pattern: Selected Text Capture (Clipboard Method)

The simplest reliable approach across Windows apps: simulate Ctrl+C, wait briefly, read clipboard.

```rust
// src-tauri/src/clipboard.rs
use enigo::{Enigo, Key, KeyboardControllable};
use std::{thread, time::Duration};

#[tauri::command]
pub async fn capture_selection() -> Result<String, String> {
    let mut enigo = Enigo::new();
    let prev_clipboard = arboard::Clipboard::new()
        .and_then(|mut c| c.get_text())
        .unwrap_or_default();
    
    enigo.key_down(Key::Control);
    enigo.key_click(Key::Layout('c'));
    enigo.key_up(Key::Control);
    
    thread::sleep(Duration::from_millis(150));
    
    let captured = arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .get_text()
        .map_err(|e| e.to_string())?;
    
    // Restore original clipboard after 500ms (so user's clipboard isn't permanently changed)
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(500));
        if let Ok(mut c) = arboard::Clipboard::new() {
            let _ = c.set_text(prev_clipboard);
        }
    });
    
    Ok(captured)
}
```

### Pattern: Floating Overlay Window Near Cursor

```rust
#[tauri::command]
pub fn show_overlay_near_cursor(window: tauri::Window) -> Result<(), String> {
    let cursor_pos = window.cursor_position().map_err(|e| e.to_string())?;
    window.set_position(tauri::PhysicalPosition::new(
        cursor_pos.x as i32 + 10,
        cursor_pos.y as i32 + 10,
    )).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}
```

Configure window in `tauri.conf.json`:
```json
{
  "windows": [{
    "label": "overlay",
    "width": 380,
    "height": 220,
    "decorations": false,
    "transparent": true,
    "alwaysOnTop": true,
    "skipTaskbar": true,
    "visible": false,
    "focus": true
  }]
}
```

---

## Cloudflare Workers — AI Proxy Pattern

### Pattern: Anthropic API Proxy with Rate Limiting

```typescript
// proxy/src/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Verify Clerk JWT
    const auth = request.headers.get('Authorization');
    const userId = await verifyClerkToken(auth, env.CLERK_SECRET);
    if (!userId) return new Response('Unauthorized', { status: 401 });

    // 2. Check usage from Supabase (free tier: 20/day)
    const usage = await getUsageToday(userId, env);
    const isPaid = await isUserPaid(userId, env);
    if (!isPaid && usage >= 20) {
      return new Response(JSON.stringify({ error: 'limit_reached' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Call Anthropic
    const body = await request.json();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2024-01-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: body.messages,
        system: body.system,
      }),
    });

    // 4. Increment usage (fire-and-forget)
    incrementUsage(userId, env).catch(console.error);

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
```

### Pattern: System Prompt for Indian English Rewriting

```typescript
const SYSTEM_PROMPT = `You are a professional writing assistant built for Indian English speakers writing business communication.

When given text to rewrite, return EXACTLY a JSON object with three keys: "professional", "concise", "friendly".

Rules:
- Preserve the user's intent and meaning exactly. Never add facts.
- Convert Hinglish input to clean English automatically.
- Recognize and improve Indian English idioms ("do the needful", "PFA", "revert back", "prepone") without being condescending — just write the better version.
- Convert ₹15 lakh → ₹15,00,000 → ₹1.5 million only if context demands; otherwise keep the user's notation.
- Default to British English spelling (favour, organisation, colour) — Indian convention.
- Keep tone respectful for hierarchy when context suggests writing to senior. Use "could you" not "can you".
- Output JSON only. No markdown, no preamble, no explanation.

Example input: "Sir kindly do the needful regarding invoice asap, also PFA"
Example output:
{
  "professional": "Could you please review and resolve the invoice issue at your earliest convenience? I have attached the relevant document for your reference.",
  "concise": "Please resolve the invoice issue. Document attached.",
  "friendly": "Hi — would you be able to take a look at the invoice issue? I've attached the document."
}`;
```

---

## React + Tailwind UI Patterns

### Pattern: Overlay Component with Tone Selector

```tsx
// src/components/Overlay.tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Rewrites {
  professional: string;
  concise: string;
  friendly: string;
}

export function Overlay({ originalText }: { originalText: string }) {
  const [rewrites, setRewrites] = useState<Rewrites | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRewrites(originalText).then(r => {
      setRewrites(r);
      setLoading(false);
    });
  }, [originalText]);

  const apply = async (text: string) => {
    await invoke('replace_selection', { newText: text });
    await invoke('hide_overlay');
  };

  if (loading) return <Spinner />;
  if (!rewrites) return <Error />;

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl p-3 w-[380px]">
      <div className="text-xs text-gray-500 mb-2 truncate">"{originalText}"</div>
      {(['professional', 'concise', 'friendly'] as const).map(tone => (
        <button
          key={tone}
          onClick={() => apply(rewrites[tone])}
          className="block w-full text-left p-2 rounded-lg hover:bg-indigo-50 mb-1"
        >
          <div className="text-[10px] uppercase text-indigo-600 font-semibold">{tone}</div>
          <div className="text-sm text-gray-800">{rewrites[tone]}</div>
        </button>
      ))}
    </div>
  );
}
```

### Pattern: Indigo + Cream Brand Colors

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        likho: {
          indigo: '#3730A3',     // primary
          cream: '#FEF9F0',      // background warm
          ink: '#1F2937',        // body text
          slate: '#64748B',      // secondary text
          mint: '#10B981',       // success
          coral: '#F87171',      // error
        }
      }
    }
  }
};
```

---

## Razorpay Subscription Pattern

```typescript
// proxy/src/razorpay.ts
import Razorpay from 'razorpay';

export async function createSubscription(userId: string, planType: 'monthly' | 'annual', env: Env) {
  const razorpay = new Razorpay({
    key_id: env.RAZORPAY_KEY,
    key_secret: env.RAZORPAY_SECRET,
  });

  const planId = planType === 'monthly'
    ? env.RAZORPAY_PLAN_MONTHLY  // ₹299/mo plan ID
    : env.RAZORPAY_PLAN_ANNUAL;  // ₹2,499/yr plan ID

  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: planType === 'monthly' ? 12 : 1,
    notes: { user_id: userId },
  });

  // Store subscription ID against user in Supabase
  await supabaseUpdateUser(userId, { 
    subscription_id: subscription.id, 
    subscription_status: 'pending' 
  }, env);

  return { 
    subscription_id: subscription.id, 
    short_url: subscription.short_url 
  };
}
```

---

## Privacy-First Logging Pattern

```typescript
// Never log text content. Only log metadata.
function logRewrite(params: {
  userId: string;
  toneSelected: 'professional' | 'concise' | 'friendly';
  inputCharCount: number;
  outputCharCount: number;
  responseTimeMs: number;
  modelUsed: 'haiku' | 'sonnet';
}) {
  posthog.capture('rewrite_completed', {
    distinct_id: params.userId,
    tone: params.toneSelected,
    input_chars: params.inputCharCount,
    output_chars: params.outputCharCount,
    response_ms: params.responseTimeMs,
    model: params.modelUsed,
  });
  // NEVER:
  // input_text: params.inputText  ❌
  // output_text: params.outputText  ❌
}
```

---

## Cost Control Pattern

```typescript
// proxy/src/budget.ts
const MONTHLY_BUDGET_USD = 200;  // Hard cap

export async function checkBudget(env: Env): Promise<boolean> {
  const monthSpend = await getMonthSpend(env);
  if (monthSpend > MONTHLY_BUDGET_USD * 0.9) {
    await sendAlertEmail(`Likho budget at ${monthSpend} USD this month`, env);
  }
  return monthSpend < MONTHLY_BUDGET_USD;
}

// In the main handler, before calling Anthropic:
if (!(await checkBudget(env))) {
  return new Response('Service temporarily unavailable', { status: 503 });
}
```

---

## Auto-Update Pattern (Tauri)

```json
// tauri.conf.json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://github.com/chetan/likho-ai/releases/latest/download/latest.json"],
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

```typescript
// src/utils/updater.ts
import { check } from '@tauri-apps/plugin-updater';

export async function checkForUpdates() {
  const update = await check();
  if (update?.available) {
    // Show non-intrusive toast: "Update available. Install on next restart?"
    showUpdateToast(update.version);
    await update.downloadAndInstall();
  }
}

// Run on app start, then every 6 hours
checkForUpdates();
setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
```

---

## Add new patterns here as they emerge.

When you (Claude or Chetan) solve the same problem twice in this codebase, add it here. Goal: never solve the same problem three times.
