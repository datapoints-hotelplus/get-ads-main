-- ============================================================
-- Supabase Migration: 033_tiktok_alert_settings.sql
-- Admin-configurable alert email recipients (F04/F26/F27) — was a
-- hardcoded array in lib/email.ts, moved to a singleton row (same
-- pattern as tiktok_quadrant_settings) so admins can change it from
-- /tiktok/sync without a code deploy.
-- ============================================================

create table if not exists public.tiktok_alert_settings (
  id          int primary key default 1,
  recipients  text[] not null default array['datapoints@hotelplus.asia', 'marcom@hotelplus.asia'],
  updated_at  timestamptz not null default now(),
  constraint tiktok_alert_settings_singleton check (id = 1)
);

insert into public.tiktok_alert_settings (id) values (1) on conflict (id) do nothing;

alter table public.tiktok_alert_settings disable row level security;
