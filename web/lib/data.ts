/**
 * Server-side data-access layer.
 *
 * Every function reads from Supabase when configured, otherwise returns mock
 * data. All Supabase calls are wrapped so a network/DB error degrades to mock
 * instead of crashing a page. Do NOT import this module from Client Components.
 */

import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { mockDevices, mockEvents } from "@/lib/mock";
import { hourOfDayKST } from "@/lib/time";
import type { Device, EventWithDevice, TriggerType } from "@/types/db";

const EVENT_SELECT = "*, device:devices(id,name,location)";

export interface EventFilters {
  deviceId?: string;
  trigger?: TriggerType;
  /** KST calendar day "YYYY-MM-DD". */
  date?: string;
  limit?: number;
  offset?: number;
}

export interface HourBucket {
  hour: number; // 0..23
  label: string; // "14시"
  count: number;
}

/** Whether the dashboard is backed by a real Supabase project. */
export function backendConfigured(): boolean {
  return isSupabaseServerConfigured();
}

export async function getDevices(): Promise<Device[]> {
  if (!isSupabaseServerConfigured()) return mockDevices();
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as Device[]) ?? [];
  } catch {
    return mockDevices();
  }
}

export async function getRecentEvents(limit = 6): Promise<EventWithDevice[]> {
  if (!isSupabaseServerConfigured()) return mockEvents().slice(0, limit);
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_SELECT)
      .order("detected_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as EventWithDevice[]) ?? [];
  } catch {
    return mockEvents().slice(0, limit);
  }
}

export async function getEvents(
  filters: EventFilters = {},
): Promise<{ events: EventWithDevice[]; total: number }> {
  const limit = filters.limit ?? 24;
  const offset = filters.offset ?? 0;

  if (!isSupabaseServerConfigured()) {
    let rows = mockEvents();
    rows = applyMockFilters(rows, filters);
    const total = rows.length;
    return { events: rows.slice(offset, offset + limit), total };
  }

  try {
    const supabase = getServiceClient();
    let query = supabase
      .from("events")
      .select(EVENT_SELECT, { count: "exact" })
      .order("detected_at", { ascending: false });

    if (filters.deviceId) query = query.eq("device_id", filters.deviceId);
    if (filters.trigger) query = query.eq("trigger", filters.trigger);
    if (filters.date) {
      const start = new Date(`${filters.date}T00:00:00+09:00`).toISOString();
      const end = new Date(`${filters.date}T00:00:00+09:00`);
      end.setDate(end.getDate() + 1);
      query = query
        .gte("detected_at", start)
        .lt("detected_at", end.toISOString());
    }
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return {
      events: (data as EventWithDevice[]) ?? [],
      total: count ?? 0,
    };
  } catch {
    let rows = mockEvents();
    rows = applyMockFilters(rows, filters);
    return { events: rows.slice(offset, offset + limit), total: rows.length };
  }
}

const MEDIA_BUCKET = "media";

/**
 * 비공개 버킷 경로 → 단기 서명 다운로드 URL. 이미 http/data URI면 그대로.
 * createSignedUrl은 파일이 실제로 있어야 성공하므로 존재 확인도 겸한다.
 * 파일이 없으면(예: sign 시점에 경로만 선기록됐지만 기기 PUT이 실패) null을 반환해
 * "clip_url은 있는데 파일은 없는" 유령 상태를 페이지에서 미표시로 처리한다.
 */
async function signStoragePath(
  supabase: ReturnType<typeof getServiceClient>,
  value: string | null,
): Promise<string | null> {
  if (!value) return value;
  if (value.startsWith("http") || value.startsWith("data:")) return value;
  try {
    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(value, 3600);
    if (error || !data?.signedUrl) return null; // 파일 없음/서명 실패 → 미디어 없음 처리
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function getEventById(id: string): Promise<EventWithDevice | null> {
  if (!isSupabaseServerConfigured()) {
    return mockEvents().find((e) => e.id === id) ?? null;
  }
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const ev = (data as EventWithDevice | null) ?? null;
    if (ev) {
      ev.snapshot_url = await signStoragePath(supabase, ev.snapshot_url);
      ev.clip_url = await signStoragePath(supabase, ev.clip_url);
    }
    return ev;
  } catch {
    return mockEvents().find((e) => e.id === id) ?? null;
  }
}

/** 24-hour histogram (KST) built from the most recent 24h of events. */
export async function getHourlyBuckets(): Promise<HourBucket[]> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  let events: EventWithDevice[];
  if (!isSupabaseServerConfigured()) {
    events = mockEvents().filter(
      (e) => new Date(e.detected_at).getTime() >= since,
    );
  } else {
    try {
      const supabase = getServiceClient();
      const { data, error } = await supabase
        .from("events")
        .select("detected_at")
        .gte("detected_at", new Date(since).toISOString());
      if (error) throw error;
      events = (data as EventWithDevice[]) ?? [];
    } catch {
      events = mockEvents().filter(
        (e) => new Date(e.detected_at).getTime() >= since,
      );
    }
  }

  const counts = new Array<number>(24).fill(0);
  for (const e of events) counts[hourOfDayKST(e.detected_at)]++;
  return counts.map((count, hour) => ({
    hour,
    label: `${hour}시`,
    count,
  }));
}

function applyMockFilters(
  rows: EventWithDevice[],
  filters: EventFilters,
): EventWithDevice[] {
  let out = rows;
  if (filters.deviceId) out = out.filter((e) => e.device_id === filters.deviceId);
  if (filters.trigger) out = out.filter((e) => e.trigger === filters.trigger);
  if (filters.date) {
    const start = new Date(`${filters.date}T00:00:00+09:00`).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    out = out.filter((e) => {
      const t = new Date(e.detected_at).getTime();
      return t >= start && t < end;
    });
  }
  return out;
}
