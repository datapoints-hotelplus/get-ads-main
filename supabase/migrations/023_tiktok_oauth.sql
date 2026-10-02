-- ============================================================
-- Supabase Migration: 023_tiktok_oauth.sql
-- Real OAuth token storage (F01/F02/F03/F04) — mirrors the existing
-- fb_token_store singleton pattern (see 016_fb_token_store.sql).
-- ============================================================

create table if not exists public.tiktok_token_store (
  id                  int primary key default 1,
  access_token        text        not null,
  refresh_token       text,
  access_expires_at   timestamptz,
  refresh_expires_at  timestamptz,
  advertiser_ids      text[],
  refreshed_at        timestamptz not null default now(),
  -- F04: set once the "refresh token expiring soon" alert has fired, so we
  -- don't re-send it on every sync until the token is actually refreshed.
  expiry_alert_sent_at timestamptz,
  constraint tiktok_token_store_singleton check (id = 1)
);

-- RLS blocks anon/authenticated; service role (used by all server routes)
-- bypasses RLS automatically — same pattern as fb_token_store.
alter table public.tiktok_token_store enable row level security;
