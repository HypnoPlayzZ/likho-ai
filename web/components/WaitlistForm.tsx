"use client";

import { useState } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { joinWaitlist } from "@/lib/api";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; position: number; alreadyListed: boolean }
  | { kind: "error"; message: string };

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || state.kind === "submitting") return;
    setState({ kind: "submitting" });
    const res = await joinWaitlist(email.trim());
    if (res.ok && typeof res.position === "number") {
      setState({
        kind: "success",
        position: res.position,
        alreadyListed: !!res.alreadyListed,
      });
    } else {
      setState({ kind: "error", message: res.message ?? "Something went wrong." });
    }
  };

  if (state.kind === "success") {
    return (
      <div className="glass-card rounded-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto mb-3">
          <Check className="w-6 h-6 text-emerald-600" strokeWidth={2.5} />
        </div>
        <h3 className="text-lg text-likho-orange font-bold">
          You're #{state.position} on the founding-member list
        </h3>
        <p className="text-sm text-likho-slate mt-2 max-w-sm mx-auto">
          {state.alreadyListed
            ? "You were already on the list — we'll email you the moment Pro is ready."
            : "We'll email you the moment Pro is ready. No charge until you opt in."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="glass-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-likho-orange" strokeWidth={2.5} />
        <h3 className="text-sm uppercase tracking-[0.18em] font-bold text-likho-orange">
          Reserve my founding-member spot
        </h3>
      </div>
      <p className="text-sm text-likho-slate mb-4">
        ₹4,900 once, locked-in lifetime price, priority support. First 50 only.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={state.kind === "submitting"}
          className="flex-1 min-w-0 rounded-full px-4 py-2.5 bg-white/85 border border-likho-indigo/25 text-sm text-likho-ink placeholder:text-likho-slate/50 focus:bg-white focus:border-likho-indigo/60 focus:outline-none focus:ring-2 focus:ring-likho-indigo/15 transition-colors disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={state.kind === "submitting" || !email.trim()}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-likho-indigo text-likho-cream text-sm font-bold hover:bg-likho-indigo/90 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.kind === "submitting" ? "Reserving..." : "Reserve"}
          {state.kind !== "submitting" && (
            <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
          )}
        </button>
      </div>
      {state.kind === "error" && (
        <p className="text-xs text-likho-coral mt-2">{state.message}</p>
      )}
      <p className="text-[10px] text-likho-slate mt-3">
        We'll only email you about Pro launch and founding-member access. No spam.
      </p>
    </form>
  );
}
