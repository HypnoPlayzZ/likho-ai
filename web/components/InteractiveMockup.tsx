"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Zap,
  Smile,
  ArrowRight,
  Check,
  Languages,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { landingRewrite, type Rewrites, type DetectedLanguage } from "@/lib/api";

type Tone = "professional" | "concise" | "friendly";
const TONES: Tone[] = ["professional", "concise", "friendly"];
const TONE_META: Record<Tone, { Icon: LucideIcon; label: string }> = {
  professional: { Icon: Briefcase, label: "Professional" },
  concise: { Icon: Zap, label: "Concise" },
  friendly: { Icon: Smile, label: "Friendly" },
};

const SAMPLES = [
  "kindly do the needful asap regarding the invoice, also PFA",
  "mera kal meeting hai pls confirm karo",
  "Sir please send the report jaldi, also PFA the document",
];

type View =
  | { kind: "input" }
  | { kind: "loading"; original: string }
  | { kind: "done"; original: string; rewrites: Rewrites }
  | { kind: "rate_limited"; message: string }
  | { kind: "error"; message: string };

export function InteractiveMockup() {
  const [text, setText] = useState(SAMPLES[0]);
  const [view, setView] = useState<View>({ kind: "input" });
  const [copiedTone, setCopiedTone] = useState<Tone | null>(null);

  const onRun = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setView({ kind: "loading", original: trimmed });
    const result = await landingRewrite(trimmed);
    if (result.ok && result.rewrites) {
      setView({ kind: "done", original: trimmed, rewrites: result.rewrites });
    } else if (result.error === "rate_limited") {
      setView({ kind: "rate_limited", message: result.message ?? "Daily limit reached." });
    } else {
      setView({ kind: "error", message: result.message ?? "Something went wrong." });
    }
  };

  const onReset = () => setView({ kind: "input" });

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
        <div className="text-[10px] font-bold text-likho-indigo tracking-[0.25em] uppercase">
          Likho
        </div>
        <span className="h-px flex-1 bg-likho-indigo/15" />
        <span className="text-[9px] uppercase tracking-wider font-semibold text-likho-slate">
          Live demo
        </span>
      </div>

      <AnimatePresence mode="wait">
        {view.kind === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-likho-slate mb-1.5">
              Your text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={400}
              className="w-full rounded-xl px-3 py-2.5 bg-white/70 border border-likho-indigo/20 text-sm text-likho-ink placeholder:text-likho-slate/50 focus:bg-white focus:border-likho-indigo/50 focus:outline-none focus:ring-2 focus:ring-likho-indigo/15 resize-none transition-colors"
              placeholder="Type or pick a sample below…"
            />

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {SAMPLES.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setText(s)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-likho-indigo/8 hover:bg-likho-indigo/15 border border-likho-indigo/20 text-likho-indigo font-medium transition-colors"
                  title={s}
                >
                  Sample {i + 1}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onRun}
              disabled={!text.trim()}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-likho-indigo text-likho-cream text-sm font-bold hover:bg-likho-indigo/90 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Try it <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <p className="mt-2 text-[10px] text-center text-likho-slate">
              3 free demo rewrites per day
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
            <OriginalSnippet text={view.original} />
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
              text={view.original}
              lang={view.rewrites.detected_language}
            />
            <div className="space-y-2">
              {TONES.map((tone) => (
                <ToneCard
                  key={tone}
                  tone={tone}
                  text={view.rewrites[tone]}
                  copied={copiedTone === tone}
                  onClick={() => onCopy(tone, view.rewrites[tone])}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onReset}
              className="mt-3 w-full text-center text-xs text-likho-indigo font-semibold hover:underline"
            >
              ← Try another
            </button>
          </motion.div>
        )}

        {view.kind === "rate_limited" && (
          <motion.div
            key="rate"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-6"
          >
            <p className="text-base text-likho-indigo font-bold">
              You've used your 3 daily demos.
            </p>
            <p className="text-sm text-likho-slate mt-2">{view.message}</p>
            <a
              href="#download"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-likho-indigo text-likho-cream text-sm font-bold hover:bg-likho-indigo/90 transition-colors"
            >
              Download the app <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </a>
          </motion.div>
        )}

        {view.kind === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-6"
          >
            <p className="text-sm text-likho-coral">{view.message}</p>
            <button
              type="button"
              onClick={onReset}
              className="mt-3 text-xs text-likho-indigo font-semibold hover:underline"
            >
              Try again
            </button>
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
    <div className="flex items-start gap-2 mb-3 pb-3 border-b border-likho-indigo/15">
      <p
        className="text-xs text-likho-slate italic flex-1 min-w-0 line-clamp-2"
        title={text}
      >
        "{text}"
      </p>
      {lang && lang !== "english" && (
        <span
          className="shrink-0 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-likho-indigo/10 border border-likho-indigo/30 text-likho-indigo"
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
      className="group block w-full text-left rounded-xl p-2.5 bg-white/55 hover:bg-white/85 border border-likho-indigo/15 hover:border-likho-indigo/40 transition-all hover:scale-[1.01] active:scale-[1.0]"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-likho-indigo shrink-0" strokeWidth={2.25} />
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-likho-indigo">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-likho-slate group-hover:text-likho-indigo font-semibold transition-colors">
          {copied ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3" strokeWidth={3} /> Copied
            </span>
          ) : (
            "Click to copy"
          )}
        </span>
      </div>
      <p className="text-sm text-likho-ink leading-snug whitespace-pre-wrap break-words">
        {text}
      </p>
    </motion.button>
  );
}

function SkeletonCard({ tone }: { tone: Tone }) {
  const { Icon, label } = TONE_META[tone];
  return (
    <div className="rounded-xl p-2.5 bg-white/40 border border-likho-indigo/10">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-likho-indigo/50" strokeWidth={2.25} />
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-likho-indigo/50">
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
    <Sparkles className="w-3.5 h-3.5 text-likho-indigo" strokeWidth={2.5} />
  );
}
