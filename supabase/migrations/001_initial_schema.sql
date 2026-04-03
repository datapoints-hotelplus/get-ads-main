-- ============================================================
-- Supabase Migration: 001_initial_schema.sql
-- Project: get-ads Facebook Ads Dashboard
-- ============================================================
-- Run this file against your Supabase project via:
--   Supabase Dashboard → SQL Editor → Run
--   or: supabase db push (if using Supabase CLI)
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
-- 5. user_access_logs
--    Records every time a user loads the dashboard or any
--    protected page (written by the logging API route).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ads_user_access_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references public.ads_users(id) on delete cascade,
  username    text        not null,
  page        text        not null,   -- e.g. "dashboard", "summary"
  ip_address  text,
  user_agent  text,
  accessed_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
create index if not exists idx_ads_rawdata_account_id
  on public.ads_rawdata(account_id);

create index if not exists idx_ads_rawdata_account_name
  on public.ads_rawdata(account_name);

create index if not exists idx_ads_rawdata_date_start
  on public.ads_rawdata(date_start);

create index if not exists idx_ads_rawdata_campaign_name
  on public.ads_rawdata(campaign_name);

create index if not exists idx_user_page_permissions_user_id
  on public.ads_user_page_permissions(user_id);

create index if not exists idx_user_access_logs_user_id
  on public.ads_user_access_logs(user_id);

create index if not exists idx_user_access_logs_accessed_at
  on public.ads_user_access_logs(accessed_at desc);

-- ─────────────────────────────────────────────────────────────
-- RPC helper used by the dashboard API (already in production)
-- ─────────────────────────────────────────────────────────────
create or replace function public.get_campaign_adset_pairs(p_account text default null)
returns table(campaign_name text, adset_name text)
language sql stable as $$
  select distinct campaign_name, adset_name
  from public.ads_rawdata
  where (p_account is null or account_name = p_account)
  order by campaign_name, adset_name;
$$;
