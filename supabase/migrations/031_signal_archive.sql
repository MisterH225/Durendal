-- 031_signal_archive.sql
-- Permet l'archivage et la recherche thématique des signaux/articles.
-- Les signaux ne disparaissent plus : ils restent accessibles via recherche.

-- 1. Colonne tsvector pour la recherche plein texte
do $$ begin
  alter table forecast_signal_feed
    add column search_tsv tsvector
    generated always as (
      setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('french', coalesce(summary, '')), 'B')
    ) stored;
exception when duplicate_column then null;
end $$;

-- 2. Index GIN pour recherche rapide
create index if not exists idx_signal_feed_search_tsv
  on forecast_signal_feed using gin(search_tsv);

-- 3. Index composite (channel_id, created_at) pour filtres par canal + tri chronologique
create index if not exists idx_signal_feed_channel_created
  on forecast_signal_feed(channel_id, created_at desc);

-- 4. Index sur signal_type + created_at pour filtre par type
create index if not exists idx_signal_feed_type_created
  on forecast_signal_feed(signal_type, created_at desc);
