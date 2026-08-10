/** Small shared UI/helper utilities (no framework-specific deps). */

/** Merge conditional className strings (tiny clsx-style helper). */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** RSSI (dBm) → 0..4 signal bars. Typical range: -50 (great) .. -90 (poor). */
export function rssiToBars(rssi: number | null | undefined): number {
  if (rssi == null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
}

/** RSSI (dBm) → human quality label (Korean). */
export function rssiLabel(rssi: number | null | undefined): string {
  const bars = rssiToBars(rssi);
  return ["신호 없음", "약함", "보통", "양호", "강함"][bars] ?? "알 수 없음";
}

/** Korean labels for trigger types. */
export function triggerLabel(trigger: string): string {
  const map: Record<string, string> = {
    motion: "모션",
    pir: "PIR 센서",
    both: "모션+PIR",
    manual: "수동 촬영",
    schedule: "예약 촬영",
  };
  return map[trigger] ?? trigger;
}

/** Format a byte count as a compact human string. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** RFC4122-ish id for client-side optimistic rows / mock generation. */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
