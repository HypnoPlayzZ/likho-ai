"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { fetchFoundingCount, type FoundingCount } from "@/lib/api";

// Live "X of 50 spots left" badge that fetches from the worker on mount.
// Renders nothing while loading (avoids a layout flash); falls back to a
// neutral copy line if the worker is unreachable. Visitors get honest social
// proof — every successful founding payment increments paid by one.

export function FoundingSpotsBadge() {
  const [count, setCount] = useState<FoundingCount | null>(null);
  useEffect(() => {
    void fetchFoundingCount().then(setCount);
  }, []);

  if (!count) {
    return (
      <p className="text-sm text-on-surface-variant mb-5">
        50 spots total. After they're gone, the only path in is ₹299/month from launch.
      </p>
    );
  }

  if (count.full) {
    return (
      <div className="mb-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-error/15 border border-error/40 text-xs font-semibold text-error">
        <X className="w-3 h-3" strokeWidth={2.5} />
        All 50 founding spots are taken — try Pro at ₹299/mo
      </div>
    );
  }

  // The "almost gone" framing only kicks in when fewer than 10 spots
  // remain — earlier than that it feels manufactured.
  const almostGone = count.remaining <= 10;
  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/40 text-xs font-bold text-secondary">
        <Sparkles className="w-3 h-3" strokeWidth={2.5} />
        {count.remaining} of {count.cap} spots left
        {almostGone && <span className="ml-1 text-error">· almost gone</span>}
      </div>
      <p className="text-sm text-on-surface-variant mt-2.5">
        After they're gone, the only path in is ₹299/month from launch.
      </p>
    </div>
  );
}
