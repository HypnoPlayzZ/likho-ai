import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
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
  Mic,
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
const VOICE_URL = `${API_BASE}/voice`;
const WAITLIST_URL = `${API_BASE}/waitlist`;
const WAITLIST_COUNT_URL = `${API_BASE}/waitlist/count`;
const LICENSE_CHECK_URL = `${API_BASE}/license/check`;

// Voice mode (v0.3.0) — hard cap at 60s per clip. Whisper costs scale with
// duration; 60s covers any realistic single-shot voice memo and keeps the
// payload under the Worker's 8MB ceiling. UI surfaces an auto-stop toast
// if the user holds Alt+V past this.
const VOICE_MAX_DURATION_MS = 60_000;
const VOICE_TIMEOUT_MS = 60_000; // upload+polish hard ceiling

// Day 8: free-trial cap. Lifetime, not daily — so the localStorage key
// `likho_demo_used` is the source of truth across sessions.
const DEMO_CAP = 5;

// License cache TTL — re-verify against the worker once a day. Short enough
// that a cancelled subscription disables Pro features within 24h, long
// enough that we don't ping the worker on every Alt+Space.
const LICENSE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

// Audiences (v0.4.0) — hierarchy-aware tones. Each audience reframes
// what the three tones mean. Worker takes `audience` in the /rewrite
// body; client maps to friendlier labels per audience.
type Audience = "auto" | "senior" | "peer" | "junior";
const AUDIENCES: Audience[] = ["auto", "senior", "peer", "junior"];
const AUDIENCE_LABEL: Record<Audience, string> = {
  auto: "Auto",
  senior: "To Senior",
  peer: "To Peer",
  junior: "To Junior",
};
const AUDIENCE_DESCRIPTION: Record<Audience, string> = {
  auto: "Universal tones",
  senior: "Boss / client / external",
  peer: "Colleague / teammate",
  junior: "Direct report / vendor",
};

const TONE_META: Record<Tone, { Icon: LucideIcon }> = {
  professional: { Icon: Briefcase },
  concise: { Icon: Zap },
  friendly: { Icon: Smile },
};

// Tone labels adapt to audience. Same JSON keys from the worker, but the
// human label changes — "Professional" for an email to your manager
// reads as "Formal" because that's what it actually is.
const TONE_LABEL: Record<Audience, Record<Tone, string>> = {
  auto: { professional: "Professional", concise: "Concise", friendly: "Friendly" },
  senior: { professional: "Formal", concise: "Brief", friendly: "Polite" },
  peer: { professional: "Direct", concise: "Brief", friendly: "Casual" },
  junior: { professional: "Clear", concise: "Brief", friendly: "Encouraging" },
};

const getAudience = (): Audience => {
  const raw = localStorage.getItem("likho_audience");
  if (raw === "senior" || raw === "peer" || raw === "junior" || raw === "auto") {
    return raw;
  }
  return "auto";
};
const setAudienceLS = (a: Audience) => localStorage.setItem("likho_audience", a);

type RewriteMode = "rewrite" | "reply";

type Status =
  | { kind: "idle" }
  | { kind: "intro" }                                   // first ever Alt+Space
  | { kind: "gated" }                                   // 5/5 demo rewrites used
  | { kind: "signin" }                                  // tray-menu sign-in entry
  | { kind: "no_selection"; mode: RewriteMode }
  | { kind: "rewriting"; original: string }
  | { kind: "done"; original: string; rewrites: Rewrites }
  | { kind: "replaced" }
  | { kind: "copied" }                                  // tone copied to clipboard
  | { kind: "error"; original: string; message: string }
  // ---- Reply mode (v0.5.0) ----
  | { kind: "replying"; original: string }
  | { kind: "reply_done"; original: string; rewrites: Rewrites }
  // ---- Voice mode (v0.3.0) ----
  | { kind: "voice_recording"; startedAt: number }
  | { kind: "voice_polishing" }
  | { kind: "voice_done"; polished: string; transcript: string; rewrites: Rewrites }
  | { kind: "voice_gated"; reason: "free" | "pro" }     // not Pro+/founding
  | { kind: "voice_error"; message: string };

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

// License: cached on disk so we don't hit the worker on every Alt+Space.
// v0.3.0 adds the "pro_plus" tier and explicit per-feature entitlements
// (so the desktop client doesn't have to know which tier unlocks what).
type LicenseTier = "free" | "founding" | "pro" | "pro_plus";
interface LicenseEntitlements {
  unlimited_rewrites: boolean;
  voice_mode: boolean;
}
interface LicenseCacheEntry {
  email: string;
  tier: LicenseTier;
  valid: boolean;
  checkedAt: number;
  entitlements?: LicenseEntitlements;
}

const getLicense = (): LicenseCacheEntry | null => {
  try {
    const raw = localStorage.getItem("likho_license");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LicenseCacheEntry;
    if (typeof parsed.email !== "string" || typeof parsed.checkedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};
const setLicenseLS = (entry: LicenseCacheEntry) =>
  localStorage.setItem("likho_license", JSON.stringify(entry));

// True iff we have a fresh, paid license cached. Used to bypass the
// 5-rewrite demo cap.
const isPaidLicense = (entry: LicenseCacheEntry | null): boolean => {
  if (!entry || !entry.valid) return false;
  if (entry.tier === "free") return false;
  if (Date.now() - entry.checkedAt > LICENSE_CACHE_TTL_MS) return false;
  return true;
};

// True iff the cached license entitles the user to voice mode.
// Server is the source of truth; this is just the client-side fast path
// so we don't open the mic for users who'll be 403'd by /voice anyway.
const hasVoiceEntitlement = (entry: LicenseCacheEntry | null): boolean => {
  if (!entry || !entry.valid) return false;
  if (Date.now() - entry.checkedAt > LICENSE_CACHE_TTL_MS) return false;
  if (entry.entitlements?.voice_mode === true) return true;
  // Backwards-compat: pre-0.3.0 license entries don't have entitlements.
  // Founding members are grandfathered into voice mode at the tier level.
  if (entry.entitlements === undefined && entry.tier === "founding") return true;
  return false;
};

async function checkLicense(email: string): Promise<LicenseCacheEntry> {
  const cleaned = email.trim().toLowerCase();
  try {
    const res = await fetch(LICENSE_CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleaned }),
    });
    const data = await res.json().catch(() => ({}));
    const tier: LicenseTier =
      data.tier === "founding" || data.tier === "pro_plus" || data.tier === "pro"
        ? data.tier
        : "free";
    const entitlements: LicenseEntitlements | undefined =
      data.entitlements && typeof data.entitlements === "object"
        ? {
            unlimited_rewrites: !!data.entitlements.unlimited_rewrites,
            voice_mode: !!data.entitlements.voice_mode,
          }
        : undefined;
    return {
      email: cleaned,
      tier,
      valid: !!data.valid,
      checkedAt: Date.now(),
      entitlements,
    };
  } catch {
    return { email: cleaned, tier: "free", valid: false, checkedAt: Date.now() };
  }
}

function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showCounter, setShowCounter] = useState(0);
  const [demoUsed, setDemoUsed] = useState<number>(getDemoUsed);
  const [, setIntroSeen] = useState<boolean>(getIntroSeen);
  const [proModal, setProModal] = useState<ProModal>({ kind: "closed" });
  const [spotsLeft, setSpotsLeft] = useState<number>(FALLBACK_REMAINING);
  const [audience, setAudience] = useState<Audience>(getAudience);

  // Voice mode state held outside React state so the (un-rendered) hotkey
  // event handlers and timers can read/mutate without triggering re-renders.
  // - voiceActiveRef: true between voice:start (entitled) and voice:stop.
  //   Guards against stale Alt+V Released events (e.g. user releases Alt
  //   before V was even granted, or after gating, or after stop).
  // - voiceAutoStopRef: setTimeout id for the 60s hard ceiling.
  const voiceActiveRef = useRef(false);
  const voiceAutoStopRef = useRef<number | null>(null);

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
    type CapturedPayload = string | { text: string; mode?: string };

    const unlistenCapture = listen<CapturedPayload>("text-captured", async (event) => {
      // Backwards-compat: pre-0.5.0 emitted plain strings. v0.5.0+ emits
      // { text, mode }. Normalise both shapes.
      const raw = event.payload;
      const captured =
        typeof raw === "string" ? { text: raw, mode: "rewrite" as const } : raw;
      const mode: RewriteMode = captured.mode === "reply" ? "reply" : "rewrite";

      // Demo gates run BEFORE the rewrite/reply call:
      // 1. Never seen the intro? Show it (Alt+Space only — Alt+R skips
      //    the intro since it's a power-user feature).
      // 2. Used all 5 demo rewrites AND not a paid licensee? Show gated.
      // 3. Empty selection? Show the no_selection screen.
      if (mode === "rewrite" && !getIntroSeen()) {
        setStatus({ kind: "intro" });
        return;
      }
      const paid = isPaidLicense(getLicense());
      if (!paid && getDemoUsed() >= DEMO_CAP) {
        setStatus({ kind: "gated" });
        return;
      }

      const text = captured.text.trim();
      if (!text) {
        setStatus({ kind: "no_selection", mode });
        return;
      }

      // Read audience fresh each time so a mid-flow change is picked up.
      const audience = getAudience();
      if (mode === "reply") {
        setStatus({ kind: "replying", original: text });
        const result = await fetchRewrites(text, audience, "reply");
        setStatus((prev) =>
          prev.kind === "replying" && prev.original === text
            ? result.ok
              ? { kind: "reply_done", original: text, rewrites: result.rewrites }
              : { kind: "error", original: text, message: result.message }
            : prev,
        );
        if (result.ok && !paid) {
          const next = getDemoUsed() + 1;
          setDemoUsedLS(next);
          setDemoUsed(next);
        }
        return;
      }

      // mode === "rewrite" — original Alt+Space flow.
      setStatus({ kind: "rewriting", original: text });
      const result = await fetchRewrites(text, audience, "rewrite");
      setStatus((prev) =>
        prev.kind === "rewriting" && prev.original === text
          ? result.ok
            ? { kind: "done", original: text, rewrites: result.rewrites }
            : { kind: "error", original: text, message: result.message }
          : prev,
      );
      // Only count successful rewrites against the demo cap. Errors don't
      // burn a credit — fair to the user and avoids penalising network blips.
      if (result.ok && !paid) {
        const next = getDemoUsed() + 1;
        setDemoUsedLS(next);
        setDemoUsed(next);
      }
    });

    const unlistenHidden = listen("overlay-hidden", () => {
      // If overlay hides while voice is recording (e.g. user hit Esc),
      // tear down the cpal stream so we don't leak a hot mic. voice_cancel
      // stops the recorder and discards the buffer.
      if (voiceActiveRef.current) {
        voiceActiveRef.current = false;
        if (voiceAutoStopRef.current !== null) {
          window.clearTimeout(voiceAutoStopRef.current);
          voiceAutoStopRef.current = null;
        }
        invoke("voice_cancel").catch(() => {
          /* nothing useful to do */
        });
      }
      setStatus({ kind: "idle" });
      setProModal({ kind: "closed" });
    });

    const unlistenShown = listen("overlay-shown", () => {
      setShowCounter((n) => n + 1);
    });

    // Tray-menu sign-in: jump straight to the sign-in form without
    // requiring the user to first burn through 5 demo rewrites.
    const unlistenSignin = listen("tray:signin", () => {
      setStatus({ kind: "signin" });
    });

    // ---- Voice mode (Alt+V) ----
    // Pressed: client-side license gate, then start the cpal stream.
    // Released: stop the stream, upload the WAV, render the polished result.
    const unlistenVoiceStart = listen("voice:start", async () => {
      // Coalesce: if the user spam-presses Alt+V, ignore re-entries until
      // the current run finishes.
      if (voiceActiveRef.current) return;

      const license = getLicense();
      if (!hasVoiceEntitlement(license)) {
        // Show the upgrade screen. We don't open the mic at all — both
        // saves the cpal device cost and is the honest UX (no "this
        // doesn't do anything" silence).
        const reason: "free" | "pro" =
          license && license.tier === "pro" ? "pro" : "free";
        setStatus({ kind: "voice_gated", reason });
        return;
      }

      try {
        await invoke("voice_start");
      } catch (e) {
        // Most common failure: no input device, or mic permission denied
        // by Windows. Surface a friendly message instead of silently
        // staying at "Recording..." forever.
        console.error("voice_start failed", e);
        setStatus({
          kind: "voice_error",
          message: micErrorMessage(String(e)),
        });
        return;
      }

      voiceActiveRef.current = true;
      const startedAt = Date.now();
      setStatus({ kind: "voice_recording", startedAt });

      // 60s hard auto-stop. The Rust audio buffer also caps itself at 90s
      // as a safety net in case this timer is missed (e.g. heavy GC pause).
      if (voiceAutoStopRef.current !== null) {
        window.clearTimeout(voiceAutoStopRef.current);
      }
      voiceAutoStopRef.current = window.setTimeout(() => {
        // Only auto-stop if we're still recording — user may have released
        // Alt+V already and we'd be in polishing already.
        if (voiceActiveRef.current) {
          void finishVoice("auto");
        }
      }, VOICE_MAX_DURATION_MS);
    });

    const unlistenVoiceStop = listen("voice:stop", () => {
      // User released Alt+V. Only meaningful if we actually started a
      // recording (i.e. they were entitled). If they were gated, the
      // hotkey released arrives but we ignore it.
      if (!voiceActiveRef.current) return;
      void finishVoice("user");
    });

    return () => {
      unlistenCapture.then((fn) => fn());
      unlistenHidden.then((fn) => fn());
      unlistenShown.then((fn) => fn());
      unlistenSignin.then((fn) => fn());
      unlistenVoiceStart.then((fn) => fn());
      unlistenVoiceStop.then((fn) => fn());
    };
  }, []);

  // Voice-mode finish path. Pulled out so the user-release event and the
  // 60s auto-stop both flow through the same code. `reason` is just for
  // future analytics — both end up in the same UI states.
  const finishVoice = async (_reason: "user" | "auto") => {
    if (voiceAutoStopRef.current !== null) {
      window.clearTimeout(voiceAutoStopRef.current);
      voiceAutoStopRef.current = null;
    }
    voiceActiveRef.current = false;

    setStatus({ kind: "voice_polishing" });

    let wavBytes: number[];
    try {
      // Tauri serialises Vec<u8> as a number[] on the JS side. We rebuild
      // a Uint8Array on receipt and wrap as a Blob for upload.
      wavBytes = await invoke<number[]>("voice_stop");
    } catch (e) {
      console.error("voice_stop failed", e);
      setStatus({
        kind: "voice_error",
        message: "Couldn't capture the recording. Please try again.",
      });
      return;
    }

    if (!wavBytes || wavBytes.length < 44) {
      // 44 = WAV header alone. Anything that small means we got nothing.
      setStatus({
        kind: "voice_error",
        message: "I didn't catch anything. Try speaking a bit louder, or try again.",
      });
      return;
    }

    const license = getLicense();
    if (!license || !license.email) {
      // Should be unreachable — entitlement check passed earlier — but
      // defend against the cache being cleared mid-recording.
      setStatus({
        kind: "voice_error",
        message: "Sign in again to use voice mode.",
      });
      return;
    }

    const result = await uploadVoice(wavBytes, license.email);
    if (!result.ok) {
      if (result.kind === "gated") {
        // Server says no — license cache may be stale. Force a re-check
        // next time the user signs in by clearing the cached entitlement.
        setStatus({ kind: "voice_gated", reason: "pro" });
        return;
      }
      setStatus({ kind: "voice_error", message: result.message });
      return;
    }

    // Got the polished text. Now run it through /rewrite to get 3 tones,
    // same as the Alt+Space flow. Reuses Gemini quota; cheap.
    const rewriteResult = await fetchRewrites(result.polished, getAudience());
    if (!rewriteResult.ok) {
      // Polish succeeded but tone generation failed. Show the polished
      // text on its own as a single tone — still useful to the user.
      setStatus({
        kind: "voice_done",
        polished: result.polished,
        transcript: result.transcript,
        rewrites: {
          professional: result.polished,
          concise: result.polished,
          friendly: result.polished,
          detected_language: "english",
        },
      });
      return;
    }

    setStatus({
      kind: "voice_done",
      polished: result.polished,
      transcript: result.transcript,
      rewrites: rewriteResult.rewrites,
    });
  };

  // Audience changed — persist the choice and, if we already have a
  // rewrite on screen, re-roll the tones so the user sees the effect
  // immediately. If we're not on a "done" screen, it just affects the
  // next Alt+Space.
  const onAudienceChange = (next: Audience) => {
    setAudience(next);
    setAudienceLS(next);
    setStatus((prev) => {
      if (prev.kind === "done") {
        const text = prev.original;
        void (async () => {
          setStatus({ kind: "rewriting", original: text });
          const result = await fetchRewrites(text, next, "rewrite");
          setStatus((current) =>
            current.kind === "rewriting" && current.original === text
              ? result.ok
                ? { kind: "done", original: text, rewrites: result.rewrites }
                : { kind: "error", original: text, message: result.message }
              : current,
          );
        })();
        return { kind: "rewriting", original: text };
      }
      if (prev.kind === "reply_done") {
        // Re-roll the reply for the new audience.
        const text = prev.original;
        void (async () => {
          setStatus({ kind: "replying", original: text });
          const result = await fetchRewrites(text, next, "reply");
          setStatus((current) =>
            current.kind === "replying" && current.original === text
              ? result.ok
                ? { kind: "reply_done", original: text, rewrites: result.rewrites }
                : { kind: "error", original: text, message: result.message }
              : current,
          );
        })();
        return { kind: "replying", original: text };
      }
      if (prev.kind === "voice_done") {
        const polished = prev.polished;
        const transcript = prev.transcript;
        void (async () => {
          setStatus({ kind: "voice_polishing" });
          const result = await fetchRewrites(polished, next, "rewrite");
          if (result.ok) {
            setStatus({
              kind: "voice_done",
              polished,
              transcript,
              rewrites: result.rewrites,
            });
          } else {
            setStatus({
              kind: "voice_error",
              message: result.message,
            });
          }
        })();
        return { kind: "voice_polishing" };
      }
      return prev;
    });
  };

  // Click a tone in voice_done — copy to clipboard and toast. Voice mode
  // doesn't have a captured selection to replace, so we fall back to
  // clipboard + an explicit "now paste" hint.
  const onCopyTone = async (text: string) => {
    try {
      await writeText(text);
    } catch (e) {
      console.error("clipboard write failed", e);
    }
    setStatus({ kind: "copied" });
    const appWindow = getCurrentWindow();
    window.setTimeout(() => {
      void appWindow.hide();
    }, 1100);
  };

  // Esc handler + tone shortcut keys (1/2/3 to pick a tone in done state).
  // Reading status from a ref-style `setStatus` getter would be ideal, but
  // the cheap path is to subscribe both to status and proModal in the dep
  // array — the listener gets recreated on each transition (rare events).
  useEffect(() => {
    const appWindow = getCurrentWindow();
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keystrokes when the user is typing in an input
      // (sign-in form, waitlist email field, etc).
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        if (proModal.kind !== "closed") {
          setProModal({ kind: "closed" });
        } else {
          appWindow.hide();
        }
        return;
      }

      if (isTyping) return;

      // Number-key tone picker — meaningful in done, reply_done, and
      // voice_done. done replaces selection; reply_done and voice_done
      // copy to clipboard (no original selection to overwrite).
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        const idx = parseInt(e.key, 10) - 1;
        const tone = TONES[idx];
        if (status.kind === "done") {
          e.preventDefault();
          void onPick(status.rewrites[tone]);
        } else if (status.kind === "reply_done" || status.kind === "voice_done") {
          e.preventDefault();
          void onCopyTone(status.rewrites[tone]);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proModal.kind, status.kind]);

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
      // The paste invoke can fail if focus didn't transfer back to the
      // source app cleanly, or if clipboard is locked. The rewrite text
      // is still on the clipboard so the user can paste manually — tell
      // them that instead of leaving them at the "done" screen wondering
      // why nothing happened.
      console.error("replace_selection failed", e);
      setStatus((prev) =>
        prev.kind === "done"
          ? {
              kind: "error",
              original: prev.original,
              message:
                "Couldn't paste automatically. The text is on your clipboard — paste with Ctrl+V.",
            }
          : prev,
      );
    }
  };

  const onIntroDismiss = () => {
    setIntroSeenLS();
    setIntroSeen(true);
    // Drop straight into the empty/instruction state — they'll Alt+Space again
    // with text selected. Keeping the overlay visible feels welcoming.
    setStatus({ kind: "no_selection", mode: "rewrite" });
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
    <div key={showCounter} className="h-full w-full p-2 flex animate-overlay-in font-sans">
      <div className="flex-1 flex flex-col rounded-xl overflow-hidden glass-blur bg-surface-container-low/90 border border-outline-variant shadow-[0_4px_24px_rgba(0,0,0,0.4)] relative">
        {/* Subtle top edge highlight — keeps the card readable on bright
            wallpapers without the heavy halo we used in v0.5.x. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary/[0.04] to-transparent" />
        <div className="relative flex-1 flex flex-col p-4 min-h-0">
          {proModal.kind !== "closed"
            ? renderProModal(proModal, spotsLeft, submitWaitlist, () =>
                setProModal({ kind: "closed" }),
              )
            : renderStatus(status, {
                onPick,
                onCopyTone,
                onIntroDismiss,
                onSignUp,
                onAudienceChange,
                audience,
                openProModal: () => setProModal({ kind: "form" }),
                onSignedIn: (entry) => {
                  // Persist the license, dismiss the gated/signin screen,
                  // and drop the user into the empty/instruction state so
                  // they Alt+Space again with text selected.
                  setLicenseLS(entry);
                  setStatus({ kind: "no_selection", mode: "rewrite" });
                },
                onSignInCancel: () => {
                  // Tray-menu sign-in cancel: hide the overlay so we
                  // don't leave them staring at it. Esc also works.
                  void getCurrentWindow().hide();
                },
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
    case "replying":
    case "reply_done":
    case "replaced":
    case "copied":
    case "intro":
    case "signin":
    case "voice_recording":
    case "voice_polishing":
    case "voice_done":
    case "voice_gated":
    case "voice_error":
      return false;
    default:
      return true;
  }
}

interface MainHandlers {
  onPick: (text: string) => void;
  onCopyTone: (text: string) => void;
  onIntroDismiss: () => void;
  onSignUp: () => void;
  openProModal: () => void;
  onSignedIn: (entry: LicenseCacheEntry) => void;
  onSignInCancel: () => void;
  onAudienceChange: (a: Audience) => void;
  audience: Audience;
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
      return (
        <GatedScreen
          onSignUp={h.onSignUp}
          onReserve={h.openProModal}
          onSignedIn={h.onSignedIn}
        />
      );

    case "signin":
      return (
        <SignInForm
          onSignedIn={h.onSignedIn}
          onCancel={h.onSignInCancel}
          cancelLabel="← cancel"
        />
      );

    case "no_selection": {
      const isReply = s.mode === "reply";
      return (
        <CenterMessage>
          <div className="w-10 h-10 rounded-full bg-likho-orange/15 border border-likho-orange/40 flex items-center justify-center mb-3 shadow-[0_0_24px_rgba(249,115,22,0.45)]">
            <MousePointer2 className="w-5 h-5 text-likho-orange" strokeWidth={1.5} />
          </div>
          <p className="text-base text-likho-orange font-semibold">
            {isReply
              ? "Select the email to reply to"
              : "Select some text first"}
          </p>
          <p className="text-xs text-white/70 mt-1">
            then press <KeyHint>Alt</KeyHint>
            <span className="mx-1 text-likho-orange/70">+</span>
            <KeyHint>{isReply ? "R" : "Space"}</KeyHint>
          </p>
          <DemoCounter used={h.demoUsed} />
        </CenterMessage>
      );
    }

    case "rewriting":
      return (
        <>
          <Header original={s.original} />
          <AudienceBar audience={h.audience} onChange={h.onAudienceChange} disabled />
          <div className="flex-1 min-h-0 space-y-1.5 overflow-hidden">
            {TONES.map((tone) => (
              <SkeletonToneCard key={tone} tone={tone} audience={h.audience} />
            ))}
          </div>
          <Footer />
        </>
      );

    case "done":
      return (
        <>
          <Header original={s.original} lang={s.rewrites.detected_language} />
          <AudienceBar audience={h.audience} onChange={h.onAudienceChange} />
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-1.5">
            {TONES.map((tone, idx) => (
              <ToneCard
                key={tone}
                tone={tone}
                text={s.rewrites[tone]}
                shortcutNumber={idx + 1}
                audience={h.audience}
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

    // ---- Reply mode (v0.5.0) ----
    case "replying":
      return (
        <>
          <ReplyHeader original={s.original} />
          <AudienceBar audience={h.audience} onChange={h.onAudienceChange} disabled />
          <div className="flex-1 min-h-0 space-y-1.5 overflow-hidden">
            {TONES.map((tone) => (
              <SkeletonToneCard key={tone} tone={tone} audience={h.audience} />
            ))}
          </div>
          <Footer />
        </>
      );

    case "reply_done":
      return (
        <>
          <ReplyHeader original={s.original} />
          <AudienceBar audience={h.audience} onChange={h.onAudienceChange} />
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-1.5">
            {TONES.map((tone, idx) => (
              <ToneCard
                key={tone}
                tone={tone}
                text={s.rewrites[tone]}
                shortcutNumber={idx + 1}
                audience={h.audience}
                onClick={() => h.onCopyTone(s.rewrites[tone])}
              />
            ))}
          </div>
          <ReplyDoneFooter />
        </>
      );

    // ---- Voice mode (v0.3.0) ----
    case "voice_recording":
      return <VoiceRecordingScreen startedAt={s.startedAt} />;

    case "voice_polishing":
      return <VoicePolishingScreen />;

    case "voice_done":
      return (
        <>
          <VoiceHeader transcript={s.transcript} lang={s.rewrites.detected_language} />
          <AudienceBar audience={h.audience} onChange={h.onAudienceChange} />
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-1.5">
            {TONES.map((tone, idx) => (
              <ToneCard
                key={tone}
                tone={tone}
                text={s.rewrites[tone]}
                shortcutNumber={idx + 1}
                audience={h.audience}
                onClick={() => h.onCopyTone(s.rewrites[tone])}
              />
            ))}
          </div>
          <VoiceDoneFooter />
        </>
      );

    case "copied":
      return (
        <CenterMessage>
          <div className="w-12 h-12 rounded-full bg-emerald-400/15 border border-emerald-400/40 flex items-center justify-center mb-3 animate-overlay-in">
            <Check className="w-6 h-6 text-emerald-300" strokeWidth={2.5} />
          </div>
          <p className="text-base text-white font-medium">Copied</p>
          <p className="text-xs text-white/60 mt-1">Paste with Ctrl+V in your app</p>
        </CenterMessage>
      );

    case "voice_gated":
      return <VoiceGatedScreen reason={s.reason} />;

    case "voice_error":
      return (
        <CenterMessage>
          <div className="w-10 h-10 rounded-full bg-likho-coral/15 border border-likho-coral/40 flex items-center justify-center mb-3">
            <Mic className="w-5 h-5 text-likho-coral" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-likho-coral max-w-[320px] leading-snug">{s.message}</p>
          <p className="text-[11px] text-white/40 mt-3">Press Esc to close · Hold Alt+V to try again</p>
        </CenterMessage>
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
        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary-container text-on-primary-container text-sm font-bold tracking-wide hover:brightness-110 active:scale-[0.98] transition-all"
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

// Reusable sign-in form. Used by GatedScreen ("after demo cap") and the
// SignInScreen (tray-menu entry). onCancel is what to do when the user
// hits "back" — for the gated path it goes back to tier options, for the
// tray path it closes the overlay.
function SignInForm({
  onSignedIn,
  onCancel,
  cancelLabel,
}: {
  onSignedIn: (entry: LicenseCacheEntry) => void;
  onCancel: () => void;
  cancelLabel: string;
}) {
  type Mode =
    | { kind: "input"; email: string }
    | { kind: "checking"; email: string }
    | { kind: "error"; email: string; message: string };
  const [mode, setMode] = useState<Mode>({ kind: "input", email: "" });

  const onSubmit = async (email: string) => {
    setMode({ kind: "checking", email });
    const license = await checkLicense(email);
    if (license.valid && license.tier !== "free") {
      setLicenseLS(license);
      onSignedIn(license);
      return;
    }
    setMode({
      kind: "error",
      email,
      message:
        "We couldn't find a paid account for that email. Check the spelling — or pay below to become a Founding member.",
    });
  };

  const checking = mode.kind === "checking";
  return (
    <div className="flex-1 flex flex-col text-center px-1">
      <div className="flex flex-col items-center pt-1">
        <div className="w-10 h-10 rounded-full bg-likho-orange/15 border border-likho-orange/40 flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(249,115,22,0.4)]">
          <Sparkles className="w-5 h-5 text-likho-orange" strokeWidth={1.75} />
        </div>
        <h2 className="text-base text-white font-semibold">Welcome back</h2>
        <p className="text-xs text-white/65 mt-1 max-w-[320px]">
          Enter the email you used when paying.
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-2 mt-3">
        <input
          type="email"
          autoFocus
          disabled={checking}
          value={mode.email}
          onChange={(e) => setMode({ kind: "input", email: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !checking) onSubmit(mode.email);
          }}
          placeholder="you@example.com"
          className="w-full rounded-full px-4 py-2 bg-white/10 border border-white/25 text-sm text-white placeholder:text-white/40 focus:bg-white/15 focus:border-likho-orange/60 focus:outline-none focus:ring-2 focus:ring-likho-orange/30 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => onSubmit(mode.email)}
          disabled={checking || !mode.email.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-primary-container text-on-primary-container text-sm font-bold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {checking ? "Checking…" : "Sign in"}
        </button>
        {mode.kind === "error" && (
          <p className="text-[11px] text-likho-coral/90 px-1">{mode.message}</p>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-white/55 hover:text-white/85 mt-1"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

function GatedScreen({
  onSignUp,
  onReserve,
  onSignedIn,
}: {
  onSignUp: () => void;
  onReserve: () => void;
  onSignedIn: (entry: LicenseCacheEntry) => void;
}) {
  const [mode, setMode] = useState<"options" | "signin">("options");

  if (mode === "signin") {
    return (
      <SignInForm
        onSignedIn={onSignedIn}
        onCancel={() => setMode("options")}
        cancelLabel="← back"
      />
    );
  }

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

        <button
          type="button"
          onClick={() => setMode("signin")}
          className="text-[11px] text-white/60 hover:text-white/90 mt-1.5 underline-offset-2 hover:underline"
        >
          Already a Founding or Pro member? Sign in
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
        <h2 className="text-lg font-bold leading-tight">Reserve your spot</h2>
        <p className="text-xs text-white/70 mt-1.5 leading-relaxed">
          Unlimited rewrites · Voice mode (Alt+V) · Long-email summary · Custom tones · Outlook plugin.
        </p>
        <p className="text-xs text-white/85 mt-2">
          Pro ₹299/mo · <span className="text-likho-orange">Pro+ ₹499/mo</span> (voice mode) · save 30% annually.
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
          ₹4,900 lifetime — voice mode included, never charged again.
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
          className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-[12px] bg-primary-container text-on-primary-container text-sm font-bold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
      className="absolute bottom-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-secondary-container/20 border border-secondary/40 text-secondary text-[10px] font-bold uppercase tracking-wider hover:bg-secondary-container/30 hover:scale-[1.03] active:scale-[0.97] transition-all"
      title="Likho Pro is launching soon"
    >
      <Sparkles className="w-3 h-3" strokeWidth={2.5} />
      Pro
    </button>
  );
}

// ---------- Demo counter ----------

// Demo counter — positive framing, only shown when 2 or fewer rewrites
// remain. Avoids "you've used 1 of 5" anxiety on every single rewrite,
// while still warning users they're approaching the cap.
function DemoCounter({ used }: { used: number }) {
  const remaining = DEMO_CAP - used;
  if (remaining > 2 || remaining < 0) return null;
  const message =
    remaining === 0
      ? "No demo rewrites left"
      : remaining === 1
        ? "1 demo rewrite left"
        : `${remaining} demo rewrites left`;
  return (
    <div
      className={[
        "mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] border",
        remaining === 0
          ? "bg-likho-coral/15 border-likho-coral/40 text-likho-coral"
          : remaining === 1
            ? "bg-likho-orange/15 border-likho-orange/40 text-likho-orange"
            : "bg-white/5 border-white/15 text-white/65",
      ].join(" ")}
    >
      <span>{message}</span>
    </div>
  );
}

function FooterWithDemo({ demoUsed }: { demoUsed: number }) {
  const remaining = DEMO_CAP - demoUsed;
  const showWarning = remaining <= 2 && remaining >= 0;
  const warning =
    remaining === 0
      ? "No demo rewrites left"
      : remaining === 1
        ? "1 demo rewrite left"
        : `${remaining} demo rewrites left`;
  return (
    <div className="mt-2 pt-2 border-t border-outline-variant flex items-center justify-between text-[10px] text-outline gap-2">
      <span
        className={[
          "truncate",
          showWarning && remaining === 0
            ? "text-error font-medium"
            : showWarning
              ? "text-tertiary font-medium"
              : "",
        ].join(" ")}
      >
        {showWarning ? warning : "Click a tone or press 1 / 2 / 3"}
      </span>
      <KeyHint>Esc</KeyHint>
    </div>
  );
}

// ---------- Shared building blocks (unchanged from Day 7) ----------

function Header({ original, lang }: { original: string; lang?: DetectedLanguage }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={2} />
        <span className="text-[13px] font-semibold text-on-surface tracking-tight">
          Rewrite Selection
        </span>
        {lang && lang !== "english" && (
          <div className="ml-auto"><LanguageBadge lang={lang} /></div>
        )}
      </div>
      <div className="rounded-lg bg-surface-container-lowest/60 border border-outline-variant px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-outline mb-1">
          Original Text
        </div>
        <p className="text-[13px] text-on-surface-variant leading-relaxed line-clamp-2" title={original}>
          {original}
        </p>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-2 pt-2 border-t border-outline-variant flex items-center justify-between text-[10px] text-outline">
      <span>Click a tone or press 1 / 2 / 3</span>
      <KeyHint>Esc</KeyHint>
    </div>
  );
}

function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wide bg-surface-variant border border-outline-variant text-on-surface-variant">
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
  audience,
  shortcutNumber,
  onClick,
}: {
  tone: Tone;
  text: string;
  audience: Audience;
  shortcutNumber: number;
  onClick: () => void;
}) {
  const { Icon } = TONE_META[tone];
  const label = TONE_LABEL[audience][tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block w-full text-left rounded-lg p-3 bg-surface-container-high/80 border border-outline-variant hover:border-primary/50 focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/25 hover:bg-surface-container-high transition-all duration-200 ease-out"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon
          className="w-3.5 h-3.5 text-on-surface-variant group-hover:text-primary shrink-0 transition-colors"
          strokeWidth={2}
        />
        <span className="text-[10px] uppercase tracking-[0.05em] font-semibold text-on-surface-variant group-hover:text-primary transition-colors">
          {label}
        </span>
        <div className="ml-auto opacity-70 group-hover:opacity-100 transition-opacity">
          <ToneShortcutHint number={shortcutNumber} />
        </div>
      </div>
      <p className="text-[13px] text-on-surface leading-relaxed whitespace-pre-wrap break-words">
        {text}
      </p>
    </button>
  );
}

function ToneShortcutHint({ number }: { number: number }) {
  return (
    <kbd className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] text-[9px] font-mono font-semibold bg-surface-variant border border-outline-variant text-on-surface-variant">
      {number}
    </kbd>
  );
}

function SkeletonToneCard({ tone, audience }: { tone: Tone; audience: Audience }) {
  const { Icon } = TONE_META[tone];
  const label = TONE_LABEL[audience][tone];
  return (
    <div className="block w-full rounded-lg p-3 bg-surface-container-high/40 border border-outline-variant">
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className="w-3.5 h-3.5 text-on-surface-variant/50 shrink-0"
          strokeWidth={2}
        />
        <span className="text-[10px] uppercase tracking-[0.05em] font-semibold text-on-surface-variant/50">
          {label}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 rounded shimmer w-[92%]" />
        <div className="h-2.5 rounded shimmer w-[68%]" />
      </div>
    </div>
  );
}

// Audience selector — M3 segmented tab control. All four audiences
// always visible in a single pill row.
function AudienceBar({
  audience,
  onChange,
  disabled = false,
}: {
  audience: Audience;
  onChange: (a: Audience) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-[0.05em] font-semibold text-outline mb-1.5">
        Audience
      </div>
      <div className="flex bg-surface-container-highest rounded-lg p-1 gap-1">
        {AUDIENCES.map((a) => {
          const active = a === audience;
          return (
            <button
              key={a}
              type="button"
              disabled={disabled}
              onClick={() => onChange(a)}
              title={AUDIENCE_DESCRIPTION[a]}
              className={[
                "flex-1 py-1 text-[11px] font-semibold rounded transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed",
                active
                  ? "bg-primary-container text-on-primary-container shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-variant",
              ].join(" ")}
            >
              {AUDIENCE_LABEL[a]}
            </button>
          );
        })}
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
      className="shrink-0 flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-secondary-container/20 border border-secondary/40 text-secondary"
      title={lang === "hinglish" ? "Detected: Hinglish" : "Detected: mixed Hindi + English"}
    >
      <Languages className="w-3 h-3" strokeWidth={2.25} />
      {label}
    </span>
  );
}

// ---------- Voice mode screens (v0.3.0) ----------

function VoiceRecordingScreen({ startedAt }: { startedAt: number }) {
  // Live elapsed timer. Updated 10x/s for smooth tenths display so the
  // user has continuous feedback that recording is actually live.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Math.min(VOICE_MAX_DURATION_MS, Date.now() - startedAt));
    }, 100);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const seconds = Math.floor(elapsed / 1000);
  const tenths = Math.floor((elapsed % 1000) / 100);
  const remaining = Math.max(0, Math.ceil((VOICE_MAX_DURATION_MS - elapsed) / 1000));
  const nearLimit = remaining <= 10;

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
      {/* Pulsing red dot — outer ping ring + steady inner dot. The ping
          gives "I'm doing something" without distracting from the timer. */}
      <div className="relative mb-3">
        <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping" />
        <span className="relative block w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.8)]" />
      </div>

      <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-red-400">
        Recording
      </p>
      <p className="text-3xl text-white font-mono font-semibold tabular-nums mt-2">
        {seconds}.{tenths}s
      </p>
      <p className="text-xs text-white/65 mt-2 max-w-[300px]">
        Release <KeyHint>Alt</KeyHint>
        <span className="mx-1 text-white/40">+</span>
        <KeyHint>V</KeyHint> when done
      </p>
      {nearLimit && (
        <p className="text-[11px] text-amber-300 mt-2 animate-pulse">
          Auto-stops in {remaining}s
        </p>
      )}
    </div>
  );
}

function VoicePolishingScreen() {
  return (
    <CenterMessage>
      <div className="relative mb-3">
        <span className="absolute inset-0 rounded-full bg-likho-orange/30 animate-ping" />
        <div className="relative w-10 h-10 rounded-full bg-likho-orange/20 border border-likho-orange/50 flex items-center justify-center shadow-[0_0_24px_rgba(249,115,22,0.5)]">
          <Sparkles className="w-5 h-5 text-likho-orange" strokeWidth={2} />
        </div>
      </div>
      <p className="text-base text-white font-medium">Polishing…</p>
      <p className="text-xs text-white/60 mt-1.5 max-w-[280px]">
        Translating, cleaning fillers, picking 3 tones.
      </p>
    </CenterMessage>
  );
}

// Reply mode header — distinguishes from the rewrite header. "REPLYING TO"
// label + truncated original message preview + lang badge.
function ReplyHeader({ original }: { original: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0 -rotate-180" strokeWidth={2} />
        <span className="text-[13px] font-semibold text-on-surface tracking-tight">
          Reply Drafts
        </span>
      </div>
      <div className="rounded-lg bg-surface-container-lowest/60 border border-outline-variant px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-outline mb-1">
          Replying To
        </div>
        <p className="text-[13px] text-on-surface-variant leading-relaxed line-clamp-2" title={original}>
          {original}
        </p>
      </div>
    </div>
  );
}

function ReplyDoneFooter() {
  return (
    <div className="mt-2 pt-2 border-t border-outline-variant flex items-center justify-between text-[10px] text-outline gap-2">
      <span className="truncate">Click a tone to copy · Paste in your reply box</span>
      <KeyHint>Esc</KeyHint>
    </div>
  );
}

function VoiceHeader({
  transcript,
  lang,
}: {
  transcript: string;
  lang?: DetectedLanguage;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <Mic className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={2} />
        <span className="text-[13px] font-semibold text-on-surface tracking-tight">
          Voice Polish
        </span>
        {lang && lang !== "english" && (
          <div className="ml-auto"><LanguageBadge lang={lang} /></div>
        )}
      </div>
      <div className="rounded-lg bg-surface-container-lowest/60 border border-outline-variant px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-outline mb-1">
          What you said
        </div>
        <p className="text-[13px] text-on-surface-variant leading-relaxed line-clamp-2" title={transcript}>
          {transcript}
        </p>
      </div>
    </div>
  );
}

function VoiceDoneFooter() {
  return (
    <div className="mt-2 pt-2 border-t border-outline-variant flex items-center justify-between text-[10px] text-outline gap-2">
      <span className="truncate">Click a tone to copy · Paste with Ctrl+V</span>
      <KeyHint>Esc</KeyHint>
    </div>
  );
}

function VoiceGatedScreen({ reason }: { reason: "free" | "pro" }) {
  // Different copy based on whether the user is a free user or a Pro
  // subscriber. The Pro user has already paid us — they need a soft
  // upsell to Pro+; the free user needs the full pitch.
  const onUpgrade = () => {
    // Open the marketing site's pricing anchor — the Razorpay flow
    // for Pro+ lives there. Same pattern the gated-screen sign-up
    // CTA uses (window.open + _blank routes via WebView2).
    window.open("https://likho.ai/#pricing", "_blank");
  };

  return (
    <div className="flex-1 flex flex-col text-center px-1">
      <div className="flex flex-col items-center pt-1">
        <div className="w-12 h-12 rounded-full bg-likho-orange/15 border border-likho-orange/40 flex items-center justify-center mb-2 shadow-[0_0_24px_rgba(249,115,22,0.45)]">
          <Mic className="w-6 h-6 text-likho-orange" strokeWidth={1.75} />
        </div>
        <h2 className="text-base text-white font-semibold">
          {reason === "pro" ? "Voice mode is Pro+ only" : "Voice mode is part of Likho Pro+"}
        </h2>
        <p className="text-xs text-white/70 mt-1.5 max-w-[320px] leading-snug">
          Speak in Hindi or English, get polished business English in ~3 seconds.
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-1.5 mt-3">
        <div className="rounded-[16px] p-2.5 bg-likho-orange/10 border border-likho-orange/40">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-likho-orange">
              Pro+
            </span>
            <span className="text-[10px] text-white/65">₹499/mo · save 30% annually</span>
          </div>
          <p className="text-sm text-white">Voice mode + everything in Pro.</p>
        </div>

        <div className="rounded-[16px] p-2.5 bg-white/[0.04] border border-white/15">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Sparkles className="w-3 h-3 text-likho-orange" strokeWidth={2.5} />
            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-likho-orange">
              Founding member
            </span>
          </div>
          <p className="text-sm text-white">₹4,900 lifetime — voice mode included.</p>
          <p className="text-[11px] text-white/65 mt-0.5">Capped at 50 spots ever.</p>
        </div>

        <button
          type="button"
          onClick={onUpgrade}
          className="mt-1.5 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-primary-container text-on-primary-container text-sm font-bold hover:brightness-110 active:scale-[0.98] transition-all"
        >
          Upgrade
          <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
        </button>
        <p className="text-[10px] text-white/45">Press Esc to close</p>
      </div>
    </div>
  );
}

// ---------- API ----------

type RewriteResult =
  | { ok: true; rewrites: Rewrites }
  | { ok: false; message: string };

async function fetchRewrites(
  text: string,
  audience: Audience = "auto",
  mode: RewriteMode = "rewrite",
): Promise<RewriteResult> {
  // 12-second hard ceiling. Gemini Flash typically replies in 2-3s; anything
  // past 10s is almost certainly a hung Worker or network. Surfacing a
  // timeout is much better UX than an indefinite skeleton loader.
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, audience, mode }),
      signal: controller.signal,
    });
    if (res.status === 429) {
      return {
        ok: false,
        message:
          "Daily rewrite limit reached. The limit resets each day at midnight UTC.",
      };
    }
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
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return {
        ok: false,
        message: "AI took too long to respond. Please try again.",
      };
    }
    return {
      ok: false,
      message: "Looks like the AI service can't be reached. Check your connection.",
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// ---------- Voice mode API + error mapping ----------

type VoiceUploadResult =
  | { ok: true; transcript: string; polished: string }
  | { ok: false; kind: "gated" }
  | { ok: false; kind: "error"; message: string };

async function uploadVoice(
  wavBytes: number[],
  email: string,
): Promise<VoiceUploadResult> {
  // v0.3.1: send as JSON+base64 instead of multipart. WebView2 inside
  // Tauri 2 silently drops multipart/form-data uploads with a Blob body
  // — the request never leaves the OS network stack and fetch throws
  // a generic NetworkError. JSON requests work cleanly. Worker accepts
  // both shapes for backwards compatibility.
  const audioBytes = new Uint8Array(wavBytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < audioBytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(audioBytes.subarray(i, i + chunkSize)),
    );
  }
  const audioB64 = btoa(binary);

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);
  try {
    const res = await fetch(VOICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, audio_b64: audioB64 }),
      signal: controller.signal,
    });
    if (res.status === 403) {
      return { ok: false, kind: "gated" };
    }
    if (res.status === 422) {
      return {
        ok: false,
        kind: "error",
        message: "I didn't catch anything. Try speaking a bit louder, or try again.",
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        kind: "error",
        message: "Daily voice limit reached. Resets at midnight UTC.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        kind: "error",
        message: "Voice service is having a moment — please try again.",
      };
    }
    const data = (await res.json()) as {
      transcript?: string;
      polished?: string;
    };
    if (!data.polished || !data.transcript) {
      return {
        ok: false,
        kind: "error",
        message: "Got a partial reply — please try again.",
      };
    }
    return { ok: true, transcript: data.transcript, polished: data.polished };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return {
        ok: false,
        kind: "error",
        message: "Voice took too long to process. Please try again.",
      };
    }
    return {
      ok: false,
      kind: "error",
      message: "Couldn't reach the AI service. Check your internet and try again.",
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// Map a raw cpal/audio error string into a user-readable message.
// cpal returns platform-specific error text — we look for known
// substrings instead of trying to enumerate every variant.
function micErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("no_input_device")) {
    return "I couldn't find a microphone. Plug one in or check Windows sound settings.";
  }
  if (lower.includes("permission") || lower.includes("denied") || lower.includes("access")) {
    return "Likho needs microphone access. Open Windows Settings → Privacy → Microphone and enable it for Likho.";
  }
  if (lower.includes("already_recording")) {
    return "Already recording — release Alt+V first.";
  }
  return "Couldn't open the microphone. Please try again.";
}

export default App;
