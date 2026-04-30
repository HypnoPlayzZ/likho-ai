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
  Sparkles,
  X,
  ArrowRight,
  Lock,
  type LucideIcon,
} from "lucide-react";

// Production builds talk to the deployed Cloudflare Worker; `vite dev`
// (used by `npm run tauri dev`) talks to the local Wrangler at 8787.
// import.meta.env.DEV is true only during dev — Vite strips this branch
// during production builds.
const API_BASE = import.meta.env.DEV
  ? "http://127.0.0.1:8787"
  : "https://likho-proxy.httpswwwhltvorg.workers.dev";
const PROXY_URL = `${API_BASE}/rewrite`;
const WAITLIST_URL = `${API_BASE}/waitlist`;
const WAITLIST_COUNT_URL = `${API_BASE}/waitlist/count`;

// Day 8: free-trial cap. Lifetime, not daily — so the localStorage key
// `likho_demo_used` is the source of truth across sessions.
const DEMO_CAP = 5;

// Hardcoded fallback if the live waitlist count endpoint isn't reachable.
// 50 cap minus a starting baseline so the number isn't psychologically
// discouraging on day one (per PRD-COMPACT.md "Founding Lifetime ... first 50").
const FALLBACK_REMAINING = 37;

const SIGNUP_URL = "https://likho.ai/signup"; // Day 9+: real Clerk magic-link page

type DetectedLanguage = "english" | "hinglish" | "mixed";

interface Rewrites {
  professional: string;
  concise: string;
  friendly: string;
  detected_language: DetectedLanguage;
}

type Tone = "professional" | "concise" | "friendly";
const TONES: Tone[] = ["professional", "concise", "friendly"];

const TONE_META: Record<Tone, { Icon: LucideIcon; label: string }> = {
  professional: { Icon: Briefcase, label: "Professional" },
  concise: { Icon: Zap, label: "Concise" },
  friendly: { Icon: Smile, label: "Friendly" },
};

type Status =
  | { kind: "idle" }
  | { kind: "intro" }                                   // first ever Alt+Space
  | { kind: "gated" }                                   // 5/5 demo rewrites used
  | { kind: "no_selection" }
  | { kind: "rewriting"; original: string }
  | { kind: "done"; original: string; rewrites: Rewrites }
  | { kind: "replaced" }
  | { kind: "error"; original: string; message: string };

type ProModal =
  | { kind: "closed" }
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "submitted"; position: number }
  | { kind: "error"; message: string };

// localStorage helpers — read fresh each time to avoid stale-closure issues
// inside the long-lived event listener registered on mount.
const getDemoUsed = () => {
  const n = parseInt(localStorage.getItem("likho_demo_used") || "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const getIntroSeen = () => localStorage.getItem("likho_intro_seen") === "true";
const setDemoUsedLS = (n: number) => localStorage.setItem("likho_demo_used", String(n));
const setIntroSeenLS = () => localStorage.setItem("likho_intro_seen", "true");

function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showCounter, setShowCounter] = useState(0);
  const [demoUsed, setDemoUsed] = useState<number>(getDemoUsed);
  const [, setIntroSeen] = useState<boolean>(getIntroSeen);
  const [proModal, setProModal] = useState<ProModal>({ kind: "closed" });
  const [spotsLeft, setSpotsLeft] = useState<number>(FALLBACK_REMAINING);

  // Pull live waitlist count once on mount; fall back to hardcoded 37 if
  // the worker isn't reachable (matches what we'd show before any signups).
  useEffect(() => {
    fetch(WAITLIST_COUNT_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { remaining?: number }) => {
        if (typeof d.remaining === "number") setSpotsLeft(d.remaining);
      })
      .catch(() => {
        /* keep fallback */
      });
  }, []);

  useEffect(() => {
    const unlistenCapture = listen<string>("text-captured", async (event) => {
      // Demo gates run BEFORE the rewrite call:
      // 1. Never seen the intro? Show it instead of rewriting.
      // 2. Used all 5 demo rewrites? Show the gated screen.
      // 3. Empty selection? Same as before.
      if (!getIntroSeen()) {
        setStatus({ kind: "intro" });
        return;
      }
      if (getDemoUsed() >= DEMO_CAP) {
        setStatus({ kind: "gated" });
        return;
      }

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
      // Only count successful rewrites against the demo cap. Errors don't
      // burn a credit — fair to the user and avoids penalising network blips.
      if (result.ok) {
        const next = getDemoUsed() + 1;
        setDemoUsedLS(next);
        setDemoUsed(next);
      }
    });

    const unlistenHidden = listen("overlay-hidden", () => {
      setStatus({ kind: "idle" });
      setProModal({ kind: "closed" });
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

  // Esc handler: close the Pro modal first if open, otherwise hide overlay.
  useEffect(() => {
    const appWindow = getCurrentWindow();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (proModal.kind !== "closed") {
          setProModal({ kind: "closed" });
        } else {
          appWindow.hide();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [proModal.kind]);

  const onPick = async (text: string) => {
    try {
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

  const onIntroDismiss = () => {
    setIntroSeenLS();
    setIntroSeen(true);
    // Drop straight into the empty/instruction state — they'll Alt+Space again
    // with text selected. Keeping the overlay visible feels welcoming.
    setStatus({ kind: "no_selection" });
  };

  const onSignUp = () => {
    window.open(SIGNUP_URL, "_blank");
  };

  const submitWaitlist = async (email: string) => {
    setProModal({ kind: "submitting" });
    try {
      const res = await fetch(WAITLIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === "invalid_email") {
          setProModal({ kind: "error", message: "That email doesn't look right — please check." });
        } else if (data?.error === "waitlist_full") {
          setProModal({
            kind: "error",
            message: "All 50 founding spots are taken. We'll keep you posted on Pro launch.",
          });
        } else {
          setProModal({
            kind: "error",
            message: "Couldn't reserve your spot — please try again in a moment.",
          });
        }
        return;
      }
      setProModal({ kind: "submitted", position: data.position });
      // Refresh the live "spots left" so the next person sees the updated number.
      if (typeof data.total === "number") {
        setSpotsLeft(Math.max(0, 50 - data.total));
      }
    } catch {
      setProModal({
        kind: "error",
        message: "Couldn't reach the server. Is the proxy running?",
      });
    }
  };

  const showProPill = isProPillVisible(status, proModal);

  return (
    <div key={showCounter} className="h-full w-full p-2 flex animate-overlay-in">
      <div className="flex-1 flex flex-col rounded-[20px] overflow-hidden bg-black/30 backdrop-blur-md border border-white/20 ring-1 ring-inset ring-white/10 shadow-2xl shadow-black/60 relative">
        <div className="flex-1 flex flex-col p-4 min-h-0">
          {proModal.kind !== "closed"
            ? renderProModal(proModal, spotsLeft, submitWaitlist, () =>
                setProModal({ kind: "closed" }),
              )
            : renderStatus(status, {
                onPick,
                onIntroDismiss,
                onSignUp,
                openProModal: () => setProModal({ kind: "form" }),
                demoUsed,
              })}
        </div>
        {showProPill && (
          <ProPill onClick={() => setProModal({ kind: "form" })} />
        )}
      </div>
    </div>
  );
}

function isProPillVisible(status: Status, proModal: ProModal): boolean {
  if (proModal.kind !== "closed") return false;
  switch (status.kind) {
    case "rewriting":
    case "replaced":
    case "intro":
      return false;
    default:
      return true;
  }
}

interface MainHandlers {
  onPick: (text: string) => void;
  onIntroDismiss: () => void;
  onSignUp: () => void;
  openProModal: () => void;
  demoUsed: number;
}

function renderStatus(s: Status, h: MainHandlers) {
  switch (s.kind) {
    case "idle":
      return (
        <CenterMessage>
          <Spinner label="Capturing text..." />
        </CenterMessage>
      );

    case "intro":
      return <IntroScreen onDismiss={h.onIntroDismiss} />;

    case "gated":
      return <GatedScreen onSignUp={h.onSignUp} onReserve={h.openProModal} />;

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
          <DemoCounter used={h.demoUsed} />
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
                onClick={() => h.onPick(s.rewrites[tone])}
              />
            ))}
          </div>
          <FooterWithDemo demoUsed={h.demoUsed} />
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

// ---------- Demo screens ----------

function IntroScreen({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
      <div className="w-12 h-12 rounded-full bg-likho-orange/15 border border-likho-orange/40 flex items-center justify-center mb-3">
        <Sparkles className="w-6 h-6 text-likho-orange" strokeWidth={2} />
      </div>
      <h2 className="text-lg text-white font-semibold">Try Likho free</h2>
      <p className="text-sm text-white/70 mt-1.5 max-w-[300px]">
        5 rewrites to feel the magic — no signup required.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-likho-orange text-likho-indigo text-sm font-bold tracking-wide hover:brightness-110 active:scale-[0.98] transition-all"
      >
        Start using Likho
        <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
      </button>
      <p className="text-[11px] text-white/45 mt-3">
        Highlight text in any app → press <KeyHint>Alt</KeyHint>
        <span className="mx-1 text-white/40">+</span>
        <KeyHint>Space</KeyHint>
      </p>
    </div>
  );
}

function GatedScreen({
  onSignUp,
  onReserve,
}: {
  onSignUp: () => void;
  onReserve: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col text-center px-1">
      <div className="flex flex-col items-center pt-1">
        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/15 flex items-center justify-center mb-2">
          <Lock className="w-5 h-5 text-white/70" strokeWidth={1.5} />
        </div>
        <h2 className="text-base text-white font-semibold">You've used your 5 free rewrites</h2>
        <p className="text-xs text-white/65 mt-1 max-w-[320px]">
          Pick how you'd like to keep going.
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-1.5 mt-3">
        <button
          type="button"
          onClick={onSignUp}
          className="block w-full text-left rounded-[16px] p-2.5 bg-white/[0.04] hover:bg-white/[0.10] active:bg-white/[0.14] border border-white/15 hover:border-white/30 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/70 mb-0.5">
            Free
          </div>
          <div className="text-sm text-white font-medium">Sign up — 20 rewrites/day</div>
          <div className="text-[11px] text-white/55">Email magic-link, no card required.</div>
        </button>

        <button
          type="button"
          onClick={onReserve}
          className="block w-full text-left rounded-[16px] p-2.5 bg-likho-orange/10 hover:bg-likho-orange/15 active:bg-likho-orange/20 border border-likho-orange/40 hover:border-likho-orange/60 transition-colors"
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <Sparkles className="w-3 h-3 text-likho-orange" strokeWidth={2.5} />
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-likho-orange">
              Founding member
            </div>
          </div>
          <div className="text-sm text-white font-medium">
            Lifetime Pro — ₹4,900 once
          </div>
          <div className="text-[11px] text-white/65">
            First 50 only. Reserve your spot now.
          </div>
        </button>
      </div>
    </div>
  );
}

// ---------- Pro modal ----------

function renderProModal(
  m: ProModal,
  spotsLeft: number,
  onSubmit: (email: string) => void,
  onClose: () => void,
) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-likho-orange" strokeWidth={2.5} />
          <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-likho-orange">
            Likho Pro
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5 text-white/70" strokeWidth={2} />
        </button>
      </div>

      {m.kind === "submitted" ? (
        <ProSubmitted position={m.position} onClose={onClose} />
      ) : (
        <ProForm
          modal={m}
          spotsLeft={spotsLeft}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}

function ProForm({
  modal,
  spotsLeft,
  onSubmit,
}: {
  modal: Exclude<ProModal, { kind: "submitted" }>;
  spotsLeft: number;
  onSubmit: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const submitting = modal.kind === "submitting";
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    onSubmit(email.trim());
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-1 px-1">
      <div className="text-white">
        <h2 className="text-lg font-bold leading-tight">Pro launches May 2026</h2>
        <p className="text-xs text-white/70 mt-1.5 leading-relaxed">
          Unlimited rewrites · Voice mode · Long-email summary · Custom tones · Outlook plugin.
        </p>
        <p className="text-xs text-white/85 mt-2">
          ₹299/month, or save 30% annually.
        </p>
      </div>

      <div className="mt-3 rounded-[16px] p-2.5 bg-likho-orange/10 border border-likho-orange/40">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles className="w-3 h-3 text-likho-orange" strokeWidth={2.5} />
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-likho-orange">
            Founding members
          </span>
        </div>
        <p className="text-sm text-white">
          ₹4,900 lifetime, never charged again.
        </p>
        <p className="text-[11px] text-white/70 mt-0.5">
          {spotsLeft > 0 ? `Only ${spotsLeft} of 50 spots left.` : "All 50 spots taken."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-1.5">
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={submitting}
          className="flex-1 min-w-0 rounded-[12px] px-3 py-2 bg-white/[0.06] border border-white/20 text-sm text-white placeholder:text-white/35 focus:bg-white/[0.10] focus:border-likho-orange/50 focus:outline-none transition-colors disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting || spotsLeft <= 0}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-[12px] bg-likho-orange text-likho-indigo text-sm font-bold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "..." : "Reserve"}
          {!submitting && <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />}
        </button>
      </form>

      {modal.kind === "error" && (
        <p className="text-xs text-likho-coral mt-2">{modal.message}</p>
      )}
    </div>
  );
}

function ProSubmitted({ position, onClose }: { position: number; onClose: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-full bg-emerald-400/15 border border-emerald-400/40 flex items-center justify-center mb-3 animate-overlay-in">
        <Check className="w-6 h-6 text-emerald-300" strokeWidth={2.5} />
      </div>
      <h2 className="text-base text-white font-semibold">You're in</h2>
      <p className="text-sm text-white/80 mt-1.5">
        You're <span className="text-likho-orange font-bold">#{position}</span> on the founding-member list.
      </p>
      <p className="text-xs text-white/60 mt-2 max-w-[300px]">
        We'll email you the moment Pro is ready. No charge until you opt in.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-white hover:bg-white/15 transition-colors"
      >
        Back to rewriting
      </button>
    </div>
  );
}

// ---------- Pro pill (corner) ----------

function ProPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-likho-orange/15 border border-likho-orange/50 text-likho-orange text-[10px] font-bold uppercase tracking-wider hover:bg-likho-orange/25 hover:scale-[1.03] active:scale-[0.97] transition-all"
      title="Likho Pro is launching soon"
    >
      <Sparkles className="w-3 h-3" strokeWidth={2.5} />
      Pro
    </button>
  );
}

// ---------- Demo counter ----------

function DemoCounter({ used }: { used: number }) {
  if (used === 0) return null; // Don't show on first ever rewrite, looks promotional
  return (
    <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/15 text-[10px] text-white/65">
      <span>
        {used} of {DEMO_CAP} demo rewrites used
      </span>
    </div>
  );
}

function FooterWithDemo({ demoUsed }: { demoUsed: number }) {
  return (
    <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-white/45 gap-2">
      <span className="truncate">
        {demoUsed > 0 ? `${demoUsed} of ${DEMO_CAP} demo rewrites used` : "Click a tone to replace"}
      </span>
      <KeyHint>Esc</KeyHint>
    </div>
  );
}

// ---------- Shared building blocks (unchanged from Day 7) ----------

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

// ---------- API ----------

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
