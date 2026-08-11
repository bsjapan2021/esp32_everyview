import { authenticateDevice, ensureDevice } from "@/lib/device-auth";
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

  if (isSupabaseServerConfigured()) {
    // 미등록 기기는 첫 하트비트에 자동 등록(self-register)
    const device =
      auth.device ??
      (await ensureDevice(auth.deviceKey, input.device_name, input.fw_version));
    if (device) {
      try {
        const supabase = getServiceClient();
        await supabase
          .from("devices")
          .update({
            last_seen_at: new Date().toISOString(),
            rssi: input.rssi ?? device.rssi,
            sd_used_pct: input.sd_used_pct ?? device.sd_used_pct,
            fw_version: input.fw_version ?? device.fw_version,
            time_synced: input.time_synced ?? device.time_synced,
          })
          .eq("id", device.id);
      } catch {
        /* best-effort — still return commands */
      }
    }
  }

  return ok({
    ok: true,
    server_time: new Date().toISOString(),
    commands,
  });
}
