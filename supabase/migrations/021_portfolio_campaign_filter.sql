alter table public.ads_portfolio_templates
  add column if not exists campaign_filter text;
