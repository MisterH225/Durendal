-- Aspects de surveillance par entreprise dans une veille
alter table watch_companies add column if not exists aspects text[] default '{}';

-- Enrichissement entreprises (logo, description) pour la désambiguïation
alter table companies add column if not exists logo_url text;
alter table companies add column if not exists description text;
