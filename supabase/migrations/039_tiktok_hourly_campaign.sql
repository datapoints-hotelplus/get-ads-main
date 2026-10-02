-- ============================================================
-- Supabase Migration: 039_tiktok_hourly_campaign.sql
-- F18: Timing Heatmap — add campaign_id/campaign_name so hovering a cell
-- can say which campaign it's coming from, not just the account total.
--
-- fetchHourlyEngagement (lib/tiktok-ads.ts) now fetches at data_level
-- AUCTION_CAMPAIGN with campaign_id as a dimension, instead of the
-- account-wide AUCTION_ADVERTISER level — one row per campaign × hour now,
-- not one row per hour.
--
-- Existing rows have no campaign_id (NULL) and would double-count against
-- the new per-campaign rows if left in place (this table sums by weekday ×
-- hour with no campaign filter) — they're a rolling 30-day sync cache, not
-- source-of-truth history, so clearing them is safe: the next
-- /api/tiktok/sync-heatmap run repopulates the full window.
-- ============================================================

alter table public.tiktok_hourly_stats
  add column if not exists campaign_id   text not null default '',
  add column if not exists campaign_name text not null default '';

delete from public.tiktok_hourly_stats;

alter table public.tiktok_hourly_stats
  drop constraint if exists tiktok_hourly_stats_unique;

alter table public.tiktok_hourly_stats
  add constraint tiktok_hourly_stats_unique unique (advertiser_id, campaign_id, stat_time_hour);
