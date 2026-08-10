import { getEvents } from "@/lib/data";
import { ok } from "@/lib/http";
import { TRIGGER_TYPES, type TriggerType } from "@/types/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events?device=&trigger=&date=&limit=&offset=
 * Returns { events, total }. Reads from Supabase when configured, else mock.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;

  const triggerParam = q.get("trigger");
  const trigger =
    triggerParam && (TRIGGER_TYPES as readonly string[]).includes(triggerParam)
      ? (triggerParam as TriggerType)
      : undefined;

  const limit = clampInt(q.get("limit"), 24, 1, 100);
  const offset = clampInt(q.get("offset"), 0, 0, 100000);

  const result = await getEvents({
    deviceId: q.get("device") ?? undefined,
    trigger,
    date: q.get("date") ?? undefined,
    limit,
    offset,
  });

  return ok(result);
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = raw == null ? NaN : Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
