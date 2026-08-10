/**
 * Realistic mock data shown when Supabase is unconfigured, so the whole UI is
 * demonstrable without a database. Timestamps are generated relative to "now"
 * (per request) so relative-time labels like "3분 전" look natural.
 */

import type { Device, EventWithDevice, TriggerType } from "@/types/db";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Tiny inline SVG "camera snapshot" placeholder as a data URI (no network). */
function placeholderImage(label: string, tone: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${tone}'/><stop offset='1' stop-color='#0b1220'/>
    </linearGradient></defs>
    <rect width='640' height='480' fill='url(#g)'/>
    <circle cx='320' cy='200' r='70' fill='none' stroke='#e5e7eb' stroke-opacity='0.35' stroke-width='6'/>
    <rect x='250' y='300' width='140' height='90' rx='10' fill='#e5e7eb' fill-opacity='0.18'/>
    <text x='320' y='440' font-family='monospace' font-size='26' fill='#e5e7eb' fill-opacity='0.85' text-anchor='middle'>${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function mockDevices(now: number = Date.now()): Device[] {
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      device_key: "cam-front-a1b2c3",
      name: "현관 카메라",
      location: "1층 현관",
      fw_version: "1.4.2",
      last_seen_at: new Date(now - 25 * 1000).toISOString(),
      rssi: -58,
      sd_used_pct: 42,
      time_synced: true,
      created_at: new Date(now - 30 * 24 * HOUR).toISOString(),
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      device_key: "cam-garage-d4e5f6",
      name: "차고 카메라",
      location: "지하 주차장",
      fw_version: "1.4.2",
      last_seen_at: new Date(now - 40 * 1000).toISOString(),
      rssi: -72,
      sd_used_pct: 78,
      time_synced: true,
      created_at: new Date(now - 21 * 24 * HOUR).toISOString(),
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      device_key: "cam-yard-g7h8i9",
      name: "뒷마당 카메라",
      location: "후문 정원",
      fw_version: "1.3.9",
      last_seen_at: new Date(now - 47 * MIN).toISOString(), // offline (>3분)
      rssi: -88,
      sd_used_pct: 91,
      time_synced: false,
      created_at: new Date(now - 12 * 24 * HOUR).toISOString(),
    },
  ];
}

interface Seed {
  minsAgo: number;
  deviceIdx: 0 | 1 | 2;
  trigger: TriggerType;
  score: number;
  hit: number;
  hasClip: boolean;
  protectedFlag?: boolean;
  note?: string;
  synced?: boolean;
}

const SEEDS: Seed[] = [
  { minsAgo: 3, deviceIdx: 0, trigger: "motion", score: 92, hit: 7, hasClip: true, note: "현관 앞 움직임" },
  { minsAgo: 12, deviceIdx: 1, trigger: "pir", score: 64, hit: 3, hasClip: false },
  { minsAgo: 26, deviceIdx: 0, trigger: "both", score: 98, hit: 12, hasClip: true, protectedFlag: true, note: "택배 배송" },
  { minsAgo: 48, deviceIdx: 2, trigger: "motion", score: 71, hit: 5, hasClip: true, synced: false },
  { minsAgo: 73, deviceIdx: 1, trigger: "manual", score: 0, hit: 0, hasClip: false, note: "원격 확인" },
  { minsAgo: 95, deviceIdx: 0, trigger: "motion", score: 55, hit: 2, hasClip: false },
  { minsAgo: 140, deviceIdx: 2, trigger: "both", score: 88, hit: 9, hasClip: true },
  { minsAgo: 185, deviceIdx: 1, trigger: "schedule", score: 0, hit: 0, hasClip: true, note: "정기 스냅샷" },
  { minsAgo: 240, deviceIdx: 0, trigger: "pir", score: 60, hit: 4, hasClip: false },
  { minsAgo: 320, deviceIdx: 2, trigger: "motion", score: 79, hit: 6, hasClip: true, protectedFlag: true },
  { minsAgo: 410, deviceIdx: 1, trigger: "both", score: 95, hit: 11, hasClip: true },
  { minsAgo: 560, deviceIdx: 0, trigger: "motion", score: 48, hit: 2, hasClip: false, synced: false },
  { minsAgo: 700, deviceIdx: 2, trigger: "manual", score: 0, hit: 0, hasClip: true },
  { minsAgo: 880, deviceIdx: 1, trigger: "motion", score: 83, hit: 8, hasClip: true, note: "야간 이동 감지" },
  { minsAgo: 1150, deviceIdx: 0, trigger: "schedule", score: 0, hit: 0, hasClip: false },
];

const TONES = ["#1f3a5f", "#3a2f5f", "#1f5f4a"];

export function mockEvents(now: number = Date.now()): EventWithDevice[] {
  const devices = mockDevices(now);
  return SEEDS.map((s, i) => {
    const device = devices[s.deviceIdx];
    const detected = new Date(now - s.minsAgo * MIN);
    const tone = TONES[s.deviceIdx];
    const label = formatLabel(detected);
    return {
      id: `event-${String(i + 1).padStart(2, "0")}-0000-4000-8000-000000000000`,
      device_id: device.id,
      detected_at: detected.toISOString(),
      detected_epoch: Math.floor(detected.getTime() / 1000),
      time_synced: s.synced ?? true,
      trigger: s.trigger,
      score: s.score,
      hit_count: s.hit,
      snapshot_url: placeholderImage(label, tone),
      thumb_url: placeholderImage(label, tone),
      clip_url: s.hasClip ? "data:video/mp4;base64," : null,
      local_path: `/sdcard/DCIM/EV_${label.replace(/[: ]/g, "")}.jpg`,
      protected: s.protectedFlag ?? false,
      note: s.note ?? null,
      created_at: detected.toISOString(),
      device: { id: device.id, name: device.name, location: device.location },
    };
  });
}

function formatLabel(d: Date): string {
  // KST HH:MM label baked into the placeholder image.
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
