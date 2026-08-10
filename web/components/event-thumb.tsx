import Link from "next/link";
import { Lock, Video, Camera } from "lucide-react";
import { formatTimeKST, formatDateKST } from "@/lib/time";
import { TriggerBadge } from "@/components/indicators";
import { triggerLabel, cn } from "@/lib/utils";
import type { EventWithDevice } from "@/types/db";

/**
 * Event thumbnail tile. Detection time is overlaid large at the top; the alt
 * text includes the detection time and device for screen readers.
 */
export function EventThumb({
  event,
  className,
}: {
  event: EventWithDevice;
  className?: string;
}) {
  const time = formatTimeKST(event.detected_at);
  const date = formatDateKST(event.detected_at);
  const deviceName = event.device?.name ?? "카메라";
  const alt = `${date} ${time} ${deviceName} ${triggerLabel(event.trigger)} 감지 스냅샷`;

  return (
    <Link
      href={`/events/${event.id}`}
      className={cn(
        "group relative block overflow-hidden rounded-xl border border-border bg-muted",
        className,
      )}
      aria-label={alt}
    >
      <div className="aspect-[4/3] w-full">
        {event.thumb_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.thumb_url}
            alt={alt}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Camera className="h-8 w-8" aria-hidden />
          </div>
        )}
      </div>

      {/* Top gradient with large detection time */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 to-transparent p-2">
        <div className="font-mono text-lg font-bold leading-none tabular-nums text-white drop-shadow">
          {time}
        </div>
      </div>

      {/* Bottom row: trigger + flags */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent p-2">
        <TriggerBadge trigger={event.trigger} />
        <div className="flex items-center gap-1.5">
          {event.clip_url ? (
            <Video className="h-4 w-4 text-white/90" aria-label="영상 있음" />
          ) : null}
          {event.protected ? (
            <Lock className="h-4 w-4 text-warning" aria-label="보호됨" />
          ) : null}
        </div>
      </div>
    </Link>
  );
}
