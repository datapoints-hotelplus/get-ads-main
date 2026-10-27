-- ============================================================
-- Supabase Migration: 043_adscan_settings.sql
-- Admin-editable ADSCAN settings (key/value). First use: the Slack Incoming
-- Webhook that /api/adscan/ai-run posts to when the daily AI run finishes
-- (keys: slack_webhook_url, slack_enabled).
--
-- The webhook URL is a secret (anyone holding it can post to the channel), so
-- RLS is on with no policies: only the service role (server) can read it,
-- same as fb_token_store.
-- ============================================================

create table if not exists public.adscan_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table public.adscan_settings enable row level security;
