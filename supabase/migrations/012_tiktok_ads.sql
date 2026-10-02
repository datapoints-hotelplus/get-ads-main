-- ============================================================
-- Supabase Migration: 012_tiktok_ads.sql
-- TikTok Ads raw data table
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. tiktok_advertisers
--    Stores the TikTok advertiser (ad account) list.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_advertisers (
  id               bigint generated always as identity primary key,
  advertiser_id    text        not null unique,
  advertiser_name  text        not null,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. tiktok_ads_rawdata
--    Raw TikTok Ads Insights rows (ad-level, daily).
--    Unique constraint on (advertiser_id, ad_id, stat_time_day)
--    for safe Upsert.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_ads_rawdata (
  id                  bigint generated always as identity primary key,
  advertiser_id       text        not null,
  advertiser_name     text,
  campaign_id         text,
  campaign_name       text,
  adgroup_id          text,
  adgroup_name        text,
  ad_id               text,
  ad_name             text,
  stat_time_day       date        not null,
  spend               numeric     not null default 0,
  impressions         numeric     not null default 0,
  reach               numeric     not null default 0,
  video_views         numeric     not null default 0,
  video_watched_2s    numeric     not null default 0,
  video_watched_6s    numeric     not null default 0,
  video_view_p50      numeric     not null default 0,
  video_view_p100     numeric     not null default 0,
  likes               numeric     not null default 0,
  comments            numeric     not null default 0,
  shares              numeric     not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint tiktok_ads_rawdata_unique unique (advertiser_id, ad_id, stat_time_day)
);

create index if not exists idx_tiktok_ads_rawdata_day
  on public.tiktok_ads_rawdata (stat_time_day desc);

create index if not exists idx_tiktok_ads_rawdata_advertiser
  on public.tiktok_ads_rawdata (advertiser_id);
