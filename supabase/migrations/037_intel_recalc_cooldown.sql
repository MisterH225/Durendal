-- 037_intel_recalc_cooldown.sql
-- Cooldown table to rate-limit intel recalculations per question.

create table if not exists intel_question_recalc_cooldown (
  question_id   uuid primary key references forecast_questions(id) on delete cascade,
  last_recalc_at timestamptz not null,
  updated_at    timestamptz not null default now()
);

create index if not exists idx_intel_recalc_cooldown_updated
  on intel_question_recalc_cooldown(updated_at desc);
