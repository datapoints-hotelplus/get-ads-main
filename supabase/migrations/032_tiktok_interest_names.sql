-- ============================================================
-- Supabase Migration: 032_tiktok_interest_names.sql
-- interest_category id → name lookup cache (mirrors
-- tiktok_region_names' shape/purpose exactly — see
-- lib/tiktok-ads.ts fetchInterestCategoryNames).
-- ============================================================

create table if not exists public.tiktok_interest_category_names (
  category_id   text primary key,
  category_name text not null,
  updated_at    timestamptz not null default now()
);

alter table public.tiktok_interest_category_names disable row level security;
