-- ============================================================
-- Supabase Migration: 025_tiktok_hourly_heatmap.sql
-- F14: Timing Heatmap — engagement by day-of-week × hour-of-day.
-- Synced on its own rolling-window schedule (every 12h, last 30 days),
-- separate from the main 24h ads sync — hourly-granularity pulls are much
-- more expensive against the API than daily ones.
-- ============================================================

create table if not exists public.tiktok_hourly_stats (
  id             bigint generated always as identity primary key,
  advertiser_id  text        not null,
  stat_time_hour timestamptz not null,
  spend          numeric     not null default 0,
  impressions    numeric     not null default 0,
  video_views    numeric     not null default 0,
  likes          numeric     not null default 0,
  comments       numeric     not null default 0,
  shares         numeric     not null default 0,
  updated_at     timestamptz not null default now(),

  constraint tiktok_hourly_stats_unique unique (advertiser_id, stat_time_hour)
);

create index if not exists idx_tiktok_hourly_stats_hour
  on public.tiktok_hourly_stats (stat_time_hour desc);

alter table public.tiktok_hourly_stats disable row level security;
