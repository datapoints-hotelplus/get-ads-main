-- ============================================================
-- Combined Supabase Migration: TikTok Ads module
-- Project: get-ads TikTok Ads Dashboard
-- ============================================================
-- Merges migrations 012-039 (every tiktok_* file) into final-state
-- CREATE TABLE statements. prod.sql has zero tiktok_* tables today,
-- so this is the full first deploy of the module, not an incremental one.
-- Depends on public.ads_users (already live, from the Facebook ads
-- module) for the FK on tiktok_user_advertiser_permissions.
-- Run via: Supabase Dashboard -> SQL Editor -> Run
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. tiktok_advertisers  (012)
--    TikTok advertiser (ad account) list.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_advertisers (
  id               bigint generated always as identity primary key,
  advertiser_id    text        not null unique,
  advertiser_name  text        not null,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now()
);
alter table public.tiktok_advertisers disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 2. tiktok_ads_rawdata  (012, +015, +022)
--    Raw TikTok Ads Insights rows (ad-level, daily). Upsert key is
--    (advertiser_id, ad_id, stat_time_day).
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
  objective_type      text,                                -- 015
  follows             numeric     not null default 0,       -- 015
  clicks              numeric     not null default 0,       -- 022
  cpm                 numeric     not null default 0,       -- 022
  cpc                 numeric     not null default 0,       -- 022
  average_video_play  numeric     not null default 0,       -- 022
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint tiktok_ads_rawdata_unique unique (advertiser_id, ad_id, stat_time_day)
);
create index if not exists idx_tiktok_ads_rawdata_day on public.tiktok_ads_rawdata (stat_time_day desc);
create index if not exists idx_tiktok_ads_rawdata_advertiser on public.tiktok_ads_rawdata (advertiser_id);
alter table public.tiktok_ads_rawdata disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 3. tiktok_ad_creatives  (014, +027, +030)
--    Ad creative info: thumbnail, caption, Spark Ad link.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_ad_creatives (
  ad_id           text        primary key,
  advertiser_id   text        not null,
  video_id        text,
  video_cover_url text,
  caption         text,        -- 027
  create_time     timestamptz, -- 027
  duration        numeric,     -- 027
  tiktok_item_id  text,        -- 030: Spark Ad -> real post id (oEmbed link)
  updated_at      timestamptz not null default now()
);
create index if not exists idx_tiktok_ad_creatives_advertiser on public.tiktok_ad_creatives (advertiser_id);
alter table public.tiktok_ad_creatives disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 4. tiktok_audience_demographics  (015, +027, +037)
--    Gender/age breakdown + watch-depth counts.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_audience_demographics (
  id                bigint generated always as identity primary key,
  advertiser_id     text not null,
  stat_time_day     date not null,
  dimension_type    text not null,        -- 'gender' | 'age'
  dimension_value   text not null,        -- 'MALE' | 'FEMALE' | 'AGE_18_24' ...
  spend             numeric not null default 0,
  impressions       numeric not null default 0,
  reach             numeric not null default 0,
  video_views       numeric not null default 0,
  likes             numeric not null default 0,
  clicks            numeric not null default 0,  -- 027
  video_watched_2s  numeric not null default 0,  -- 037
  video_watched_6s  numeric not null default 0,  -- 037
  video_views_p50   numeric not null default 0,  -- 037
  video_views_p100  numeric not null default 0,  -- 037
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tiktok_audience_demographics_unique
    unique (advertiser_id, stat_time_day, dimension_type, dimension_value)
);
create index if not exists idx_tiktok_audience_demographics_day on public.tiktok_audience_demographics (stat_time_day desc);
create index if not exists idx_tiktok_audience_demographics_dim on public.tiktok_audience_demographics (dimension_type);
alter table public.tiktok_audience_demographics disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 5. tiktok_audience_locations  (015)
--    Audience by Thailand province.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_audience_locations (
  id              bigint generated always as identity primary key,
  advertiser_id   text not null,
  stat_time_day   date not null,
  province_id     text not null,
  province_name   text,
  spend           numeric not null default 0,
  impressions     numeric not null default 0,
  reach           numeric not null default 0,
  video_views     numeric not null default 0,
  likes           numeric not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tiktok_audience_locations_unique
    unique (advertiser_id, stat_time_day, province_id)
);
create index if not exists idx_tiktok_audience_locations_day on public.tiktok_audience_locations (stat_time_day desc);
create index if not exists idx_tiktok_audience_locations_province on public.tiktok_audience_locations (province_id);
alter table public.tiktok_audience_locations disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 6. tiktok_campaigns  (015)
--    campaign_id -> objective_type lookup.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_campaigns (
  campaign_id     text primary key,
  advertiser_id   text not null,
  campaign_name   text,
  objective_type  text,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_tiktok_campaigns_advertiser on public.tiktok_campaigns (advertiser_id);
alter table public.tiktok_campaigns disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 7. tiktok_sync_log  (022, +031)
--    One row per sync attempt; the "running" row doubles as the
--    concurrent-sync lock.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_sync_log (
  id                    bigint generated always as identity primary key,
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  status                text        not null default 'running', -- running | success | fail
  records_synced        integer     not null default 0,
  error_message         text,
  triggered_by          text        not null default 'manual',  -- manual | cron | n8n
  total_advertisers     integer,                       -- 031
  completed_advertisers integer     not null default 0, -- 031
  status_detail         text,                           -- 031
  created_at            timestamptz not null default now()
);
create index if not exists idx_tiktok_sync_log_started on public.tiktok_sync_log (started_at desc);
alter table public.tiktok_sync_log disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 8. tiktok_error_log  (022, +031)
--    One row per failed TikTok API call.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_error_log (
  id             bigint generated always as identity primary key,
  endpoint       text        not null,
  http_status    integer,
  error_message  text,
  error_category text,  -- 031: rate_limit | field_error | permission_denied | null
  created_at     timestamptz not null default now()
);
create index if not exists idx_tiktok_error_log_created on public.tiktok_error_log (created_at desc);
alter table public.tiktok_error_log disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 9. tiktok_token_store  (023)
--    OAuth token singleton. RLS stays ON (only table in this module
--    that does) — service role bypasses it, anon/authenticated must
--    not be able to read tokens.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_token_store (
  id                   int primary key default 1,
  access_token         text        not null,
  refresh_token        text,
  access_expires_at    timestamptz,
  refresh_expires_at   timestamptz,
  advertiser_ids       text[],
  refreshed_at         timestamptz not null default now(),
  expiry_alert_sent_at timestamptz,
  constraint tiktok_token_store_singleton check (id = 1)
);
alter table public.tiktok_token_store enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 10. tiktok_quadrant_settings  (024)
--     Admin-configurable Quadrant Matrix thresholds (singleton row).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_quadrant_settings (
  id              int primary key default 1,
  spend_threshold numeric,
  rate_threshold  numeric,
  updated_at      timestamptz not null default now(),
  constraint tiktok_quadrant_settings_singleton check (id = 1)
);
alter table public.tiktok_quadrant_settings disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 11. tiktok_hourly_stats  (025, +039)
--     Timing Heatmap: engagement by weekday x hour, per campaign.
--     Rolling 30-day sync cache, not source-of-truth history.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_hourly_stats (
  id             bigint generated always as identity primary key,
  advertiser_id  text        not null,
  stat_time_hour timestamptz not null,
  campaign_id    text        not null default '', -- 039
  campaign_name  text        not null default '', -- 039
  spend          numeric     not null default 0,
  impressions    numeric     not null default 0,
  video_views    numeric     not null default 0,
  likes          numeric     not null default 0,
  comments       numeric     not null default 0,
  shares         numeric     not null default 0,
  updated_at     timestamptz not null default now(),

  constraint tiktok_hourly_stats_unique unique (advertiser_id, campaign_id, stat_time_hour)
);
create index if not exists idx_tiktok_hourly_stats_hour on public.tiktok_hourly_stats (stat_time_hour desc);
alter table public.tiktok_hourly_stats disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 12. tiktok_business_snapshot  (026)
--     Daily snapshot of followers/likes/videos. Hits TikTok's Business
--     Account API (different surface from the Marketing/Ads API) and is
--     unverified against a live account — see /api/tiktok/sync-profile.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_business_snapshot (
  id              bigint generated always as identity primary key,
  advertiser_id   text        not null,
  business_id     text,
  snapshot_date   date        not null,
  followers_count numeric     not null default 0,
  likes_count     numeric     not null default 0,
  videos_count    numeric     not null default 0,
  created_at      timestamptz not null default now(),

  constraint tiktok_business_snapshot_unique unique (advertiser_id, snapshot_date)
);
alter table public.tiktok_business_snapshot disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 13. tiktok_audience_interests  (028)
--     Interest-category breakdown — unverified endpoint; stays empty
--     if TikTok rejects the dimension (sync just logs & continues).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_audience_interests (
  id                bigint generated always as identity primary key,
  advertiser_id     text        not null,
  stat_time_day     date        not null,
  interest_category text        not null,
  reach             numeric     not null default 0,
  impressions       numeric     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tiktok_audience_interests_unique unique (advertiser_id, stat_time_day, interest_category)
);
alter table public.tiktok_audience_interests disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 14. tiktok_region_names  (029)
--     region_id -> Thai province name cache.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_region_names (
  region_id   text primary key,
  region_name text not null,
  updated_at  timestamptz not null default now()
);
alter table public.tiktok_region_names disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 15. tiktok_metric_permissions  (031)
--     Metrics TikTok rejects per advertiser (permission_denied), so the
--     dashboard can say why a KPI is blank. Full delete+insert each sync.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_metric_permissions (
  advertiser_id text        not null,
  metric        text        not null,
  detected_at   timestamptz not null default now(),
  primary key (advertiser_id, metric)
);
alter table public.tiktok_metric_permissions disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 16. tiktok_sync_control  (031)
--     Singleton switch to pause sync when storage looks exhausted.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_sync_control (
  id           bigint primary key default 1,
  sync_paused  boolean     not null default false,
  pause_reason text,
  updated_at   timestamptz not null default now(),
  constraint tiktok_sync_control_singleton check (id = 1)
);
alter table public.tiktok_sync_control disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 17. tiktok_interest_category_names  (032)
--     interest_category id -> name cache (mirrors tiktok_region_names).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_interest_category_names (
  category_id   text primary key,
  category_name text not null,
  updated_at    timestamptz not null default now()
);
alter table public.tiktok_interest_category_names disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 18. tiktok_alert_settings  (033)
--     Admin-configurable alert email recipients (singleton row).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_alert_settings (
  id         int primary key default 1,
  recipients text[] not null default array['datapoints@hotelplus.asia', 'marcom@hotelplus.asia'],
  updated_at timestamptz not null default now(),
  constraint tiktok_alert_settings_singleton check (id = 1)
);
insert into public.tiktok_alert_settings (id) values (1) on conflict (id) do nothing;
alter table public.tiktok_alert_settings disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 19. tiktok_user_advertiser_permissions  (034)
--     Per-user advertiser visibility (mirrors ads_user_page_permissions
--     for Facebook). Requires public.ads_users to already exist.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_user_advertiser_permissions (
  id            bigint generated always as identity primary key,
  user_id       uuid        not null references public.ads_users(id) on delete cascade,
  advertiser_id text        not null references public.tiktok_advertisers(advertiser_id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique(user_id, advertiser_id)
);
alter table public.tiktok_user_advertiser_permissions disable row level security;

-- ─────────────────────────────────────────────────────────────
-- 20. tiktok-thumbnails storage bucket  (035)
--     Re-hosted thumbnails: TikTok's own cover/thumbnail URLs are
--     signed and expire ~2 days after issue.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('tiktok-thumbnails', 'tiktok-thumbnails', true)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 21-23. Organic totals from the Business Account API  (036)
--     These store TOTALS (paid + organic combined), not organic alone.
--     organic = total (these tables) - paid (tiktok_ads_rawdata), joined
--     on tiktok_ad_creatives.tiktok_item_id = item_id. No stored
--     "organic" column by design — it would go stale on re-sync/backfill.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tiktok_business_accounts (
  business_id   text        primary key,
  bc_id         text,
  username      text,
  display_name  text,
  profile_image text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.tiktok_account_totals_daily (
  id              bigint generated always as identity primary key,
  business_id     text        not null,
  stat_time_day   date        not null,
  video_views     numeric     not null default 0,
  profile_views   numeric     not null default 0,
  reach           numeric     not null default 0,
  likes           numeric     not null default 0,
  comments        numeric     not null default 0,
  shares          numeric     not null default 0,
  followers_count numeric     not null default 0,  -- snapshot: do NOT sum
  new_followers   numeric     not null default 0,  -- daily delta: summable
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tiktok_account_totals_daily_unique unique (business_id, stat_time_day)
);
create index if not exists idx_tiktok_account_totals_daily_day on public.tiktok_account_totals_daily (stat_time_day desc);

create table if not exists public.tiktok_post_totals (
  id                      bigint generated always as identity primary key,
  business_id             text        not null,
  item_id                 text        not null,
  caption                 text,
  thumbnail_url           text,
  share_url               text,
  create_time             timestamptz,
  video_duration          numeric,
  video_views             numeric     not null default 0,
  reach                   numeric     not null default 0,
  likes                   numeric     not null default 0,
  comments                numeric     not null default 0,
  shares                  numeric     not null default 0,
  full_video_watched_rate numeric,
  average_time_watched    numeric,
  total_time_watched      numeric,
  impression_sources      jsonb,       -- for-you/follow/search breakdown
  fetched_at              timestamptz not null default now(),

  constraint tiktok_post_totals_unique unique (business_id, item_id)
);
create index if not exists idx_tiktok_post_totals_views on public.tiktok_post_totals (video_views desc);
create index if not exists idx_tiktok_post_totals_item on public.tiktok_post_totals (item_id);

alter table public.tiktok_business_accounts    disable row level security;
alter table public.tiktok_account_totals_daily disable row level security;
alter table public.tiktok_post_totals          disable row level security;
