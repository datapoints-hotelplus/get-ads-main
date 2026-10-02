-- ============================================================
-- Supabase Migration: 015_tiktok_audience.sql
-- TikTok Audience demographics + campaign objective + extra metrics
-- ============================================================

-- 1. Add objective_type + follows to tiktok_ads_rawdata
alter table public.tiktok_ads_rawdata
  add column if not exists objective_type text,
  add column if not exists follows numeric not null default 0;

-- 2. Audience demographics (gender + age breakdown)
create table if not exists public.tiktok_audience_demographics (
  id              bigint generated always as identity primary key,
  advertiser_id   text not null,
  stat_time_day   date not null,
  dimension_type  text not null,        -- 'gender' | 'age'
  dimension_value text not null,        -- 'MALE' | 'FEMALE' | 'AGE_18_24' ...
  spend           numeric not null default 0,
  impressions     numeric not null default 0,
  reach           numeric not null default 0,
  video_views     numeric not null default 0,
  likes           numeric not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tiktok_audience_demographics_unique
    unique (advertiser_id, stat_time_day, dimension_type, dimension_value)
);

create index if not exists idx_tiktok_audience_demographics_day
  on public.tiktok_audience_demographics (stat_time_day desc);

create index if not exists idx_tiktok_audience_demographics_dim
  on public.tiktok_audience_demographics (dimension_type);

alter table public.tiktok_audience_demographics disable row level security;

-- 3. Audience by location (Thailand provinces)
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

create index if not exists idx_tiktok_audience_locations_day
  on public.tiktok_audience_locations (stat_time_day desc);

create index if not exists idx_tiktok_audience_locations_province
  on public.tiktok_audience_locations (province_id);

alter table public.tiktok_audience_locations disable row level security;

-- 4. Campaign objective lookup (campaign_id → objective_type)
create table if not exists public.tiktok_campaigns (
  campaign_id     text primary key,
  advertiser_id   text not null,
  campaign_name   text,
  objective_type  text,
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tiktok_campaigns_advertiser
  on public.tiktok_campaigns (advertiser_id);

alter table public.tiktok_campaigns disable row level security;
