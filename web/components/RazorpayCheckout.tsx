"use client";

import { useState } from "react";
import { CreditCard, Check, Loader2 } from "lucide-react";
import {
  createRazorpayOrder,
  loadRazorpayScript,
  verifyRazorpayPayment,
} from "@/lib/razorpay";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "verifying" }
  | { kind: "paid" }
  | { kind: "error"; message: string };

export function RazorpayCheckout() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const onPay = async () => {
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

    const orderResult = await createRazorpayOrder(cleaned);
    if (!orderResult.ok || !orderResult.order) {
      setStatus({ kind: "error", message: orderResult.message ?? "Couldn't start checkout." });
      return;
    }
    const { order } = orderResult;

    setStatus({ kind: "idle" });

    const rzp = new window.Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: "Likho",
      description: "Founding-member lifetime access",
      prefill: { email: cleaned },
      theme: { color: "#3730A3" },
      modal: {
        ondismiss: () => {
          setStatus({ kind: "idle" });
        },
      },
      handler: async (response) => {
        setStatus({ kind: "verifying" });
        const verifyResult = await verifyRazorpayPayment(response, cleaned);
        if (verifyResult.ok) {
          setStatus({ kind: "paid" });
        } else {
          setStatus({
            kind: "error",
            message: verifyResult.message ?? "Payment couldn't be verified.",
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

  if (status.kind === "paid") {
    return (
      <div className="glass-card rounded-2xl p-5 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 mb-3">
          <Check className="w-6 h-6 text-emerald-600" strokeWidth={2.5} />
        </div>
        <h4 className="text-lg font-bold text-likho-orange">You're a founding member 🎉</h4>
        <p className="text-sm text-likho-slate mt-2">
          Payment confirmed. We've recorded your spot — you'll get an email with download details
          and your lifetime licence within a day.
        </p>
      </div>
    );
  }

  const busy = status.kind === "loading" || status.kind === "verifying";

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={busy}
          className="flex-1 rounded-full px-4 py-2.5 bg-white/70 border border-likho-indigo/20 text-sm text-likho-ink placeholder:text-likho-slate/50 focus:bg-white focus:border-likho-indigo/50 focus:outline-none focus:ring-2 focus:ring-likho-indigo/15 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onPay}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-likho-indigo text-likho-cream text-sm font-bold hover:bg-likho-indigo/90 active:scale-[0.98] transition-all shadow-lg shadow-likho-indigo/25 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
              {status.kind === "verifying" ? "Verifying…" : "Loading…"}
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4" strokeWidth={2.5} />
              Pay ₹4,900 — lifetime
            </>
          )}
        </button>
      </div>
      {status.kind === "error" && (
        <p className="text-xs text-likho-coral px-1">{status.message}</p>
      )}
      <p className="text-[11px] text-likho-slate/80 px-1">
        Secure checkout via Razorpay. UPI, cards, netbanking. One-time payment, lifetime access.
      </p>
    </div>
  );
}
