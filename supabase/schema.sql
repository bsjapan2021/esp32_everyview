-- ============================================================================
--  ESP32CAM-Guard — Supabase 스키마 (Postgres + Storage + RLS)  · PRD 5.5/5.6
--  적용:  Supabase Studio → SQL Editor 에 붙여넣기 실행, 또는
--         supabase db push (supabase CLI)
-- ============================================================================

-- ─── 확장 ───────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ─── devices ────────────────────────────────────────────────────────────────
create table if not exists public.devices (
  id            uuid primary key default gen_random_uuid(),
  device_key    text unique not null,
  name          text not null,
  location      text,
  fw_version    text,
  last_seen_at  timestamptz,
  rssi          int,
  sd_used_pct   int,
  time_synced   boolean default true,
  created_at    timestamptz default now()
);

-- ─── events ─────────────────────────────────────────────────────────────────
create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  device_id      uuid references public.devices(id) on delete cascade,
  detected_at    timestamptz not null,           -- ★ 필수: 감지 시각 (PRD FR-4.7)
  detected_epoch bigint not null,
  time_synced    boolean not null default true,  -- NTP 동기 여부
  trigger        text not null check (trigger in ('motion','pir','both','manual','schedule')),
  score          int,                            -- 변화 블록 비율 0~100
  hit_count      int default 1,
  snapshot_url   text,
  thumb_url      text,
  clip_url       text,
  local_path     text,                           -- SD 원본 경로
  protected      boolean default false,
  note           text,
  created_at     timestamptz default now()
);
create index if not exists idx_events_device_detected
  on public.events (device_id, detected_at desc);

-- ============================================================================
--  RLS — 모든 테이블 활성화 (PRD 5.6 / 비기능 보안)
--   · 대시보드(세션): Supabase Auth 인증 사용자만 SELECT/UPDATE
--   · 장치 인제스트(X-Device-Key): service_role 키를 쓰는 서버 라우트만 INSERT/UPDATE
--     (service_role 은 RLS 를 우회하므로 anon 직접 쓰기는 정책상 차단됨)
-- ============================================================================
alter table public.devices enable row level security;
alter table public.events  enable row level security;

-- 인증된 사용자(대시보드) 읽기
drop policy if exists devices_select_auth on public.devices;
create policy devices_select_auth on public.devices
  for select to authenticated using (true);

drop policy if exists events_select_auth on public.events;
create policy events_select_auth on public.events
  for select to authenticated using (true);

-- 인증된 사용자(대시보드) 수정 (보호/메모/삭제 표시)
drop policy if exists events_update_auth on public.events;
create policy events_update_auth on public.events
  for update to authenticated using (true) with check (true);

drop policy if exists devices_update_auth on public.devices;
create policy devices_update_auth on public.devices
  for update to authenticated using (true) with check (true);

-- anon 롤에는 어떤 정책도 부여하지 않음 → 익명 직접 접근 차단.
-- 장치 인제스트/하트비트는 Vercel 서버 라우트가 service_role 키로 수행(RLS 우회).

-- ============================================================================
--  Storage — 미디어 버킷(비공개) + 서명 URL (PRD 5.4/5.6)
--   버킷은 Studio 또는 아래로 생성. 공개 접근 없음 → 대시보드/장치 모두 서명 URL 사용.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- 버킷 객체는 기본적으로 RLS 로 보호됨. 서명 URL(createSignedUrl / createSignedUploadUrl)
-- 은 service_role 서버에서 발급하므로 별도 anon 정책 불필요(비공개 유지).

-- ============================================================================
--  보존/정리 크론 (PRD 5.6 / R12) — 무료 티어 스토리지 한계 대응
--   최근 7일 원본만 유지, 이전은 썸네일·메타만. pg_cron 사용 예시(옵션).
--   ※ pg_cron 미가용 환경이면 Vercel Cron(/api/cron/purge)으로 대체.
-- ============================================================================
-- create extension if not exists pg_cron;
-- select cron.schedule('media_retention', '0 3 * * *', $$
--   update public.events
--      set snapshot_url = null, clip_url = null
--    where detected_at < now() - interval '7 days'
--      and (snapshot_url is not null or clip_url is not null);
-- $$);
