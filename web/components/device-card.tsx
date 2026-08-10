import Link from "next/link";
import { Cpu, MapPin, Clock } from "lucide-react";
import { Card } from "@/components/ui";
import {
  StatusBadge,
  RssiIndicator,
  SdGauge,
} from "@/components/indicators";
import { RelativeTime } from "@/components/relative-time";
import type { Device } from "@/types/db";

export function DeviceCard({ device }: { device: Device }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{device.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {device.location ?? "위치 미지정"}
          </p>
        </div>
        <StatusBadge lastSeenAt={device.last_seen_at} />
      </div>

      <div className="mt-4">
        <SdGauge usedPct={device.sd_used_pct} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">신호 세기</dt>
          <dd className="mt-0.5">
            <RssiIndicator rssi={device.rssi} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">펌웨어</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-mono">
            <Cpu className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {device.fw_version ?? "알 수 없음"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">마지막 응답</dt>
          <dd className="mt-0.5 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            {device.last_seen_at ? (
              <RelativeTime iso={device.last_seen_at} />
            ) : (
              <span className="text-muted-foreground">기록 없음</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex gap-2">
        <Link
          href="/live"
          className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-center text-xs font-medium hover:bg-muted"
        >
          라이브 보기
        </Link>
        <Link
          href={`/events?device=${device.id}`}
          className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-center text-xs font-medium hover:bg-muted"
        >
          이벤트
        </Link>
      </div>
    </Card>
  );
}
