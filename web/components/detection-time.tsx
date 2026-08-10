/**
 * Detection time — the #1 piece of information in the whole dashboard.
 * Big monospaced HH:MM:SS, secondary date with weekday, and relative time.
 * Server-safe (pure); the relative portion hydrates on the client.
 */

import { AlertTriangle } from "lucide-react";
import { formatTimeKST, formatDateKST } from "@/lib/time";
import { RelativeTime } from "@/components/relative-time";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

const timeSize: Record<Size, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-5xl sm:text-6xl",
};

export function DetectionTime({
  iso,
  size = "md",
  timeSynced = true,
  className,
  showRelative = true,
}: {
  iso: string;
  size?: Size;
  timeSynced?: boolean;
  className?: string;
  showRelative?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-baseline gap-2">
        <time
          dateTime={iso}
          className={cn(
            "font-mono font-bold leading-none tracking-tight tabular-nums text-foreground",
            timeSize[size],
          )}
        >
          {formatTimeKST(iso)}
        </time>
        {!timeSynced ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning"
            title="디바이스 시간이 동기화되지 않았습니다"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            시간 미동기화
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
        <span>{formatDateKST(iso)}</span>
        {showRelative ? (
          <>
            <span aria-hidden>·</span>
            <RelativeTime iso={iso} className="font-medium text-foreground/80" />
          </>
        ) : null}
      </div>
    </div>
  );
}
