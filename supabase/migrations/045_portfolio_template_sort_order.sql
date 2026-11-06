-- Manual ordering of KPI templates (drag & drop in /admin/portfolio).
-- Existing rows keep their current created_at order.
alter table public.ads_portfolio_templates
  add column if not exists sort_order int not null default 0;

update public.ads_portfolio_templates t
set sort_order = r.rn
from (
  select id, row_number() over (order by created_at) as rn
  from public.ads_portfolio_templates
) r
where t.id = r.id;
