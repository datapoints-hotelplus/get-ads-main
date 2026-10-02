-- ============================================================
-- Supabase Migration: 024_tiktok_quadrant_settings.sql
-- F17: admin-configurable Quadrant Matrix thresholds (singleton row,
-- same pattern as tiktok_token_store). NULL = use the auto-computed
-- default (median spend / mode-specific rate) instead of a fixed value.
-- ============================================================

create table if not exists public.tiktok_quadrant_settings (
  id                int primary key default 1,
  spend_threshold   numeric,
  rate_threshold    numeric,
  updated_at        timestamptz not null default now(),
  constraint tiktok_quadrant_settings_singleton check (id = 1)
);

alter table public.tiktok_quadrant_settings disable row level security;
