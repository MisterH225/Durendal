-- =============================================================
-- 017_forecast_scoring.sql
-- Brier scores par utilisateur et leaderboard agrégé.
-- Fully idempotent — safe to re-run.
-- =============================================================

-- ─── 1. Brier scores individuels ──────────────────────────────

create table if not exists forecast_brier_scores (
  id              uuid        primary key default gen_random_uuid(),
  question_id     uuid        not null references forecast_questions(id) on delete cascade,
  user_id         uuid        not null,
  -- Probabilité soumise par l'user au moment de la clôture (0–1)
  submitted_prob  real        not null check (submitted_prob >= 0 and submitted_prob <= 1),
  -- Résultat réel : 1 = YES, 0 = NO
  outcome         smallint    not null check (outcome in (0, 1)),
  -- Brier score = (submitted_prob - outcome)^2, entre 0 (parfait) et 1 (pire)
  brier_score     real        not null,
  -- Révision de forecast utilisé pour le calcul
  revision        int         not null default 1,
  scored_at       timestamptz not null default now()
);

create index if not exists idx_forecast_brier_scores_user
  on forecast_brier_scores(user_id, scored_at desc);
create index if not exists idx_forecast_brier_scores_question
  on forecast_brier_scores(question_id);
create unique index if not exists idx_forecast_brier_scores_unique
  on forecast_brier_scores(question_id, user_id);

-- ─── 2. Leaderboard agrégé (matérialisé manuellement) ─────────

create table if not exists forecast_leaderboard (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null unique,
  display_name         text        not null default 'Anonyme',
  -- Brier score moyen (plus bas = meilleur)
  avg_brier_score      real,
  -- Nombre de questions scorées
  questions_scored     int         not null default 0,
  -- Nombre de questions correctement prédites (brier < 0.25)
  good_predictions     int         not null default 0,
  -- Accuracy percentage (good_predictions / questions_scored)
  accuracy_pct         real,
  -- Rank (calculé au refresh)
  rank                 int,
  last_updated         timestamptz not null default now()
);

create index if not exists idx_forecast_leaderboard_rank
  on forecast_leaderboard(avg_brier_score asc)
  where avg_brier_score is not null;

-- ─── 3. RLS ───────────────────────────────────────────────────

do $$ begin
  alter table forecast_brier_scores enable row level security;
exception when others then null; end $$;

do $$ begin
  alter table forecast_leaderboard enable row level security;
exception when others then null; end $$;

do $$ begin
  drop policy if exists "forecast brier scores read own" on forecast_brier_scores;
  create policy "forecast brier scores read own"
    on forecast_brier_scores for select
    using (user_id = auth.uid());
exception when others then null; end $$;

do $$ begin
  drop policy if exists "forecast leaderboard public read" on forecast_leaderboard;
  create policy "forecast leaderboard public read"
    on forecast_leaderboard for select
    using (true);
exception when others then null; end $$;
