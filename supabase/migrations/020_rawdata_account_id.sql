alter table public.ads_rawdata
  add column if not exists account_id text;

create index if not exists idx_ads_rawdata_account_id_new
  on public.ads_rawdata(account_id);
