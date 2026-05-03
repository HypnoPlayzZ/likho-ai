"use client";

import { useState } from "react";
import { Mic, Check, Loader2 } from "lucide-react";
import {
  createRazorpayProPlusSubscription,
  loadRazorpayScript,
  verifyRazorpayPayment,
} from "@/lib/razorpay";

// Pro+ subscribe widget (v0.3.0 launch). Mirrors the Pro flow but at
// ₹499/mo and tagged as the "voice mode" tier. Surfaces a "launching
// soon" message when the Worker hasn't yet been configured with
// RAZORPAY_PRO_PLUS_PLAN_ID.
type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "verifying" }
  | { kind: "subscribed" }
  | { kind: "soon" }
  | { kind: "error"; message: string };

export function RazorpayProPlusSubscribe() {
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

    const result = await createRazorpayProPlusSubscription(cleaned);
    if (!result.ok || !result.subscription) {
      // Plan-not-configured means the founder hasn't created the Razorpay
      // plan yet. Surface the soft "soon" state instead of a hard error
      // since founding membership is already a viable purchase path.
      if (result.error === "pro_plus_not_configured") {
        setStatus({ kind: "soon" });
        return;
      }
      setStatus({ kind: "error", message: result.message ?? "Couldn't start subscription." });
      return;
    }
    const { subscription } = result;
    setStatus({ kind: "idle" });

    const rzp = new window.Razorpay({
      key: subscription.key_id,
      subscription_id: subscription.subscription_id,
      name: "Likho Pro+",
      description: "Pro+ · ₹499/month, includes voice mode",
      prefill: { email: cleaned },
      theme: { color: "#3730A3" },
      modal: {
        ondismiss: () => setStatus({ kind: "idle" }),
      },
      handler: async (response) => {
        setStatus({ kind: "verifying" });
        const fields = {
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          razorpay_subscription_id: response.razorpay_subscription_id,
        };
        let verifyResult = await verifyRazorpayPayment(fields, cleaned);
        for (let attempt = 1; attempt < 3 && !verifyResult.ok; attempt++) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          verifyResult = await verifyRazorpayPayment(fields, cleaned);
        }
        if (verifyResult.ok) {
          setStatus({ kind: "subscribed" });
        } else {
          console.error("[razorpay] pro_plus_verify_failed_after_charge", response);
          setStatus({
            kind: "error",
            message:
              `Subscription mandate set up (${response.razorpay_payment_id}) but ` +
              `we couldn't confirm it on our end. Email founder@likho.ai with this ` +
              `payment ID and we'll activate your account immediately.`,
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
        <h4 className="text-base font-bold text-primary">Pro+ activated 🎉</h4>
        <p className="text-xs text-on-surface-variant mt-1">
          Voice mode is yours. Sign in on the desktop app with this email and hold Alt+V.
        </p>
      </div>
    );
  }

  if (status.kind === "soon") {
    return (
      <div className="rounded-2xl p-4 text-center bg-primary-container/5 border border-primary/20">
        <p className="text-sm text-primary font-bold">Pro+ launches in days</p>
        <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
          Want voice mode <strong>now</strong>? Founding members already have it included —
          ₹4,900 lifetime.
        </p>
        <a
          href="#founding-form"
          className="mt-3 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-primary-container text-on-primary-container text-xs font-bold hover:bg-primary-container/90 active:scale-[0.98] transition-all"
        >
          Get founding access
        </a>
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
        className="w-full rounded-full px-4 py-2.5 bg-surface-container/70 border border-primary/20 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:bg-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onSubscribe}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-primary-container text-on-primary-container text-sm font-bold hover:bg-primary-container/90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
            {status.kind === "verifying" ? "Verifying…" : "Loading…"}
          </>
        ) : (
          <>
            <Mic className="w-4 h-4" strokeWidth={2.5} />
            Subscribe ₹499/mo
          </>
        )}
      </button>
      {status.kind === "error" && (
        <p className="text-[11px] text-error px-1 text-center">{status.message}</p>
      )}
    </div>
  );
}
