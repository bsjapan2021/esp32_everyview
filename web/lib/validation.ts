/**
 * Zod schemas for all API inputs. Kept intentionally on the stable subset of
 * the zod API (object/string/number/boolean/enum/optional/nullable) so it works
 * across zod v3/v4.
 */

import { z } from "zod";
import { TRIGGER_TYPES } from "@/types/db";

export const triggerSchema = z.enum(
  TRIGGER_TYPES as unknown as [string, ...string[]],
);

/** POST /api/ingest — event meta + optional small base64 thumbnail. */
export const ingestSchema = z.object({
  detected_at: z.string().min(1).optional(),
  detected_epoch: z.number().int().nonnegative().optional(),
  time_synced: z.boolean().optional(),
  trigger: triggerSchema,
  score: z.number().int().min(0).max(100).optional(),
  hit_count: z.number().int().min(0).optional(),
  note: z.string().max(500).optional(),
  local_path: z.string().max(500).optional(),
  /** Small inline thumbnail (data URI or base64), tens of KB max. */
  thumb_b64: z.string().max(200_000).optional(),
});
export type IngestInput = z.infer<typeof ingestSchema>;

/** POST /api/ingest/media/sign — request a signed upload URL. */
export const mediaSignSchema = z.object({
  event_id: z.string().min(1),
  kind: z.enum(["snapshot", "clip"]),
  content_type: z.string().min(1).max(120).optional(),
  ext: z.string().max(10).optional(),
});
export type MediaSignInput = z.infer<typeof mediaSignSchema>;

/** POST /api/ingest/media/complete — attach uploaded media URLs to an event. */
export const mediaCompleteSchema = z.object({
  event_id: z.string().min(1),
  snapshot_url: z.string().url().optional(),
  clip_url: z.string().url().optional(),
});
export type MediaCompleteInput = z.infer<typeof mediaCompleteSchema>;

/** POST /api/heartbeat — 1-minute status report. */
export const heartbeatSchema = z.object({
  fw_version: z.string().max(50).optional(),
  rssi: z.number().int().optional(),
  sd_used_pct: z.number().int().min(0).max(100).optional(),
  time_synced: z.boolean().optional(),
  uptime_s: z.number().int().nonnegative().optional(),
  free_heap: z.number().int().nonnegative().optional(),
});
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

/** PATCH /api/events/[id] — protect / note / delete flags. */
export const eventPatchSchema = z
  .object({
    protected: z.boolean().optional(),
    note: z.string().max(500).nullable().optional(),
    deleted: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.protected !== undefined ||
      v.note !== undefined ||
      v.deleted !== undefined,
    { message: "적어도 하나의 필드를 지정해야 합니다." },
  );
export type EventPatchInput = z.infer<typeof eventPatchSchema>;

/** POST /api/devices — register a device. */
export const deviceCreateSchema = z.object({
  device_key: z.string().min(3).max(120),
  name: z.string().min(1).max(120),
  location: z.string().max(120).optional(),
});
export type DeviceCreateInput = z.infer<typeof deviceCreateSchema>;

/** POST /api/ota/publish — publish a firmware release. */
export const otaPublishSchema = z.object({
  version: z.string().min(1).max(50),
  url: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
  mandatory: z.boolean().optional(),
});
export type OtaPublishInput = z.infer<typeof otaPublishSchema>;

/** Convenience: turn a ZodError into a compact message string. */
export function zodMessage(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
