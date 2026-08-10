/**
 * Time helpers — detection time is the #1 concept in this dashboard, so all
 * formatting is centralized here and pinned to Korea Standard Time (KST, UTC+9)
 * via Intl + timeZone so output is independent of the server/client timezone.
 */

import { ONLINE_THRESHOLD_MS } from "@/lib/config";

const KST = "Asia/Seoul";
const LOCALE = "ko-KR";

function toDate(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return new Date(value);
}

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** "14:32:07" — large, first-class detection time. */
export function formatTimeKST(value: string | number | Date): string {
  const d = toDate(value);
  if (!isValid(d)) return "--:--:--";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

/** "14:32" — compact time without seconds. */
export function formatTimeShortKST(value: string | number | Date): string {
  const d = toDate(value);
  if (!isValid(d)) return "--:--";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** "2026-08-10 (월)" — secondary date line with Korean weekday. */
export function formatDateKST(value: string | number | Date): string {
  const d = toDate(value);
  if (!isValid(d)) return "----------";
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = new Intl.DateTimeFormat(LOCALE, {
    timeZone: KST,
    weekday: "short",
  }).format(d);
  return `${get("year")}-${get("month")}-${get("day")} (${weekday})`;
}

/** "2026-08-10 14:32:07" — full timestamp. */
export function formatDateTimeKST(value: string | number | Date): string {
  const d = toDate(value);
  if (!isValid(d)) return "---------- --:--:--";
  return `${formatDateKST(value)} ${formatTimeKST(value)}`.replace(
    / \([^)]*\)/,
    "",
  );
}

/** "2026-08-10" — plain ISO-style date in KST, used for input[type=date] defaults. */
export function toDateInputValueKST(value: string | number | Date): string {
  const d = toDate(value);
  if (!isValid(d)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // en-CA => YYYY-MM-DD
  return parts;
}

/** "3분 전", "방금 전", "2시간 전", "어제", "3일 전", or a KST date for old items. */
export function relativeTimeKST(
  value: string | number | Date,
  now: number = Date.now(),
): string {
  const d = toDate(value);
  if (!isValid(d)) return "";
  const diffMs = now - d.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);

  const sec = Math.floor(abs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 10) return "방금 전";
  if (future) {
    if (min < 60) return `${min}분 후`;
    if (hour < 24) return `${hour}시간 후`;
    return formatDateKST(value).replace(/ \([^)]*\)/, "");
  }
  if (sec < 60) return `${sec}초 전`;
  if (min < 60) return `${min}분 전`;
  if (hour < 24) return `${hour}시간 전`;
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  return formatDateKST(value).replace(/ \([^)]*\)/, "");
}

/** A device is online if last_seen_at is within the online threshold window. */
export function isOnline(
  lastSeenAt: string | number | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (lastSeenAt == null) return false;
  const d = toDate(lastSeenAt);
  if (!isValid(d)) return false;
  return now - d.getTime() <= ONLINE_THRESHOLD_MS;
}

/** The hour-of-day (0-23) in KST for an instant — used for the 24h histogram. */
export function hourOfDayKST(value: string | number | Date): number {
  const d = toDate(value);
  if (!isValid(d)) return 0;
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: KST,
    hour: "2-digit",
    hour12: false,
  }).format(d);
  const n = Number.parseInt(h, 10);
  return Number.isNaN(n) ? 0 : n % 24;
}
