import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { ok, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/devices/[id] — remove a device. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  if (!isSupabaseServerConfigured()) {
    return ok({ id, deleted: true, stored: false });
  }

  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from("devices").delete().eq("id", id);
    if (error) throw error;
    return ok({ id, deleted: true });
  } catch {
    return serverError("디바이스 삭제에 실패했습니다.");
  }
}
