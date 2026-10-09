-- ============================================================
-- Supabase Migration: 040_tiktok_hourly_ad.sql
-- Timing Heatmap: add ad_id/ad_name so a cell can say which video (ad) it's
-- coming from, not just which campaign.
--
-- fetchHourlyEngagement (lib/tiktok-ads.ts) now fetches at data_level
-- AUCTION_AD with ad_id as a dimension — one row per ad × hour. campaign_id /
-- campaign_name stay on the row (ad-level reports return them as metrics), so
-- campaign grouping keeps working.
--
-- Existing rows are per-campaign (ad_id = '') and would double-count against
-- the new per-ad rows (this table sums by weekday × hour). Same reasoning as
-- 039: it's a rolling 30-day sync cache, not source-of-truth history, so
-- clearing is safe — run /api/tiktok/sync-heatmap afterwards to repopulate.
-- ============================================================

alter table public.tiktok_hourly_stats
  add column if not exists ad_id   text not null default '',
  add column if not exists ad_name text not null default '';

delete from public.tiktok_hourly_stats;

alter table public.tiktok_hourly_stats
  drop constraint if exists tiktok_hourly_stats_unique;

alter table public.tiktok_hourly_stats
  add constraint tiktok_hourly_stats_unique unique (advertiser_id, ad_id, stat_time_hour);
