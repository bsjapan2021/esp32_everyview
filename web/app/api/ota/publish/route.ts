import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { otaPublishSchema } from "@/lib/validation";
import { readJson, ok, validate, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ota/publish — publish a firmware release.
 * Body: { version, url?, notes?, mandatory? }
 *
 * When Supabase has a `firmware_releases` table this inserts a row; otherwise
 * it acknowledges as a stub so the contract works without a backend.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  const v = validate(otaPublishSchema, body);
  if (!v.ok) return v.response;
  const input = v.data;

  if (!isSupabaseServerConfigured()) {
    return ok(
      {
        published: false,
        release: {
          version: input.version,
          url: input.url ?? null,
          notes: input.notes ?? null,
          mandatory: input.mandatory ?? false,
          published_at: new Date().toISOString(),
        },
        message: "데모 모드 — 릴리스가 기록되지 않았습니다.",
      },
      201,
    );
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("firmware_releases")
      .insert({
        version: input.version,
        url: input.url ?? null,
        notes: input.notes ?? null,
        mandatory: input.mandatory ?? false,
      })
      .select("*")
      .single();
    if (error) throw error;
    return ok({ published: true, release: data }, 201);
  } catch {
    return serverError("펌웨어 릴리스 게시에 실패했습니다.");
  }
}
