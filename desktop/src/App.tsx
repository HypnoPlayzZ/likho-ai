import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

// Day 4: dev-only proxy URL. Day 8 swaps in the deployed Cloudflare Worker URL
// + Clerk auth header. Keeping this hardcoded to avoid premature env plumbing.
const PROXY_URL = "http://127.0.0.1:8787/rewrite";

type Status =
  | { kind: "idle" }                      // overlay just opened, capture in flight
  | { kind: "no_selection" }              // capture returned empty
  | { kind: "rewriting"; original: string }
  | { kind: "done"; original: string; rewrite: string }
  | { kind: "error"; original: string; message: string };

function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // React to capture and hide events from Rust
  useEffect(() => {
    const unlistenCapture = listen<string>("text-captured", async (event) => {
      const text = event.payload.trim();
      if (!text) {
        setStatus({ kind: "no_selection" });
        return;
      }
      setStatus({ kind: "rewriting", original: text });
      const result = await fetchRewrite(text);
      // If the user dismissed the overlay before the response arrived, drop the
      // result. (overlay-hidden resets status to idle.)
      setStatus((prev) =>
        prev.kind === "rewriting" && prev.original === text
          ? result.ok
            ? { kind: "done", original: text, rewrite: result.rewrite }
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

  return (
    <div className="flex items-center justify-center h-full bg-likho-cream/95 backdrop-blur-md rounded-xl shadow-2xl p-4">
      <div className="w-full">{renderStatus(status)}</div>
    </div>
  );
}

function renderStatus(s: Status) {
  switch (s.kind) {
    case "idle":
      return <Spinner label="Capturing text..." />;
    case "no_selection":
      return (
        <div className="text-center">
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
          <p className="text-[10px] uppercase tracking-wide text-likho-indigo font-semibold mt-1 mb-1">
            Professional
          </p>
          <div className="bg-white/80 rounded-lg p-3 max-h-32 overflow-y-auto">
            <p className="text-sm text-likho-ink whitespace-pre-wrap break-words">
              {s.rewrite}
            </p>
          </div>
          <p className="text-xs text-likho-slate text-center mt-2">Press Esc to close</p>
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
    <p className="text-xs text-likho-slate truncate mb-1" title={text}>
      "{text}"
    </p>
  );
}

type RewriteResult =
  | { ok: true; rewrite: string }
  | { ok: false; message: string };

async function fetchRewrite(text: string): Promise<RewriteResult> {
  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // Per MISTAKES.md, friendly Indian-English error messages, not jargon.
      if (res.status === 502) {
        return { ok: false, message: "AI service is busy right now — please try again in a moment." };
      }
      return { ok: false, message: `Something went wrong (${res.status}). Please try again.` };
    }
    const data = (await res.json()) as { rewrite?: string };
    if (!data.rewrite) {
      return { ok: false, message: "Got an empty reply — please try again." };
    }
    return { ok: true, rewrite: data.rewrite };
  } catch {
    return {
      ok: false,
      message: "Looks like the AI service can't be reached. Is the proxy running?",
    };
  }
}

export default App;
