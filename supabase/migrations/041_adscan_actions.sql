-- ADSCAN: what a Marcom user did about an alert ("แก้แล้ว" / "ไม่แก้").
-- Alerts themselves are not stored — they're recomputed from ads_rawdata on
-- each request. One alert = one campaign, so campaign_id is the alert key.
create table if not exists public.adscan_actions (
  id           bigint generated always as identity primary key,
  campaign_id  text        not null,
  account_id   text        not null,             -- act_… (ads_allpage form), for scoping reads
  user_id      uuid        not null references public.ads_users(id) on delete cascade,
  type         text        not null check (type in ('fixed', 'skipped')),
  label        text        not null,
  metric       text        not null,             -- template metric at the time, e.g. cost_per_message
  value_at     numeric,                          -- the metric when the action was recorded, to measure the follow-up
  created_at   timestamptz not null default now()
);

create index if not exists idx_adscan_actions_account on public.adscan_actions(account_id, created_at desc);

alter table public.adscan_actions disable row level security;
