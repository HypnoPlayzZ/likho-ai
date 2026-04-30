"use client";

import { useState } from "react";
import { CreditCard, Check, Loader2 } from "lucide-react";
import {
  createRazorpaySubscription,
  loadRazorpayScript,
  verifyRazorpayPayment,
} from "@/lib/razorpay";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "verifying" }
  | { kind: "subscribed" }
  | { kind: "error"; message: string };

export function RazorpayProSubscribe() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const onSubscribe = async () => {
    const cleaned = email.trim().toLowerCase();
    if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setStatus({ kind: "error", message: "Please enter a valid email." });
      return;
    }
    setStatus({ kind: "loading" });

    const scriptOk = await loadRazorpayScript();
    if (!scriptOk || !window.Razorpay) {
      setStatus({ kind: "error", message: "Couldn't load checkout. Check your connection." });
      return;
    }

    const result = await createRazorpaySubscription(cleaned);
    if (!result.ok || !result.subscription) {
      setStatus({ kind: "error", message: result.message ?? "Couldn't start subscription." });
      return;
    }
    const { subscription } = result;

    setStatus({ kind: "idle" });

    const rzp = new window.Razorpay({
      key: subscription.key_id,
      subscription_id: subscription.subscription_id,
      name: "Likho",
      description: "Pro · ₹299/month, unlimited rewrites",
      prefill: { email: cleaned },
      theme: { color: "#3730A3" },
      modal: {
        ondismiss: () => setStatus({ kind: "idle" }),
      },
      handler: async (response) => {
        setStatus({ kind: "verifying" });
        const verifyResult = await verifyRazorpayPayment(
          {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            razorpay_subscription_id: response.razorpay_subscription_id,
          },
          cleaned,
        );
        if (verifyResult.ok) {
          setStatus({ kind: "subscribed" });
        } else {
          setStatus({
            kind: "error",
            message: verifyResult.message ?? "Subscription couldn't be verified.",
          });
        }
      },
    });
    rzp.on("payment.failed", (e) => {
      setStatus({
        kind: "error",
        message: e.error?.description ?? "Payment failed. Please try again.",
      });
    });
    rzp.open();
  };

  if (status.kind === "subscribed") {
    return (
      <div className="rounded-2xl p-4 text-center bg-emerald-500/10 border border-emerald-500/30">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 mb-2">
          <Check className="w-5 h-5 text-emerald-600" strokeWidth={2.5} />
        </div>
        <h4 className="text-base font-bold text-likho-orange">Subscribed 🎉</h4>
        <p className="text-xs text-likho-slate mt-1">
          You'll get an email with download details and your licence key shortly.
        </p>
      </div>
    );
  }

  const busy = status.kind === "loading" || status.kind === "verifying";

  return (
    <div className="space-y-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        disabled={busy}
        className="w-full rounded-full px-4 py-2.5 bg-white/70 border border-likho-indigo/20 text-sm text-likho-ink placeholder:text-likho-slate/50 focus:bg-white focus:border-likho-indigo/50 focus:outline-none focus:ring-2 focus:ring-likho-indigo/15 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onSubscribe}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-white/70 hover:bg-white text-likho-orange border border-likho-indigo/25 text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
            {status.kind === "verifying" ? "Verifying…" : "Loading…"}
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" strokeWidth={2.5} />
            Subscribe ₹299/mo
          </>
        )}
      </button>
      {status.kind === "error" && (
        <p className="text-[11px] text-likho-coral px-1 text-center">{status.message}</p>
      )}
    </div>
  );
}
