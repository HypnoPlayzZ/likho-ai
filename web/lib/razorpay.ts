// Razorpay Standard Checkout helpers. The Worker (proxy/) handles order
// creation and signature verification — the browser only opens the modal
// with the order_id + key_id returned by the Worker.

import { API_BASE } from "./api";

export interface RazorpayOrder {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  receipt: string;
}

export interface RazorpayCreateOrderResult {
  ok: boolean;
  order?: RazorpayOrder;
  error?: "invalid_email" | "razorpay_auth_failed" | "razorpay_error" | "network";
  message?: string;
}

export async function createRazorpayOrder(email: string): Promise<RazorpayCreateOrderResult> {
  try {
    const res = await fetch(`${API_BASE}/razorpay/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 400) {
      return { ok: false, error: "invalid_email", message: "Please enter a valid email." };
    }
    if (res.status === 401) {
      return {
        ok: false,
        error: "razorpay_auth_failed",
        message: "Payment provider unavailable. Please try again later.",
      };
    }
    if (!res.ok || !data.order_id) {
      return {
        ok: false,
        error: "razorpay_error",
        message: "Couldn't start checkout. Please retry.",
      };
    }
    return {
      ok: true,
      order: {
        order_id: data.order_id,
        amount: data.amount,
        currency: data.currency,
        key_id: data.key_id,
        receipt: data.receipt,
      },
    };
  } catch {
    return { ok: false, error: "network", message: "Couldn't reach the server. Please retry." };
  }
}

export interface RazorpaySuccessFields {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayVerifyResult {
  ok: boolean;
  error?: "signature_mismatch" | "missing_fields" | "network";
  message?: string;
}

export async function verifyRazorpayPayment(
  fields: RazorpaySuccessFields,
  email: string,
): Promise<RazorpayVerifyResult> {
  try {
    const res = await fetch(`${API_BASE}/razorpay/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 400) {
      return {
        ok: false,
        error: data.error === "missing_fields" ? "missing_fields" : "signature_mismatch",
        message: "Payment couldn't be verified. If you were charged, contact support.",
      };
    }
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: "signature_mismatch",
        message: "Payment couldn't be verified. If you were charged, contact support.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "network",
      message: "Couldn't verify payment. If you were charged, contact support.",
    };
  }
}

// Razorpay's checkout.js attaches a global `Razorpay` constructor when loaded.
// We type only what we use to keep the surface minimal.
export interface RazorpayCheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { email?: string; name?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
  handler: (response: RazorpaySuccessFields) => void;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (e: { error: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise: Promise<boolean> | null = null;

export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(!!window.Razorpay));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve(!!window.Razorpay);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return scriptPromise;
}
