-- 034_signal_categories.sql
-- Ajoute la classification par catégorie métier aux signaux de veille
-- Les catégories sont libres, attribuées par l'IA lors de la collecte

-- 1. Colonne category (ex: Régulation, Vente, RSE, Livraison, Innovation…)
do $$ begin
  alter table signals add column category text;
exception when duplicate_column then null;
end $$;

-- 2. Index composite pour filtrage performant par veille + catégorie
create index if not exists idx_signals_watch_category
  on signals(watch_id, category);
