import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  Briefcase,
  Zap,
  Smile,
  Check,
  MousePointer2,
  Languages,
  type LucideIcon,
} from "lucide-react";

const PROXY_URL = "http://127.0.0.1:8787/rewrite";

type DetectedLanguage = "english" | "hinglish" | "mixed";

interface Rewrites {
  professional: string;
  concise: string;
  friendly: string;
  detected_language: DetectedLanguage;
}

type Tone = "professional" | "concise" | "friendly";
const TONES: Tone[] = ["professional", "concise", "friendly"];

// Lucide icon + label pairing per tone — keeps the visual cue consistent
// across the loading skeleton and the live cards.
const TONE_META: Record<Tone, { Icon: LucideIcon; label: string }> = {
  professional: { Icon: Briefcase, label: "Professional" },
  concise: { Icon: Zap, label: "Concise" },
  friendly: { Icon: Smile, label: "Friendly" },
};

type Status =
  | { kind: "idle" }
  | { kind: "no_selection" }
  | { kind: "rewriting"; original: string }
  | { kind: "done"; original: string; rewrites: Rewrites }
  | { kind: "replaced" }
  | { kind: "error"; original: string; message: string };

function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Bumped on every overlay-shown event so the container's animation
  // re-plays via React's key-based remount. React doesn't unmount on
  // window.hide(), so without this the fade-in only happens on first show.
  const [showCounter, setShowCounter] = useState(0);

  useEffect(() => {
    const unlistenCapture = listen<string>("text-captured", async (event) => {
      const text = event.payload.trim();
      if (!text) {
        setStatus({ kind: "no_selection" });
        return;
      }
      setStatus({ kind: "rewriting", original: text });
      const result = await fetchRewrites(text);
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

    const unlistenShown = listen("overlay-shown", () => {
      setShowCounter((n) => n + 1);
    });

    return () => {
      unlistenCapture.then((fn) => fn());
      unlistenHidden.then((fn) => fn());
      unlistenShown.then((fn) => fn());
    };
  }, []);

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
      // replace_selection in Rust hides the overlay (so the source app gets
      // focus + receives Ctrl+V), pastes, and returns. Once that's done we
      // re-show the overlay briefly with a "Replaced ✓" toast so the user
      // gets confirmation, then auto-hide after 1s.
      await invoke("replace_selection", { newText: text });
      const appWindow = getCurrentWindow();
      setStatus({ kind: "replaced" });
      await appWindow.show();
      window.setTimeout(() => {
        appWindow.hide();
      }, 1000);
    } catch (e) {
      console.error("replace_selection failed", e);
    }
  };

  return (
    <div
      key={showCounter}
      className="h-full w-full p-2 flex animate-overlay-in"
    >
      <div className="flex-1 flex flex-col rounded-[20px] overflow-hidden bg-transparent border border-white/20 ring-1 ring-inset ring-white/10 shadow-2xl">
        <div className="flex-1 flex flex-col p-4 min-h-0">
          {renderStatus(status, onPick)}
        </div>
      </div>
    </div>
  );
}

function renderStatus(s: Status, onPick: (text: string) => void) {
  switch (s.kind) {
    case "idle":
      return (
        <CenterMessage>
          <Spinner label="Capturing text..." />
        </CenterMessage>
      );

    case "no_selection":
      return (
        <CenterMessage>
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/15 flex items-center justify-center mb-3">
            <MousePointer2 className="w-5 h-5 text-white/60" strokeWidth={1.5} />
          </div>
          <p className="text-base text-white font-medium">Select some text first</p>
          <p className="text-xs text-white/60 mt-1">
            then press <KeyHint>Alt</KeyHint>
            <span className="mx-1 text-white/40">+</span>
            <KeyHint>Space</KeyHint>
          </p>
        </CenterMessage>
      );

    case "rewriting":
      return (
        <>
          <Header original={s.original} />
          <div className="flex-1 min-h-0 space-y-1.5 overflow-hidden">
            {TONES.map((tone) => (
              <SkeletonToneCard key={tone} tone={tone} />
            ))}
          </div>
          <Footer />
        </>
      );

    case "done":
      return (
        <>
          <Header original={s.original} lang={s.rewrites.detected_language} />
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-1.5">
            {TONES.map((tone) => (
              <ToneCard
                key={tone}
                tone={tone}
                text={s.rewrites[tone]}
                onClick={() => onPick(s.rewrites[tone])}
              />
            ))}
          </div>
          <Footer />
        </>
      );

    case "replaced":
      return (
        <CenterMessage>
          <div className="w-12 h-12 rounded-full bg-emerald-400/15 border border-emerald-400/40 flex items-center justify-center mb-3 animate-overlay-in">
            <Check className="w-6 h-6 text-emerald-300" strokeWidth={2.5} />
          </div>
          <p className="text-base text-white font-medium">Replaced</p>
          <p className="text-xs text-white/60 mt-1">Pasted into your app</p>
        </CenterMessage>
      );

    case "error":
      return (
        <>
          <Header original={s.original} />
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-likho-coral/15 border border-likho-coral/30 rounded-lg p-3 max-w-full">
              <p className="text-sm text-likho-coral">{s.message}</p>
            </div>
          </div>
          <p className="text-[11px] text-white/40 text-center mt-2">Press Esc to close</p>
        </>
      );
  }
}

function Header({ original, lang }: { original: string; lang?: DetectedLanguage }) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
      <div className="text-[10px] font-bold text-likho-orange tracking-[0.25em] uppercase shrink-0">
        Likho
      </div>
      <p
        className="text-xs text-white/70 truncate flex-1 min-w-0 italic"
        title={original}
      >
        "{original}"
      </p>
      {lang && lang !== "english" && <LanguageBadge lang={lang} />}
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-white/45">
      <span>Click a tone to replace</span>
      <KeyHint>Esc</KeyHint>
    </div>
  );
}

// Compact key-cap-style badge for keyboard hints. Used in both the empty
// state ("Alt + Space") and the footer ("Esc"). Slightly more prominent
// than plain text so the hotkey is the obvious thing to look at.
function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wide bg-white/10 border border-white/20 text-white/85 shadow-[inset_0_-1px_0_rgba(0,0,0,0.25)]">
      {children}
    </kbd>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      {children}
    </div>
  );
}

// Live tone card. Hover lifts the card with a subtle orange tint + 1% scale
// so the click affordance is unmistakable on a glass surface where flat
// hover colour alone is hard to perceive.
function ToneCard({
  tone,
  text,
  onClick,
}: {
  tone: Tone;
  text: string;
  onClick: () => void;
}) {
  const { Icon, label } = TONE_META[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-full text-left rounded-[20px] p-3 bg-white/[0.04] hover:bg-likho-orange/10 active:bg-likho-orange/15 border border-white/10 hover:border-likho-orange/50 focus:border-likho-orange/70 focus:outline-none transition-all duration-150 hover:scale-[1.01] active:scale-[1.0]"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon
          className="w-3.5 h-3.5 text-likho-orange shrink-0"
          strokeWidth={2.25}
        />
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-likho-orange group-hover:text-white transition-colors">
          {label}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-likho-orange/40 to-transparent" />
      </div>
      <p className="text-sm text-white leading-snug whitespace-pre-wrap break-words">
        {text}
      </p>
    </button>
  );
}

// Skeleton card while AI is computing. Same outer shape as ToneCard so the
// transition to the loaded state doesn't feel jarring. Two grey shimmer
// bars stand in for the rewrite text.
function SkeletonToneCard({ tone }: { tone: Tone }) {
  const { Icon, label } = TONE_META[tone];
  return (
    <div className="block w-full rounded-[20px] p-3 bg-white/[0.03] border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className="w-3.5 h-3.5 text-likho-orange/60 shrink-0"
          strokeWidth={2.25}
        />
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-likho-orange/60">
          {label}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-likho-orange/20 to-transparent" />
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 rounded shimmer w-[92%]" />
        <div className="h-2.5 rounded shimmer w-[68%]" />
      </div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      <p className="text-sm text-white/70">{label}</p>
    </div>
  );
}

function LanguageBadge({ lang }: { lang: Exclude<DetectedLanguage, "english"> }) {
  const label = lang === "hinglish" ? "Hinglish" : "Mixed";
  return (
    <span
      className="shrink-0 flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-likho-orange/15 border border-likho-orange/60 text-likho-orange"
      title={lang === "hinglish" ? "Detected: Hinglish" : "Detected: mixed Hindi + English"}
    >
      <Languages className="w-3 h-3" strokeWidth={2.25} />
      {label}
    </span>
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
    const lang: DetectedLanguage =
      data.detected_language === "hinglish" || data.detected_language === "mixed"
        ? data.detected_language
        : "english";
    return {
      ok: true,
      rewrites: {
        professional: data.professional,
        concise: data.concise,
        friendly: data.friendly,
        detected_language: lang,
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
