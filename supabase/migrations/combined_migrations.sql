-- ============================================================
-- Combined Supabase Migration: All migrations merged
-- Project: get-ads Facebook Ads Dashboard
-- ============================================================
-- This file combines all migrations from 001 to 008
-- Run this file against your Supabase project via:
--   Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. allpage
--    Stores the Facebook Ad Account list (managed by admin).
--    account_id is the Facebook act_XXXX identifier.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ads_allpage (
  id           bigint generated always as identity primary key,
  account_name text        not null,
  account_id   text        not null unique,   -- e.g. "act_123456789"
  is_active    boolean     not null default true,  -- false = skip sync
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. ads_rawdata
--    Raw Facebook Ads Insights rows synced daily.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ads_rawdata (
  id                               bigint generated always as identity primary key,
  account_name                     text,
  account_id                       text,
  campaign_name                    text,
  campaign_id                      text,
  adset_name                       text,
  adset_id                         text,
  ad_name                          text,
  ad_id                            text,
  date_start                       date,
  date_stop                        date,
  impressions                      numeric default 0,
  inline_link_clicks               numeric default 0,
  unique_inline_link_clicks        numeric default 0,
  reach                            numeric default 0,
  spend                            numeric default 0,
  purchases                        numeric default 0,
  purchase_value                   numeric default 0,
  leads                            numeric default 0,
  messaging_conversations_started  numeric default 0,
  post_shares                      numeric default 0,
  page_likes                       numeric default 0,
  cpc                              numeric default 0,
  ctr                              numeric default 0,
  cpm                              numeric default 0,
  frequency                        numeric default 0,
  clicks_all                       numeric default 0,  -- Added from migration 008
  created_at                       timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 3. users
--    App ads_users managed by the admin.
--    Passwords are hashed with scrypt (Node.js crypto module).
--    Format: "<salt_hex>:<hash_hex>"
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ads_users (
  id            uuid        primary key default gen_random_uuid(),
  username      text        not null unique,
  password_hash text        not null,            -- scrypt: "salt:hash"
  display_name  text,
  role          text        not null default 'user',  -- Added from migration 004
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-update updated_at on changes
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.ads_users;
create trigger users_set_updated_at
  before update on public.ads_users
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. user_page_permissions
--    Defines which ad accounts (allpage.account_id) each user
--    is allowed to view on the dashboard.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ads_user_page_permissions (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references public.ads_users(id) on delete cascade,
  account_id text        not null references public.ads_allpage(account_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, account_id)
);

-- ─────────────────────────────────────────────────────────────
-- Campaign Highlight Metrics (from migration 002)
-- Admin can configure which metrics to highlight per campaign
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ads_campaign_highlights (
  id            bigint generated always as identity primary key,
  campaign_name text not null,
  metric_key    text not null,   -- e.g. "messages", "cost_per_message", "ctr", etc.
  created_at    timestamptz not null default now(),
  unique(campaign_name, metric_key)
);

create index if not exists idx_campaign_highlights_name
  on public.ads_campaign_highlights(campaign_name);

-- ─────────────────────────────────────────────────────────────
-- Additional tables assumed from migration 007 (ads_geo, ads_demographic, ads_device)
-- These are referenced in migration 007 but not created in earlier migrations
-- Adding them here for completeness
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ads_geo (
  id               bigint generated always as identity primary key,
  ad_id            text,
  date_start       date,
  region           text,
  impressions      numeric default 0,
  clicks           numeric default 0,
  clicks_all       numeric default 0,  -- Added from migration 008
  spend            numeric default 0,
  reach            numeric default 0,
  created_at       timestamptz not null default now()
);

create table if not exists public.ads_demographic (
  id               bigint generated always as identity primary key,
  ad_id            text,
  date_start       date,
  age              text,
  gender           text,
  impressions      numeric default 0,
  clicks           numeric default 0,
  clicks_all       numeric default 0,  -- Added from migration 008
  spend            numeric default 0,
  reach            numeric default 0,
  created_at       timestamptz not null default now()
);

create table if not exists public.ads_device (
  id               bigint generated always as identity primary key,
  ad_id            text,
  date_start       date,
  impression_device text,
  impressions      numeric default 0,
  clicks           numeric default 0,
  clicks_all       numeric default 0,  -- Added from migration 008
  spend            numeric default 0,
  reach            numeric default 0,
  created_at       timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- RPC to get distinct campaign names (from migration 006)
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_distinct_campaigns()
returns table(campaign_name text)
language sql stable as $
  select distinct campaign_name
  from public.ads_rawdata
  where campaign_name is not null
  order by campaign_name;
$;

-- ─────────────────────────────────────────────────────────────
-- Create admin user (from migration 005)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.ads_users (username, password_hash, display_name, role, is_active)
VALUES (
  'admin',
  '5d534611cb71e05a19b1944ffd560e74:614dbbca469481955e2db6fc012d6c67e3c448689e3410950a790e0ff40936b30db50b10ad81dc83091b2eda98c6f181bfbc7aafd095e17c12db85d7d03a37af',
  'Administrator',
  'admin',
  true
)
ON CONFLICT (username) DO UPDATE SET
  role = 'admin',
  password_hash = EXCLUDED.password_hash;

-- ─────────────────────────────────────────────────────────────
-- Indexes (from various migrations)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ads_rawdata_clicks_all
  ON public.ads_rawdata(clicks_all);

-- ─────────────────────────────────────────────────────────────
-- Note: Migration 007 (remove duplicates) is not included in this combined file
-- as it performs data cleanup that should only be run once on existing data.
-- If you need to clean duplicates, run the original 007_remove_duplicates.sql separately.
-- ─────────────────────────────────────────────────────────────