-- ADSCAN Frequency (hotel level): the de-duplicated 7-day reach / impressions of
-- each account, fetched from Facebook when a data date is scanned. Frequency =
-- impressions ÷ reach, judged against the Portfolio "frequency" template.
-- Stored so opening ADSCAN never calls Facebook. The alert episodes themselves
-- live in adscan_alerts (campaign_id = 'freq-<account id>').
create table if not exists public.adscan_freq (
  account_id   text        not null,             -- bare id, as in ads_rawdata
  data_date    date        not null,             -- last day of the 7-day window
  reach        numeric     not null,
  impressions  numeric     not null,
  fetched_at   timestamptz not null default now(),
  primary key (account_id, data_date)
);

alter table public.adscan_freq disable row level security;
