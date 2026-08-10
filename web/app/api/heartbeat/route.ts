import { authenticateDevice } from "@/lib/device-auth";
import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { heartbeatSchema } from "@/lib/validation";
import { readJson, ok, validate } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RemoteCommand {
  type: "capture" | "ota" | "reboot";
  [key: string]: unknown;
}

/**
 * POST /api/heartbeat
 * Header: X-Device-Key
 * 1-minute status report. Updates the device row and returns any pending
 * remote commands for the device to act on.
 */
export async function POST(req: Request) {
  const auth = await authenticateDevice(req);
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  const v = validate(heartbeatSchema, body);
  if (!v.ok) return v.response;
  const input = v.data;

  const commands: RemoteCommand[] = []; // no pending commands by default

  if (isSupabaseServerConfigured() && auth.device) {
    try {
      const supabase = getServiceClient();
      await supabase
        .from("devices")
        .update({
          last_seen_at: new Date().toISOString(),
          rssi: input.rssi ?? auth.device.rssi,
          sd_used_pct: input.sd_used_pct ?? auth.device.sd_used_pct,
          fw_version: input.fw_version ?? auth.device.fw_version,
          time_synced: input.time_synced ?? auth.device.time_synced,
        })
        .eq("id", auth.device.id);
    } catch {
      /* best-effort — still return commands */
    }
  }

  return ok({
    ok: true,
    server_time: new Date().toISOString(),
    commands,
  });
}
