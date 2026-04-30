// Single source of truth for the Cloudflare Worker URLs. Override at build
// time via NEXT_PUBLIC_API_BASE on Vercel; defaults to the local proxy for
// `npm run dev`.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8787";

export const LANDING_REWRITE_URL = `${API_BASE}/landing-rewrite`;
export const WAITLIST_URL = `${API_BASE}/waitlist`;
export const WAITLIST_COUNT_URL = `${API_BASE}/waitlist/count`;

export type DetectedLanguage = "english" | "hinglish" | "mixed";

export interface Rewrites {
  professional: string;
  concise: string;
  friendly: string;
  detected_language: DetectedLanguage;
}

export interface RewriteResult {
  ok: boolean;
  rewrites?: Rewrites;
  error?: "rate_limited" | "upstream" | "network" | "partial";
  message?: string;
}

export async function landingRewrite(text: string): Promise<RewriteResult> {
  try {
    const res = await fetch(LANDING_REWRITE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      return {
        ok: false,
        error: "rate_limited",
        message:
          data?.message ??
          "Daily demo limit reached. Try again tomorrow, or download the desktop app.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: "upstream",
        message: "AI service is busy right now. Please try again.",
      };
    }
    if (!data.professional || !data.concise || !data.friendly) {
      return { ok: false, error: "partial", message: "Got a partial reply — please retry." };
    }
    return {
      ok: true,
      rewrites: {
        professional: data.professional,
        concise: data.concise,
        friendly: data.friendly,
        detected_language:
          data.detected_language === "hinglish" || data.detected_language === "mixed"
            ? data.detected_language
            : "english",
      },
    };
  } catch {
    return {
      ok: false,
      error: "network",
      message: "Couldn't reach the demo service. Check your connection.",
    };
  }
}

export interface WaitlistResponse {
  ok: boolean;
  position?: number;
  total?: number;
  alreadyListed?: boolean;
  error?: "invalid_email" | "full" | "network";
  message?: string;
}

export async function joinWaitlist(email: string): Promise<WaitlistResponse> {
  try {
    const res = await fetch(WAITLIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 400) {
      return { ok: false, error: "invalid_email", message: "Please enter a valid email." };
    }
    if (res.status === 409) {
      return { ok: false, error: "full", message: "All 50 founding spots are taken." };
    }
    if (!res.ok) {
      return { ok: false, error: "network", message: "Couldn't reserve your spot. Please retry." };
    }
    return {
      ok: true,
      position: data.position,
      total: data.total,
      alreadyListed: data.already_listed,
    };
  } catch {
    return { ok: false, error: "network", message: "Couldn't reach the server. Please retry." };
  }
}

export async function fetchSpotsLeft(): Promise<number | null> {
  try {
    const res = await fetch(WAITLIST_COUNT_URL);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.remaining === "number" ? data.remaining : null;
  } catch {
    return null;
  }
}

// Live founding-member count for the landing-page social-proof badge.
// Reads paid records (not waitlist signups) so the displayed number is
// always honest.
export interface FoundingCount {
  paid: number;
  cap: number;
  remaining: number;
  full: boolean;
}

export async function fetchFoundingCount(): Promise<FoundingCount | null> {
  try {
    const res = await fetch(`${API_BASE}/founding/count`);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<FoundingCount>;
    if (typeof data.paid !== "number" || typeof data.cap !== "number") return null;
    return {
      paid: data.paid,
      cap: data.cap,
      remaining: data.remaining ?? data.cap - data.paid,
      full: data.full ?? data.paid >= data.cap,
    };
  } catch {
    return null;
  }
}
