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
  | { kind: "founding_full" }
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
      // Special case: 50 founding spots are taken. Show a distinct sold-out
      // state with a clear next-best-action (Pro tier scroll target),
      // instead of a generic "couldn't start checkout" error.
      if (orderResult.error === "founding_full") {
        setStatus({ kind: "founding_full" });
        return;
      }
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
        // The user has been charged at this point. Retry verification a
        // few times before giving up — most failures are transient (cold
        // Worker, brief network glitch). On persistent failure, surface
        // the payment_id so the user can prove they paid in support.
        let verifyResult = await verifyRazorpayPayment(response, cleaned);
        for (let attempt = 1; attempt < 3 && !verifyResult.ok; attempt++) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          verifyResult = await verifyRazorpayPayment(response, cleaned);
        }
        if (verifyResult.ok) {
          setStatus({ kind: "paid" });
        } else {
          // Don't drop the payment_id on the floor — the user has paid.
          console.error("[razorpay] verify_failed_after_charge", response);
          setStatus({
            kind: "error",
            message:
              `Payment received (${response.razorpay_payment_id}) but we couldn't ` +
              `confirm it on our end. Email founder@likho.ai with this payment ID ` +
              `and we'll activate your account immediately.`,
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
        <h4 className="text-lg font-bold text-likho-indigo">You're a founding member 🎉</h4>
        <p className="text-sm text-likho-slate mt-2">
          Payment confirmed. We've recorded your spot — you'll get an email with download details
          and your lifetime licence within a day.
        </p>
      </div>
    );
  }

  if (status.kind === "founding_full") {
    return (
      <div className="glass-card rounded-2xl p-5 text-center">
        <h4 className="text-lg font-bold text-likho-indigo">All 50 founding spots are taken</h4>
        <p className="text-sm text-likho-slate mt-2 mb-4">
          The lifetime tier sold out. The Pro tier (₹299/month, unlimited rewrites) is still open
          and unlocks the same features — same app, same overlay, monthly billing.
        </p>
        <a
          href="#founding"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-likho-indigo text-likho-cream text-sm font-bold hover:bg-likho-indigo/90 active:scale-[0.98] transition-all"
        >
          Subscribe to Pro instead
        </a>
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
