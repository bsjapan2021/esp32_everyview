/**
 * Presentational status indicators: online/offline, RSSI bars, SD gauge,
 * and trigger badge. All server-safe.
 */

import { WifiOff, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui";
import { rssiToBars, rssiLabel, triggerLabel, cn } from "@/lib/utils";
import { isOnline } from "@/lib/time";
import type { TriggerType } from "@/types/db";

export function StatusBadge({
  lastSeenAt,
}: {
  lastSeenAt: string | null;
}) {
  const online = isOnline(lastSeenAt);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold",
        online
          ? "border-online/40 bg-online/10 text-online"
          : "border-offline/40 bg-offline/10 text-offline",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          online ? "bg-online animate-pulse" : "bg-offline",
        )}
        aria-hidden
      />
      {online ? "온라인" : "오프라인"}
    </span>
  );
}

export function RssiIndicator({
  rssi,
  showLabel = true,
}: {
  rssi: number | null;
  showLabel?: boolean;
}) {
  const bars = rssiToBars(rssi);
  const heights = ["h-1.5", "h-2.5", "h-3.5", "h-4.5"];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`RSSI ${rssi ?? "?"}dBm · ${rssiLabel(rssi)}`}
    >
      {rssi == null ? (
        <WifiOff className="h-4 w-4 text-offline" aria-hidden />
      ) : (
        <span className="flex items-end gap-0.5" aria-hidden>
          {heights.map((h, i) => (
            <span
              key={i}
              className={cn(
                "w-1 rounded-sm",
                h,
                i < bars ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </span>
      )}
      {showLabel ? (
        <span className="tabular-nums">
          {rssi == null ? "신호 없음" : `${rssi}dBm`}
        </span>
      ) : null}
    </span>
  );
}

export function SdGauge({
  usedPct,
}: {
  usedPct: number | null;
}) {
  const pct = usedPct == null ? 0 : Math.max(0, Math.min(100, usedPct));
  const tone =
    pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warning" : "bg-success";
  const textTone =
    pct >= 90 ? "text-danger" : pct >= 75 ? "text-warning" : "text-muted-foreground";
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5" aria-hidden />
          SD 사용량
        </span>
        <span className={cn("font-semibold tabular-nums", textTone)}>
          {usedPct == null ? "N/A" : `${pct}%`}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="SD 카드 사용량"
      >
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const triggerTone: Record<
  TriggerType,
  "primary" | "accent" | "warning" | "neutral" | "success"
> = {
  motion: "primary",
  pir: "accent",
  both: "warning",
  manual: "neutral",
  schedule: "success",
};

export function TriggerBadge({ trigger }: { trigger: TriggerType }) {
  return <Badge tone={triggerTone[trigger]}>{triggerLabel(trigger)}</Badge>;
}

export function OnlineDot({ lastSeenAt }: { lastSeenAt: string | null }) {
  const online = isOnline(lastSeenAt);
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        online ? "bg-online" : "bg-offline",
      )}
      aria-label={online ? "온라인" : "오프라인"}
    />
  );
}
