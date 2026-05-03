"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Zap,
  Smile,
  ArrowRight,
  Check,
  Languages,
  Sparkles,
  Download,
  type LucideIcon,
} from "lucide-react";
import type { Rewrites, DetectedLanguage } from "@/lib/api";

type Tone = "professional" | "concise" | "friendly";
const TONES: Tone[] = ["professional", "concise", "friendly"];
const TONE_META: Record<Tone, { Icon: LucideIcon; label: string }> = {
  professional: { Icon: Briefcase, label: "Professional" },
  concise: { Icon: Zap, label: "Concise" },
  friendly: { Icon: Smile, label: "Friendly" },
};

// Pre-rendered demo rewrites — the landing page never calls the AI proxy,
// so credentials can't be exhausted no matter how many visitors click.
// The three samples were chosen to showcase the three things the desktop
// app does well: Indian-English idiom cleanup, Hinglish→English, and
// formal-tone polish.
type Sample = { label: string; original: string; rewrites: Rewrites };
const SAMPLES: Sample[] = [
  {
    label: "Indian English",
    original: "kindly do the needful asap regarding the invoice, also PFA",
    rewrites: {
      professional:
        "Could you please look into the invoice and take the necessary action? I've attached it for your reference.",
      concise: "Please process the attached invoice as soon as possible.",
      friendly:
        "Hey — when you get a moment, could you take a look at the invoice I've attached? Thanks!",
      detected_language: "english",
    },
  },
  {
    label: "Hinglish",
    original: "mera kal meeting hai pls confirm karo",
    rewrites: {
      professional:
        "I have a meeting scheduled for tomorrow. Could you please confirm your availability?",
      concise: "Meeting tomorrow — please confirm.",
      friendly: "I've got a meeting tomorrow — can you confirm if you're in?",
      detected_language: "hinglish",
    },
  },
  {
    label: "Formal polish",
    original: "Sir please send the report jaldi, also PFA the document",
    rewrites: {
      professional:
        "Could you please share the report at the earliest? I have attached the supporting document for reference.",
      concise: "Please share the report soon — supporting document attached.",
      friendly:
        "Hi — could you send over the report when you can? I've attached the document too.",
      detected_language: "english",
    },
  },
];

type View =
  | { kind: "idle" }
  | { kind: "loading"; sample: Sample }
  | { kind: "done"; sample: Sample };

// Mimic the desktop app's ~1.6s rewrite delay so the demo feels real.
const FAKE_LATENCY_MS = 1600;

export function InteractiveMockup() {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [copiedTone, setCopiedTone] = useState<Tone | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onPick = (sample: Sample) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setView({ kind: "loading", sample });
    timerRef.current = window.setTimeout(() => {
      setView({ kind: "done", sample });
      timerRef.current = null;
    }, FAKE_LATENCY_MS);
  };

  const onReset = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setView({ kind: "idle" });
  };

  const onCopy = async (tone: Tone, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTone(tone);
      window.setTimeout(() => setCopiedTone((t) => (t === tone ? null : t)), 1500);
    } catch {
      /* clipboard unavailable — silently fail */
    }
  };

  return (
    <div className="glass-card-strong rounded-3xl p-5 w-full max-w-md">
      <div className="flex items-center gap-2 mb-4">
        <div className="text-[10px] font-bold text-primary tracking-[0.25em] uppercase">
          Likho
        </div>
        <span className="h-px flex-1 bg-primary-container/15" />
        <span className="text-[9px] uppercase tracking-wider font-semibold text-on-surface-variant">
          Demo
        </span>
      </div>

      <AnimatePresence mode="wait">
        {view.kind === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold text-on-surface-variant mb-2">
              Pick a sample to see Likho rewrite it
            </p>
            <div className="space-y-2">
              {SAMPLES.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPick(s)}
                  className="group block w-full text-left rounded-xl px-3 py-2.5 bg-surface-container/55 hover:bg-surface-container-high border border-primary/15 hover:border-primary/40 transition-all hover:scale-[1.01] active:scale-[1.0]"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] uppercase tracking-[0.18em] font-bold text-primary">
                      {s.label}
                    </span>
                    <ArrowRight
                      className="ml-auto w-3.5 h-3.5 text-on-surface-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                      strokeWidth={2.5}
                    />
                  </div>
                  <p className="text-sm text-on-surface italic leading-snug">
                    "{s.original}"
                  </p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-center text-on-surface-variant">
              Want to try your own text? Download the app — works on any Windows app.
            </p>
          </motion.div>
        )}

        {view.kind === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <OriginalSnippet text={view.sample.original} />
            <div className="space-y-2">
              {TONES.map((tone) => (
                <SkeletonCard key={tone} tone={tone} />
              ))}
            </div>
          </motion.div>
        )}

        {view.kind === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            <OriginalSnippet
              text={view.sample.original}
              lang={view.sample.rewrites.detected_language}
            />
            <div className="space-y-2">
              {TONES.map((tone) => (
                <ToneCard
                  key={tone}
                  tone={tone}
                  text={view.sample.rewrites[tone]}
                  copied={copiedTone === tone}
                  onClick={() => onCopy(tone, view.sample.rewrites[tone])}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onReset}
                className="text-xs text-primary font-semibold hover:underline"
              >
                ← Try another sample
              </button>
              <a
                href="#download"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-secondary transition-colors"
              >
                <Download className="w-3 h-3" strokeWidth={2.5} />
                Try your own text
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OriginalSnippet({
  text,
  lang,
}: {
  text: string;
  lang?: DetectedLanguage;
}) {
  return (
    <div className="flex items-start gap-2 mb-3 pb-3 border-b border-primary/15">
      <p
        className="text-xs text-on-surface-variant italic flex-1 min-w-0 line-clamp-2"
        title={text}
      >
        "{text}"
      </p>
      {lang && lang !== "english" && (
        <span
          className="shrink-0 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-primary-container/10 border border-primary/30 text-primary"
          title={lang === "hinglish" ? "Detected: Hinglish" : "Detected: mixed"}
        >
          <Languages className="w-2.5 h-2.5" strokeWidth={2.5} />
          {lang === "hinglish" ? "Hinglish" : "Mixed"}
        </span>
      )}
    </div>
  );
}

function ToneCard({
  tone,
  text,
  copied,
  onClick,
}: {
  tone: Tone;
  text: string;
  copied: boolean;
  onClick: () => void;
}) {
  const { Icon, label } = TONE_META[tone];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * TONES.indexOf(tone), duration: 0.22 }}
      className="group block w-full text-left rounded-xl p-2.5 bg-surface-container/55 hover:bg-surface-container-high border border-primary/15 hover:border-primary/40 transition-all hover:scale-[1.01] active:scale-[1.0]"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={2.25} />
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-primary">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-on-surface-variant group-hover:text-primary font-semibold transition-colors">
          {copied ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3" strokeWidth={3} /> Copied
            </span>
          ) : (
            "Click to copy"
          )}
        </span>
      </div>
      <p className="text-sm text-on-surface leading-snug whitespace-pre-wrap break-words">
        {text}
      </p>
    </motion.button>
  );
}

function SkeletonCard({ tone }: { tone: Tone }) {
  const { Icon, label } = TONE_META[tone];
  return (
    <div className="rounded-xl p-2.5 bg-surface-container/40 border border-primary/10">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-primary/50" strokeWidth={2.25} />
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-primary/50">
          {label}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 rounded shimmer-light w-[92%]" />
        <div className="h-2.5 rounded shimmer-light w-[68%]" />
      </div>
    </div>
  );
}

export function HeroSparkle() {
  return (
    <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
  );
}
