"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Filter,
  Grid2x2,
  List,
  Lock,
  Unlock,
  Trash2,
  Video,
  Loader2,
  ListVideo,
} from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { DetectionTime } from "@/components/detection-time";
import { EventThumb } from "@/components/event-thumb";
import { TriggerBadge } from "@/components/indicators";
import { cn, triggerLabel } from "@/lib/utils";
import { TRIGGER_TYPES } from "@/types/db";
import type { Device, EventWithDevice, TriggerType } from "@/types/db";

interface EventsResponse {
  events: EventWithDevice[];
  total: number;
}

/** Local optimistic edits layered over server data (no derived-state effects). */
interface EventOverride {
  protected?: boolean;
  deleted?: boolean;
}

async function fetchEvents(params: URLSearchParams): Promise<EventsResponse> {
  const res = await fetch(`/api/events?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("이벤트를 불러오지 못했습니다.");
  return (await res.json()) as EventsResponse;
}

type ViewMode = "grid" | "list";

export function EventsClient({
  devices,
  initialDeviceId,
}: {
  devices: Device[];
  initialDeviceId?: string;
}) {
  const [deviceId, setDeviceId] = useState(initialDeviceId ?? "");
  const [trigger, setTrigger] = useState<"" | TriggerType>("");
  const [date, setDate] = useState("");
  const [limit, setLimit] = useState(24);
  const [view, setView] = useState<ViewMode>("grid");
  const [overrides, setOverrides] = useState<Record<string, EventOverride>>({});
  const [toast, setToast] = useState<string | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (deviceId) p.set("device", deviceId);
    if (trigger) p.set("trigger", trigger);
    if (date) p.set("date", date);
    p.set("limit", String(limit));
    return p;
  }, [deviceId, trigger, date, limit]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["events", params.toString()],
    queryFn: () => fetchEvents(params),
  });

  // Apply optimistic overrides during render (no effect needed).
  const displayed = useMemo(() => {
    const rows = data?.events ?? [];
    return rows
      .map((e) => {
        const o = overrides[e.id];
        return o ? { ...e, protected: o.protected ?? e.protected } : e;
      })
      .filter((e) => !overrides[e.id]?.deleted);
  }, [data, overrides]);

  const fetchedCount = data?.events?.length ?? 0;
  const total = data?.total ?? 0;
  const hasMore = fetchedCount < total;

  // Reset paging + optimistic edits whenever the filter changes.
  function resetPaging() {
    setLimit(24);
    setOverrides({});
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  async function patchEvent(
    id: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function toggleProtect(e: EventWithDevice) {
    const next = !e.protected;
    setOverrides((prev) => ({
      ...prev,
      [e.id]: { ...prev[e.id], protected: next },
    }));
    const ok = await patchEvent(e.id, { protected: next });
    setToast(
      ok
        ? next
          ? "이벤트를 보호했습니다."
          : "보호를 해제했습니다."
        : "변경에 실패했습니다.",
    );
    if (!ok) {
      setOverrides((prev) => ({
        ...prev,
        [e.id]: { ...prev[e.id], protected: !next },
      }));
    }
  }

  async function removeEvent(e: EventWithDevice) {
    if (e.protected) {
      setToast("보호된 이벤트는 삭제할 수 없습니다. 먼저 보호를 해제하세요.");
      return;
    }
    if (!window.confirm("이 이벤트를 삭제하시겠습니까?")) return;
    setOverrides((prev) => ({ ...prev, [e.id]: { ...prev[e.id], deleted: true } }));
    const ok = await patchEvent(e.id, { deleted: true });
    setToast(ok ? "이벤트를 삭제했습니다." : "삭제에 실패했습니다.");
    if (!ok) {
      setOverrides((prev) => ({
        ...prev,
        [e.id]: { ...prev[e.id], deleted: false },
      }));
    }
  }

  return (
    <div>
      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" aria-hidden /> 필터
          </div>

          <div>
            <label htmlFor="f-date" className="mb-1 block text-xs text-muted-foreground">
              날짜
            </label>
            <input
              id="f-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                resetPaging();
              }}
              className="rounded-lg border border-border bg-input px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="f-trigger" className="mb-1 block text-xs text-muted-foreground">
              트리거
            </label>
            <select
              id="f-trigger"
              value={trigger}
              onChange={(e) => {
                setTrigger(e.target.value as "" | TriggerType);
                resetPaging();
              }}
              className="rounded-lg border border-border bg-input px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">전체</option>
              {TRIGGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {triggerLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-device" className="mb-1 block text-xs text-muted-foreground">
              디바이스
            </label>
            <select
              id="f-device"
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                resetPaging();
              }}
              className="rounded-lg border border-border bg-input px-3 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">전체</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {(deviceId || trigger || date) && (
            <button
              type="button"
              onClick={() => {
                setDeviceId("");
                setTrigger("");
                setDate("");
                resetPaging();
              }}
              className="rounded-lg border border-border bg-muted px-3 py-1.5 text-sm hover:bg-muted/70"
            >
              초기화
            </button>
          )}

          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border p-0.5">
            <ViewButton
              active={view === "grid"}
              onClick={() => setView("grid")}
              label="그리드"
            >
              <Grid2x2 className="h-4 w-4" aria-hidden />
            </ViewButton>
            <ViewButton
              active={view === "list"}
              onClick={() => setView("list")}
              label="리스트"
            >
              <List className="h-4 w-4" aria-hidden />
            </ViewButton>
          </div>
        </div>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <span className="ml-2 text-sm">불러오는 중…</span>
        </div>
      ) : isError ? (
        <EmptyState
          title="이벤트를 불러오지 못했습니다"
          description="잠시 후 다시 시도해 주세요."
        />
      ) : displayed.length === 0 ? (
        <EmptyState
          title="조건에 맞는 이벤트가 없습니다"
          description="필터를 변경해 보세요."
          icon={<ListVideo className="h-8 w-8" />}
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {displayed.map((e) => (
            <div key={e.id} className="group relative">
              <EventThumb event={e} />
              <RowActions
                event={e}
                onProtect={() => toggleProtect(e)}
                onDelete={() => removeEvent(e)}
                floating
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((e) => (
            <ListRow
              key={e.id}
              event={e}
              onProtect={() => toggleProtect(e)}
              onDelete={() => removeEvent(e)}
            />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + 24)}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            더 보기 ({displayed.length}/{total})
          </button>
        </div>
      ) : displayed.length > 0 ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {displayed.length}건 표시 중
        </p>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-lg md:bottom-8"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ListRow({
  event,
  onProtect,
  onDelete,
}: {
  event: EventWithDevice;
  onProtect: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="flex items-center gap-4 p-3">
      <Link
        href={`/events/${event.id}`}
        className="relative block h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-muted"
      >
        {event.thumb_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.thumb_url}
            alt={`${event.device?.name ?? "카메라"} 감지 스냅샷`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : null}
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/events/${event.id}`} className="block">
          <DetectionTime
            iso={event.detected_at}
            size="md"
            timeSynced={event.time_synced}
          />
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <TriggerBadge trigger={event.trigger} />
          <span>{event.device?.name ?? "카메라"}</span>
          {event.score != null && event.score > 0 ? (
            <span>· 점수 {event.score}</span>
          ) : null}
          {event.clip_url ? (
            <span className="inline-flex items-center gap-0.5">
              <Video className="h-3.5 w-3.5" aria-hidden /> 영상
            </span>
          ) : null}
        </div>
      </div>

      <RowActions event={event} onProtect={onProtect} onDelete={onDelete} />
    </Card>
  );
}

function RowActions({
  event,
  onProtect,
  onDelete,
  floating = false,
}: {
  event: EventWithDevice;
  onProtect: () => void;
  onDelete: () => void;
  floating?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1",
        floating &&
          "absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
      )}
    >
      <button
        type="button"
        onClick={onProtect}
        aria-label={event.protected ? "보호 해제" : "보호"}
        title={event.protected ? "보호 해제" : "보호"}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg border",
          event.protected
            ? "border-warning/40 bg-warning/15 text-warning"
            : "border-border bg-card/90 text-muted-foreground hover:text-foreground",
        )}
      >
        {event.protected ? (
          <Lock className="h-4 w-4" aria-hidden />
        ) : (
          <Unlock className="h-4 w-4" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="삭제"
        title="삭제"
        disabled={event.protected}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card/90 text-muted-foreground hover:text-danger disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
