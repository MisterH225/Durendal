-- 028: Pondération régionale de la collecte de contenu
-- Permet à l'admin d'ajuster le volume de collecte par région du monde
-- et à l'utilisateur de voir en priorité sa région.

-- 1. Table des poids régionaux
create table if not exists forecast_region_weights (
  id          uuid        primary key default gen_random_uuid(),
  region_code text        not null unique,
  label_fr    text        not null,
  label_en    text        not null,
  weight      int         not null default 10 check (weight >= 0 and weight <= 100),
  is_active   boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

-- Seed régions par défaut
insert into forecast_region_weights (region_code, label_fr, label_en, weight, sort_order) values
  ('africa',      'Afrique',      'Africa',      30, 1),
  ('middle-east', 'Moyen-Orient', 'Middle East', 15, 2),
  ('asia',        'Asie',         'Asia',        15, 3),
  ('europe',      'Europe',       'Europe',      15, 4),
  ('americas',    'Amériques',    'Americas',    15, 5),
  ('global',      'Mondial',      'Global',      10, 6)
on conflict (region_code) do nothing;

-- RLS : lecture publique
alter table forecast_region_weights enable row level security;
do $$ begin
  create policy "region_weights_read_all" on forecast_region_weights for select using (true);
exception when duplicate_object then null;
end $$;

-- 2. Colonne region sur forecast_questions
do $$ begin
  alter table forecast_questions add column region text;
exception when duplicate_column then null;
end $$;

-- 3. Colonne region sur forecast_signal_feed
do $$ begin
  alter table forecast_signal_feed add column region text;
exception when duplicate_column then null;
end $$;

-- 4. Colonne region sur profiles (préférence utilisateur)
do $$ begin
  alter table profiles add column region text;
exception when duplicate_column then null;
end $$;

-- Index pour tri rapide par région
create index if not exists idx_fq_region on forecast_questions(region);
create index if not exists idx_fsf_region on forecast_signal_feed(region);
