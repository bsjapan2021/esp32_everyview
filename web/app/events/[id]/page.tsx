import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Video,
  Download,
  MapPin,
  Cpu,
  HardDrive,
} from "lucide-react";
import { Card } from "@/components/ui";
import { DetectionTime } from "@/components/detection-time";
import { TriggerBadge, RssiIndicator } from "@/components/indicators";
import { EventActions } from "@/components/events/event-actions";
import { getEventById, getDevices } from "@/lib/data";
import { formatDateTimeKST } from "@/lib/time";
import { triggerLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "이벤트 상세 · ESP32CAM-Guard",
};

function isPlayable(url: string | null): boolean {
  if (!url) return false;
  if (url.startsWith("http")) return true;
  if (url.startsWith("data:video") && url.length > 64) return true;
  return false;
}

function isDownloadable(url: string | null): boolean {
  if (!url) return false;
  return url.startsWith("http") || url.startsWith("data:");
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event, devices] = await Promise.all([getEventById(id), getDevices()]);

  if (!event) notFound();

  const device = devices.find((d) => d.id === event.device_id) ?? null;
  const image = event.snapshot_url ?? event.thumb_url;

  return (
    <div>
      <Link
        href="/events"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> 이벤트 목록
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Media */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden">
            <div className="bg-black">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt={`${formatDateTimeKST(event.detected_at)} ${
                    device?.name ?? "카메라"
                  } ${triggerLabel(event.trigger)} 감지 스냅샷`}
                  className="max-h-[60vh] w-full object-contain"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-muted-foreground">
                  <Camera className="h-10 w-10" aria-hidden />
                </div>
              )}
            </div>
          </Card>

          {isPlayable(event.clip_url) ? (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 p-3 text-sm font-medium">
                <Video className="h-4 w-4" aria-hidden /> 클립 영상
              </div>
              <video
                src={event.clip_url ?? undefined}
                controls
                playsInline
                className="w-full bg-black"
                aria-label={`${formatDateTimeKST(event.detected_at)} 감지 클립 영상`}
              >
                <track kind="captions" label="캡션 없음" />
              </video>
            </Card>
          ) : event.clip_url || event.local_path ? (
            <Card className="p-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Video className="h-4 w-4" aria-hidden /> 클립 영상
              </div>
              <p className="mt-1">
                원본 영상은 디바이스 SD 카드 또는 클라우드 스토리지에 저장되어
                있습니다.
              </p>
              {event.local_path ? (
                <p className="mt-1 font-mono text-xs">{event.local_path}</p>
              ) : null}
            </Card>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              감지 시각
            </p>
            <DetectionTime
              iso={event.detected_at}
              size="xl"
              timeSynced={event.time_synced}
            />
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              메타데이터
            </h2>
            <dl className="space-y-2 text-sm">
              <Meta label="트리거">
                <TriggerBadge trigger={event.trigger} />
              </Meta>
              <Meta label="점수">
                <span className="tabular-nums">{event.score ?? "-"}</span>
              </Meta>
              <Meta label="감지 횟수">
                <span className="tabular-nums">{event.hit_count ?? "-"}</span>
              </Meta>
              <Meta label="정확한 시각">
                <span className="font-mono text-xs">
                  {formatDateTimeKST(event.detected_at)}
                </span>
              </Meta>
              <Meta label="시간 동기화">
                <span className={event.time_synced ? "text-success" : "text-warning"}>
                  {event.time_synced ? "동기화됨" : "미동기화"}
                </span>
              </Meta>
              <Meta label="디바이스">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  {device?.name ?? event.device?.name ?? "알 수 없음"}
                </span>
              </Meta>
              {device?.location ? (
                <Meta label="위치">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {device.location}
                  </span>
                </Meta>
              ) : null}
              <Meta label="신호 세기">
                <RssiIndicator rssi={device?.rssi ?? null} />
              </Meta>
              {device?.fw_version ? (
                <Meta label="펌웨어">
                  <span className="font-mono text-xs">{device.fw_version}</span>
                </Meta>
              ) : null}
              {event.note ? (
                <Meta label="메모">
                  <span>{event.note}</span>
                </Meta>
              ) : null}
            </dl>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              다운로드
            </h2>
            <div className="flex flex-col gap-2">
              {isDownloadable(event.snapshot_url) ? (
                <a
                  href={event.snapshot_url ?? "#"}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm hover:bg-muted/70"
                >
                  <Download className="h-4 w-4" aria-hidden /> 스냅샷 저장
                </a>
              ) : null}
              {isDownloadable(event.clip_url) ? (
                <a
                  href={event.clip_url ?? "#"}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm hover:bg-muted/70"
                >
                  <Download className="h-4 w-4" aria-hidden /> 클립 저장
                </a>
              ) : null}
              {event.local_path ? (
                <div className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="font-mono break-all">{event.local_path}</span>
                </div>
              ) : null}
              {!isDownloadable(event.snapshot_url) &&
              !isDownloadable(event.clip_url) &&
              !event.local_path ? (
                <p className="text-xs text-muted-foreground">
                  다운로드 가능한 미디어가 없습니다.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              작업
            </h2>
            <EventActions
              eventId={event.id}
              initialProtected={event.protected}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
