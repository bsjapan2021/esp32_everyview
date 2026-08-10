"use client";

import { useEffect, useState } from "react";
import { relativeTimeKST } from "@/lib/time";

/**
 * Relative time ("3분 전") that refreshes on the client. It renders the value
 * computed at mount and updates on an interval. `suppressHydrationWarning`
 * absorbs the sub-second server/client difference.
 */
export function RelativeTime({
  iso,
  className,
  intervalMs = 30_000,
}: {
  iso: string;
  className?: string;
  intervalMs?: number;
}) {
  const [label, setLabel] = useState(() => relativeTimeKST(iso));

  useEffect(() => {
    const tick = () => setLabel(relativeTimeKST(iso));
    // Refresh right after mount (in a microtask, not synchronously in the
    // effect body) and then on an interval.
    queueMicrotask(tick);
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [iso, intervalMs]);

  return (
    <span className={className} suppressHydrationWarning>
      {label}
    </span>
  );
}
