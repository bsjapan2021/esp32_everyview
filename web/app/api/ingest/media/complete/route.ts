import { authenticateDevice } from "@/lib/device-auth";
import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { mediaCompleteSchema } from "@/lib/validation";
import { readJson, ok, validate, serverError, badRequest } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ingest/media/complete
 * Header: X-Device-Key
 * Attaches the uploaded original snapshot/clip URLs to the event row.
 */
export async function POST(req: Request) {
  const auth = await authenticateDevice(req);
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  const v = validate(mediaCompleteSchema, body);
  if (!v.ok) return v.response;
  const { event_id, kind, url } = v.data;
  // 펌웨어는 { kind, url }로 보냄 → snapshot_url/clip_url로 매핑. 세션 클라이언트 호환 위해 직접 지정도 허용.
  const snapshot_url =
    v.data.snapshot_url ?? (kind === "snapshot" ? url : undefined);
  const clip_url = v.data.clip_url ?? (kind === "clip" ? url : undefined);

  if (!snapshot_url && !clip_url) {
    return badRequest("snapshot_url 또는 clip_url 중 하나는 필요합니다.");
  }

  if (!isSupabaseServerConfigured()) {
    return ok({ id: event_id, updated: false, message: "데모 모드 — 저장 안 됨" });
  }

  try {
    const supabase = getServiceClient();
    const patch: Record<string, string> = {};
    if (snapshot_url) patch.snapshot_url = snapshot_url;
    if (clip_url) patch.clip_url = clip_url;

    const { data, error } = await supabase
      .from("events")
      .update(patch)
      .eq("id", event_id)
      .select("id")
      .single();
    if (error) throw error;
    return ok({ id: data.id, updated: true });
  } catch {
    return serverError("미디어 URL 업데이트에 실패했습니다.");
  }
}
