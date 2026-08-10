import { getEventById } from "@/lib/data";
import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { eventPatchSchema } from "@/lib/validation";
import { readJson, ok, validate, notFound, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/events/[id] — single event. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const event = await getEventById(id);
  if (!event) return notFound("이벤트를 찾을 수 없습니다.");
  return ok(event);
}

/**
 * PATCH /api/events/[id] — protect / note / delete.
 * Body: { protected?, note?, deleted? }
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  const v = validate(eventPatchSchema, body);
  if (!v.ok) return v.response;
  const { protected: isProtected, note, deleted } = v.data;

  if (!isSupabaseServerConfigured()) {
    // Demo mode: acknowledge so the optimistic UI works without a DB.
    return ok({ id, updated: true, stored: false });
  }

  try {
    const supabase = getServiceClient();

    if (deleted) {
      // Guard: never hard-delete a protected event.
      const { data: existing } = await supabase
        .from("events")
        .select("protected")
        .eq("id", id)
        .maybeSingle();
      if (existing?.protected) {
        return serverError("보호된 이벤트는 삭제할 수 없습니다.");
      }
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
      return ok({ id, deleted: true });
    }

    const patch: Record<string, unknown> = {};
    if (isProtected !== undefined) patch.protected = isProtected;
    if (note !== undefined) patch.note = note;

    const { data, error } = await supabase
      .from("events")
      .update(patch)
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    return ok({ id: data.id, updated: true });
  } catch {
    return serverError("이벤트 업데이트에 실패했습니다.");
  }
}
