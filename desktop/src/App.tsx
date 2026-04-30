import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

// Day 5: dev-only proxy URL. Day 8 swaps in the deployed Cloudflare Worker URL
// + Clerk auth header.
const PROXY_URL = "http://127.0.0.1:8787/rewrite";

interface Rewrites {
  professional: string;
  concise: string;
  friendly: string;
}

type Tone = keyof Rewrites;
const TONES: Tone[] = ["professional", "concise", "friendly"];

type Status =
  | { kind: "idle" }                      // overlay just opened, capture in flight
  | { kind: "no_selection" }              // capture returned empty
  | { kind: "rewriting"; original: string }
  | { kind: "done"; original: string; rewrites: Rewrites }
  | { kind: "error"; original: string; message: string };

function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    const unlistenCapture = listen<string>("text-captured", async (event) => {
      const text = event.payload.trim();
      if (!text) {
        setStatus({ kind: "no_selection" });
        return;
      }
      setStatus({ kind: "rewriting", original: text });
      const result = await fetchRewrites(text);
      // If the user dismissed before response arrived, drop the result.
      // overlay-hidden resets status to idle.
      setStatus((prev) =>
        prev.kind === "rewriting" && prev.original === text
          ? result.ok
            ? { kind: "done", original: text, rewrites: result.rewrites }
            : { kind: "error", original: text, message: result.message }
          : prev,
      );
    });

    const unlistenHidden = listen("overlay-hidden", () => {
      setStatus({ kind: "idle" });
    });

    return () => {
      unlistenCapture.then((fn) => fn());
      unlistenHidden.then((fn) => fn());
    };
  }, []);

  // Fallback Esc handler for when the user has clicked inside the overlay
  useEffect(() => {
    const appWindow = getCurrentWindow();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") appWindow.hide();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const onPick = async (text: string) => {
    try {
      await invoke("replace_selection", { newText: text });
    } catch (e) {
      // If the paste itself failed, surface a friendly error rather than
      // silently dismissing. The overlay is already hidden by replace_selection
      // so the user won't see this — log only. (UX improvement: keep overlay
      // open on failure. Day 6+ if it becomes an issue.)
      console.error("replace_selection failed", e);
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-likho-cream/95 backdrop-blur-md rounded-xl shadow-2xl p-3">
      <div className="w-full">{renderStatus(status, onPick)}</div>
    </div>
  );
}

function renderStatus(s: Status, onPick: (text: string) => void) {
  switch (s.kind) {
    case "idle":
      return <Spinner label="Capturing text..." />;
    case "no_selection":
      return (
        <div className="text-center py-2">
          <p className="text-base text-likho-ink font-medium">Select some text first</p>
          <p className="text-xs text-likho-slate mt-1">
            Highlight text in any app, then press Alt+Space
          </p>
        </div>
      );
    case "rewriting":
      return (
        <div>
          <OriginalSnippet text={s.original} />
          <Spinner label="Rewriting..." />
        </div>
      );
    case "done":
      return (
        <div>
          <OriginalSnippet text={s.original} />
          <div className="space-y-1">
            {TONES.map((tone) => (
              <ToneButton
                key={tone}
                tone={tone}
                text={s.rewrites[tone]}
                onClick={() => onPick(s.rewrites[tone])}
              />
            ))}
          </div>
          <p className="text-[10px] text-likho-slate text-center mt-2">
            Click to replace · Esc to close
          </p>
        </div>
      );
    case "error":
      return (
        <div>
          <OriginalSnippet text={s.original} />
          <div className="bg-likho-coral/10 rounded-lg p-3">
            <p className="text-sm text-likho-coral">{s.message}</p>
          </div>
          <p className="text-xs text-likho-slate text-center mt-2">Press Esc to close</p>
        </div>
      );
  }
}

function ToneButton({
  tone,
  text,
  onClick,
}: {
  tone: Tone;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left p-2 rounded-lg hover:bg-likho-indigo/10 focus:bg-likho-indigo/10 focus:outline-none transition-colors"
    >
      <div className="text-[10px] uppercase tracking-wide text-likho-indigo font-semibold">
        {tone}
      </div>
      <div className="text-sm text-likho-ink whitespace-pre-wrap break-words">{text}</div>
    </button>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <div className="w-4 h-4 border-2 border-likho-indigo border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-likho-slate">{label}</p>
    </div>
  );
}

function OriginalSnippet({ text }: { text: string }) {
  return (
    <p className="text-xs text-likho-slate truncate mb-2" title={text}>
      "{text}"
    </p>
  );
}

type RewriteResult =
  | { ok: true; rewrites: Rewrites }
  | { ok: false; message: string };

async function fetchRewrites(text: string): Promise<RewriteResult> {
  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // Per MISTAKES.md — friendly Indian-English error copy, no jargon.
      if (res.status === 502) {
        return {
          ok: false,
          message: "AI service is busy right now — please try again in a moment.",
        };
      }
      return {
        ok: false,
        message: `Something went wrong (${res.status}). Please try again.`,
      };
    }
    const data = (await res.json()) as Partial<Rewrites>;
    if (!data.professional || !data.concise || !data.friendly) {
      return { ok: false, message: "Got a partial reply — please try again." };
    }
    return {
      ok: true,
      rewrites: {
        professional: data.professional,
        concise: data.concise,
        friendly: data.friendly,
      },
    };
  } catch {
    return {
      ok: false,
      message: "Looks like the AI service can't be reached. Is the proxy running?",
    };
  }
}

export default App;
