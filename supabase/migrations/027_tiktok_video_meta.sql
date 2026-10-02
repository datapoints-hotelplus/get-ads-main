-- ============================================================
-- Supabase Migration: 027_tiktok_video_meta.sql
-- Best Videos table needs caption/create_time/duration on top of the
-- thumbnail this app already stores. Fields fetched via /ad/get/ and
-- /file/video/ad/get/ — same endpoint family already in use, moderate (not
-- full) confidence on exact field names since it's new usage of them.
-- ============================================================

alter table public.tiktok_ad_creatives
  add column if not exists caption      text,
  add column if not exists create_time  timestamptz,
  add column if not exists duration     numeric;

-- Also add clicks to audience demographics — needed for the Age breakdown
-- table's CPC/CTR columns.
alter table public.tiktok_audience_demographics
  add column if not exists clicks numeric not null default 0;
