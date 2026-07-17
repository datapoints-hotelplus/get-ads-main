create table ads_portfolio_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  metric      text not null,
  direction   text not null default 'higher_better' check (direction in ('higher_better', 'lower_better')),
  target      numeric,
  green_min   numeric,
  yellow_min  numeric,
  created_at  timestamptz not null default now()
);

create table ads_portfolio_profiles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table ads_portfolio_profile_accounts (
  profile_id  uuid references ads_portfolio_profiles(id) on delete cascade,
  account_id  text references ads_allpage(account_id) on delete cascade,
  primary key (profile_id, account_id)
);
