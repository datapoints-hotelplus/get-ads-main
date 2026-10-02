-- ============================================================
-- Supabase Migration: 022_tiktok_sync_resilience.sql
-- Sync/error logging (F09/F10/F28) + missing metric columns (F08)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. tiktok_sync_log — one row per sync attempt
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_sync_log (
  id             bigint generated always as identity primary key,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text        not null default 'running', -- running | success | fail
  records_synced integer     not null default 0,
  error_message  text,
  triggered_by   text        not null default 'manual',   -- manual | cron | n8n
  created_at     timestamptz not null default now()
);

create index if not exists idx_tiktok_sync_log_started
  on public.tiktok_sync_log (started_at desc);

alter table public.tiktok_sync_log disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 2. tiktok_error_log — one row per failed TikTok API call
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_error_log (
  id            bigint generated always as identity primary key,
  endpoint      text        not null,
  http_status   integer,
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tiktok_error_log_created
  on public.tiktok_error_log (created_at desc);

alter table public.tiktok_error_log disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 3. Missing performance metrics on tiktok_ads_rawdata (F08:
--    CPM, CPC, Avg. Watch Time)
-- ─────────────────────────────────────────────────────────────
alter table public.tiktok_ads_rawdata
  add column if not exists clicks              numeric not null default 0,
  add column if not exists cpm                 numeric not null default 0,
  add column if not exists cpc                 numeric not null default 0,
  add column if not exists average_video_play  numeric not null default 0;
