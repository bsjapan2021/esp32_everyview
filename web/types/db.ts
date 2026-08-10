/**
 * Database types — must match the Supabase Postgres schema exactly.
 *
 * devices( id uuid pk, device_key text unique, name text, location text, fw_version text,
 *          last_seen_at timestamptz, rssi int, sd_used_pct int, time_synced boolean, created_at timestamptz )
 * events( id uuid pk, device_id uuid fk->devices, detected_at timestamptz NOT NULL, detected_epoch bigint,
 *         time_synced boolean, trigger text in ('motion','pir','both','manual','schedule'), score int,
 *         hit_count int, snapshot_url text, thumb_url text, clip_url text, local_path text,
 *         protected boolean, note text, created_at timestamptz )
 */

export type TriggerType = "motion" | "pir" | "both" | "manual" | "schedule";

export const TRIGGER_TYPES: readonly TriggerType[] = [
  "motion",
  "pir",
  "both",
  "manual",
  "schedule",
] as const;

export interface Device {
  id: string;
  device_key: string;
  name: string;
  location: string | null;
  fw_version: string | null;
  last_seen_at: string | null; // ISO timestamptz
  rssi: number | null;
  sd_used_pct: number | null;
  time_synced: boolean;
  created_at: string; // ISO timestamptz
}

export interface EventRow {
  id: string;
  device_id: string;
  detected_at: string; // ISO timestamptz — NOT NULL
  detected_epoch: number | null; // bigint
  time_synced: boolean;
  trigger: TriggerType;
  score: number | null;
  hit_count: number | null;
  snapshot_url: string | null;
  thumb_url: string | null;
  clip_url: string | null;
  local_path: string | null;
  protected: boolean;
  note: string | null;
  created_at: string; // ISO timestamptz
}

/** An event joined with a small slice of its device (for list/detail rendering). */
export interface EventWithDevice extends EventRow {
  device?: Pick<Device, "id" | "name" | "location"> | null;
}
