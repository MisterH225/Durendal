-- 040_intel_recalc_correlation.sql
-- Corrélation transverse (signaux → recalcul → probabilités).

do $$ begin
  alter table intel_recalculation_requests add column correlation_id uuid;
exception when duplicate_column then null;
end $$;

create index if not exists idx_intel_recalc_correlation
  on intel_recalculation_requests(correlation_id);
