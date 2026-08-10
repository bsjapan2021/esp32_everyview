import { getDevices } from "@/lib/data";
import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { deviceCreateSchema } from "@/lib/validation";
import { readJson, ok, validate, serverError } from "@/lib/http";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/devices — list all devices. */
export async function GET() {
  const devices = await getDevices();
  return ok({ devices });
}

/** POST /api/devices — register a device (device_key, name, location). */
export async function POST(req: Request) {
  const body = await readJson(req);
  const v = validate(deviceCreateSchema, body);
  if (!v.ok) return v.response;
  const input = v.data;

  if (!isSupabaseServerConfigured()) {
    return ok(
      {
        device: {
          id: uid(),
          device_key: input.device_key,
          name: input.name,
          location: input.location ?? null,
          fw_version: null,
          last_seen_at: null,
          rssi: null,
          sd_used_pct: null,
          time_synced: false,
          created_at: new Date().toISOString(),
        },
        stored: false,
      },
      201,
    );
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("devices")
      .insert({
        device_key: input.device_key,
        name: input.name,
        location: input.location ?? null,
        time_synced: false,
      })
      .select("*")
      .single();
    if (error) throw error;
    return ok({ device: data, stored: true }, 201);
  } catch {
    return serverError("디바이스 등록에 실패했습니다. (중복 device_key 여부 확인)");
  }
}
