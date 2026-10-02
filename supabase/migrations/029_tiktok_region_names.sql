-- ============================================================
-- Supabase Migration: 029_tiktok_region_names.sql
-- Cache of TikTok region_id → Thai province name, so the audience-by-
-- province table/map doesn't show raw numeric codes when TikTok's AUDIENCE
-- report doesn't return province_name directly (it usually doesn't).
--
-- ⚠ UNVERIFIED — the fetch behind this (lib/tiktok-ads.ts fetchRegionNames)
-- is a best guess at TikTok's targeting/location lookup endpoint. If it's
-- wrong, the table just stays empty and province tables/maps fall back to
-- showing the numeric code, same as today — nothing else breaks.
-- ============================================================

create table if not exists public.tiktok_region_names (
  region_id   text primary key,
  region_name text not null,
  updated_at  timestamptz not null default now()
);

alter table public.tiktok_region_names disable row level security;
