-- 027: Support des questions à choix multiple
-- question_type = 'binary' (défaut, OUI/NON) ou 'multi_choice' (2+ outcomes)

-- 1. Ajouter le type de question
do $$ begin
  alter table forecast_questions add column question_type text not null default 'binary';
exception when duplicate_column then null;
end $$;

-- 2. Table des outcomes (options) pour les questions multi-choice
create table if not exists forecast_question_outcomes (
  id                  uuid        primary key default gen_random_uuid(),
  question_id         uuid        not null references forecast_questions(id) on delete cascade,
  label               text        not null,
  sort_order          int         not null default 0,
  color               text,
  ai_probability      real,
  crowd_probability   real,
  blended_probability real,
  created_at          timestamptz not null default now()
);

create index if not exists idx_fqo_question on forecast_question_outcomes(question_id);

-- 3. Votes utilisateur par outcome
create table if not exists forecast_user_outcome_votes (
  id          uuid        primary key default gen_random_uuid(),
  outcome_id  uuid        not null references forecast_question_outcomes(id) on delete cascade,
  question_id uuid        not null references forecast_questions(id) on delete cascade,
  user_id     uuid        not null,
  probability real        not null check (probability >= 0 and probability <= 1),
  revision    int         not null default 1,
  is_current  boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_fuov_question on forecast_user_outcome_votes(question_id);
create index if not exists idx_fuov_outcome  on forecast_user_outcome_votes(outcome_id);
create index if not exists idx_fuov_user     on forecast_user_outcome_votes(user_id);
create unique index if not exists idx_fuov_current
  on forecast_user_outcome_votes(outcome_id, user_id) where is_current = true;

-- 4. RLS
alter table forecast_question_outcomes enable row level security;
alter table forecast_user_outcome_votes enable row level security;

-- Outcomes : lecture publique
do $$ begin
  create policy "outcomes_read_all" on forecast_question_outcomes for select using (true);
exception when duplicate_object then null;
end $$;

-- Votes : lecture publique, écriture authentifiée
do $$ begin
  create policy "outcome_votes_read_all" on forecast_user_outcome_votes for select using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "outcome_votes_insert_own" on forecast_user_outcome_votes
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "outcome_votes_update_own" on forecast_user_outcome_votes
    for update using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
