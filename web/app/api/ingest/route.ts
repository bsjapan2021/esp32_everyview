import { authenticateDevice, ensureDevice } from "@/lib/device-auth";
import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { ingestSchema } from "@/lib/validation";
import { readJson, ok, validate, serverError } from "@/lib/http";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest
 * Header: X-Device-Key
 * Body: event meta + optional small base64 thumbnail.
 * Creates an `events` row via the service-role client.
 */
export async function POST(req: Request) {
  const auth = await authenticateDevice(req);
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  const v = validate(ingestSchema, body);
  if (!v.ok) return v.response;
  const input = v.data;

  const detectedAt = input.detected_at ?? new Date().toISOString();
  const thumbUrl = normalizeThumb(input.thumb_b64);

  // 미등록 기기는 자동 등록(self-register) 후 이벤트 저장
  const device =
    auth.device ??
    (isSupabaseServerConfigured()
      ? await ensureDevice(auth.deviceKey, input.device_name)
      : null);

  if (!isSupabaseServerConfigured() || !device) {
    // Unconfigured device: acknowledge without persisting (demo mode).
    return ok(
      {
        id: uid(),
        stored: false,
        detected_at: detectedAt,
        message: "이벤트를 수신했습니다. (데모 모드 — 저장 안 됨)",
      },
      201,
    );
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("events")
      .insert({
        device_id: device.id,
        detected_at: detectedAt,
        detected_epoch:
          input.detected_epoch ?? Math.floor(new Date(detectedAt).getTime() / 1000),
        time_synced: input.time_synced ?? false,
        trigger: input.trigger,
        score: input.score ?? null,
        hit_count: input.hit_count ?? null,
        thumb_url: thumbUrl,
        local_path: input.local_path ?? null,
        note: input.note ?? null,
        protected: false,
      })
      .select("id")
      .single();
    if (error) throw error;
    return ok({ id: data.id, stored: true, detected_at: detectedAt }, 201);
  } catch {
    return serverError("이벤트 저장에 실패했습니다.");
  }
}

function normalizeThumb(thumb: string | undefined): string | null {
  if (!thumb) return null;
  if (thumb.startsWith("data:")) return thumb;
  return `data:image/jpeg;base64,${thumb}`;
}
