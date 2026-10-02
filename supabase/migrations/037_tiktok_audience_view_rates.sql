-- ============================================================
-- Supabase Migration: 037_tiktok_audience_view_rates.sql
-- Watch-depth counts on the Age/Gender breakdown, so "Detailed Analysis by
-- Age" can show how many people watched 2s / 6s / 50% / 100% and what share
-- of that age group's views each represents.
--
-- Confirmed live (2026-09-08) that report_type=AUDIENCE with the `age`
-- dimension accepts all four metrics and returns real non-zero values —
-- e.g. AGE_25_34 over Aug 2026: 161,704 views → 87,246 watched 2s (54.0%),
-- 7,921 watched 50% (4.9%). Same metric names the ad-level BASIC report
-- already uses in fetchAdInsights, so no new vocabulary here.
--
-- Rates are deliberately NOT stored: they're derived from these counts at
-- read time. A stored percentage would go stale the moment its underlying
-- counts get re-synced, and percentages can't be re-aggregated across rows
-- anyway (summing a date range means summing counts, then dividing once).
-- ============================================================

alter table public.tiktok_audience_demographics
  add column if not exists video_watched_2s  numeric not null default 0,
  add column if not exists video_watched_6s  numeric not null default 0,
  add column if not exists video_views_p50   numeric not null default 0,
  add column if not exists video_views_p100  numeric not null default 0;
