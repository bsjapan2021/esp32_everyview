# ESP32CAM-Guard · Web Dashboard

Cloud dashboard for the **ESP32CAM-Guard** IoT surveillance system. ESP32-CAM
devices push detection events here; users review events, watch a LAN live feed,
manage devices, and roll out firmware.

Built with **Next.js (App Router) + TypeScript (strict) + Tailwind CSS +
Supabase + React Query + Recharts + lucide-react**. Dark-mode-first, mobile-first,
Korean UI. Detection time is treated as the primary piece of information
everywhere.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

The app runs **without any environment variables** — it renders realistic demo
(mock) data and shows an "unconfigured" notice. Configure Supabase to switch to
live data.

## Environment

Copy `.env.example` → `.env.local` and fill in values:

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Service role for ingest/write |
| `TELEGRAM_BOT_TOKEN` | server only | Telegram notifications |
| `INGEST_DEVICE_KEY_SALT` | server only | Device-key hashing salt |

Only `NEXT_PUBLIC_*` values reach the browser. Secrets are read solely in server
code (route handlers, server actions) and never bundled to the client.

## Build & deploy

```bash
npm run build        # type-checks + builds; never hits the network
npm start            # run the production server

vercel --prod        # deploy to Vercel (set env vars in the project settings)
```

Data pages use dynamic rendering so the build does not require Supabase
credentials.

## Data model (Supabase Postgres)

```sql
devices( id uuid pk, device_key text unique, name text, location text, fw_version text,
         last_seen_at timestamptz, rssi int, sd_used_pct int, time_synced boolean, created_at timestamptz );
events( id uuid pk, device_id uuid references devices, detected_at timestamptz not null, detected_epoch bigint,
        time_synced boolean, trigger text check (trigger in ('motion','pir','both','manual','schedule')),
        score int, hit_count int, snapshot_url text, thumb_url text, clip_url text, local_path text,
        protected boolean, note text, created_at timestamptz );
```

TypeScript mirrors of these live in `types/db.ts`.

## Pages

| Route | Description |
| --- | --- |
| `/` | Dashboard: device cards, recent thumbnails, 24h event chart |
| `/live` | LAN-direct MJPEG live view + camera controls |
| `/events` | Event timeline with filters, grid/list toggle, protect/delete |
| `/events/[id]` | Event detail: snapshot, clip, metadata, downloads, Telegram resend |
| `/settings` | Motion sensitivity, 8×6 mask grid, schedule, Telegram test |
| `/ota` | Firmware version status, update progress, release history |
| `/devices` | Register / list / delete devices |

## Device-facing API (all require `X-Device-Key`)

| Route | Purpose |
| --- | --- |
| `POST /api/ingest` | Create an event (meta + small thumbnail) |
| `POST /api/ingest/media/sign` | Signed Storage upload URL for originals |
| `POST /api/ingest/media/complete` | Attach uploaded media URLs to an event |
| `POST /api/heartbeat` | 1-min status; returns `{ commands: [] }` |

## Dashboard API

`GET /api/events`, `GET/PATCH /api/events/[id]`, `GET/POST /api/devices`,
`DELETE /api/devices/[id]`, `POST /api/ota/publish`.

All request bodies are validated with zod. Writes use a server-only
service-role Supabase client.
