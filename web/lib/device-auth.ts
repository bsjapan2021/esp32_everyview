/**
 * Device authentication for ingest / heartbeat routes.
 * Every device-facing route must present a non-empty `X-Device-Key` header.
 *
 * When Supabase is configured the key is additionally resolved to a device row.
 * When it is not (local/build), we accept any non-empty key so the contract is
 * still exercised without a database.
 */

import { NextResponse } from "next/server";
import { getServiceClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import type { Device } from "@/types/db";

export const DEVICE_KEY_HEADER = "x-device-key";

export interface DeviceAuthOk {
  ok: true;
  deviceKey: string;
  device: Device | null;
}
export interface DeviceAuthErr {
  ok: false;
  response: NextResponse;
}
export type DeviceAuthResult = DeviceAuthOk | DeviceAuthErr;

function unauthorized(message: string): DeviceAuthErr {
  return {
    ok: false,
    response: NextResponse.json({ error: message }, { status: 401 }),
  };
}

/**
 * Validate the X-Device-Key header. Resolves the device when possible.
 * Returns a discriminated union so callers can early-return the error response.
 */
export async function authenticateDevice(
  req: Request,
): Promise<DeviceAuthResult> {
  const key = req.headers.get(DEVICE_KEY_HEADER)?.trim();
  if (!key) {
    return unauthorized("X-Device-Key 헤더가 필요합니다.");
  }

  if (!isSupabaseServerConfigured()) {
    // Unconfigured: accept the key so the contract works without a DB.
    return { ok: true, deviceKey: key, device: null };
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("device_key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return unauthorized("등록되지 않은 디바이스 키입니다.");
    }
    return { ok: true, deviceKey: key, device: data as Device };
  } catch {
    // DB error: still authenticate on key presence to avoid dropping events.
    return { ok: true, deviceKey: key, device: null };
  }
}
