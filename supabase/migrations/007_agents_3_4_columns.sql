-- ══════════════════════════════════════════════
-- Ajouts pour les Agents 3 (Analyse marché) et 4 (Stratégie)
-- ══════════════════════════════════════════════

-- Colonne source_name manquante sur signals (utilisée par collector-engine)
alter table signals add column if not exists source_name text;

-- Colonnes d'enrichissement sur reports pour les agents 3 et 4
alter table reports add column if not exists parent_report_id uuid references reports(id);
alter table reports add column if not exists charts jsonb default '[]';

-- Index pour chaîner les rapports
create index if not exists idx_reports_parent on reports(parent_report_id) where parent_report_id is not null;
create index if not exists idx_reports_watch_type on reports(watch_id, type);

-- Lier les recommandations à un rapport source
alter table recommendations add column if not exists report_id uuid references reports(id);
create index if not exists idx_recommendations_report on recommendations(report_id) where report_id is not null;
