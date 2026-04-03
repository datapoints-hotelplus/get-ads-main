-- ─────────────────────────────────────────────────────────────
-- Campaign Highlight Metrics
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
