-- 033_signal_analysis.sql
-- Enrichit la table signals pour supporter l'analyse IA structurée
-- et les métadonnées étendues (pattern forecast_signal_feed.data)

-- 1. Colonne data JSONB flexible (image_url, article_body, ai_analysis, grounding_sources, etc.)
do $$ begin
  alter table signals add column data jsonb default '{}';
exception when duplicate_column then null;
end $$;

-- 2. Sévérité (high / medium / low)
do $$ begin
  alter table signals add column severity text default 'medium';
exception when duplicate_column then null;
end $$;

-- 3. Région géographique
do $$ begin
  alter table signals add column region text;
exception when duplicate_column then null;
end $$;

-- 4. Index pour performance
create index if not exists idx_signals_watch_collected
  on signals(watch_id, collected_at desc);

create index if not exists idx_signals_severity
  on signals(severity);

create index if not exists idx_signals_watch_processed
  on signals(watch_id, is_processed);
