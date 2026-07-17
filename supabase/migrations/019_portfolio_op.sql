-- Add operator columns to ads_portfolio_templates
-- green_op / yellow_op: one of '<', '<=', '>', '>='
-- Defaults match old direction-based logic:
--   higher_better → '>='  (value >= threshold = good)
--   lower_better  → '<='  (value <= threshold = good)
-- Existing rows keep their old behaviour via the defaults.

alter table ads_portfolio_templates
  add column if not exists green_op  text not null default '>='
    check (green_op  in ('<', '<=', '>', '>=')),
  add column if not exists yellow_op text not null default '>='
    check (yellow_op in ('<', '<=', '>', '>='));
