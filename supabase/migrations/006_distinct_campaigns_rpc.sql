-- RPC to get distinct campaign names (lightweight, no duplicates)
create or replace function public.get_distinct_campaigns()
returns table(campaign_name text)
language sql stable as $
  select distinct campaign_name
  from public.ads_rawdata
  where campaign_name is not null
  order by campaign_name;
$;
