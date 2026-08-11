import { authenticateDevice } from "@/lib/device-auth";
import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { mediaSignSchema } from "@/lib/validation";
import { readJson, ok, validate, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "media";

/**
 * POST /api/ingest/media/sign
 * Header: X-Device-Key
 * Returns a Supabase Storage signed upload URL so the device can PUT the
 * original snapshot/clip directly. Returns a mock shape if Storage is not
 * configured, so the contract is exercisable without a backend.
 */
export async function POST(req: Request) {
  const auth = await authenticateDevice(req);
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  const v = validate(mediaSignSchema, body);
  if (!v.ok) return v.response;
  const { event_id, kind, ext } = v.data;

  const extension = (ext ?? (kind === "clip" ? "avi" : "jpg")).replace(/^\./, "");
  const path = `${kind}/${event_id}.${extension}`;

  if (!isSupabaseServerConfigured()) {
    return ok({
      configured: false,
      bucket: BUCKET,
      path,
      // Mock shape mirroring Supabase createSignedUploadUrl()
      signedUrl: `https://mock.storage.local/${BUCKET}/${path}?token=mock-signed-token`,
      token: "mock-signed-token",
      method: "PUT",
      publicUrl: `https://mock.storage.local/object/public/${BUCKET}/${path}`,
      message: "Storage 미구성 — 목(mock) 업로드 URL을 반환합니다.",
    });
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error) throw error;
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path)
      .data.publicUrl;

    // 경로를 서명 시점에 미리 이벤트에 기록한다. 기기의 후속 complete 호출은
    // 대용량 PUT 뒤 TLS라 저사양에서 취약(응답코드 미검사) → 여기서 선기록하면
    // sign+PUT만 성공하면 대시보드에 미디어가 확실히 뜬다. 실패해도 서명은 반환.
    try {
      const column = kind === "clip" ? "clip_url" : "snapshot_url";
      await supabase.from("events").update({ [column]: path }).eq("id", event_id);
    } catch {
      /* 선기록 실패는 무시 — complete가 백업 경로 */
    }

    return ok({
      configured: true,
      bucket: BUCKET,
      path: data.path,
      // `url` — 펌웨어(cloudUploadMedia)가 읽는 PUT 대상 필드명
      url: data.signedUrl,
      signedUrl: data.signedUrl,
      token: data.token,
      method: "PUT",
      // 비공개 버킷이라 publicUrl은 조회용으로 안 씀 → 펌웨어는 path를 저장하고
      // 대시보드가 조회 시 서명 다운로드 URL을 발급한다.
      publicUrl,
    });
  } catch {
    return serverError("서명된 업로드 URL 생성에 실패했습니다.");
  }
}
