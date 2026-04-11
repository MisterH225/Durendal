-- Commentaires publics sur les questions forecast (discussion courte)

create table if not exists forecast_question_comments (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references forecast_questions(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint forecast_question_comments_body_len check (char_length(trim(body)) > 0 and char_length(body) <= 2000)
);

create index if not exists idx_forecast_q_comments_question_created
  on forecast_question_comments (question_id, created_at desc);

do $$ begin alter table forecast_question_comments enable row level security; exception when others then null; end $$;

drop policy if exists "forecast comments read all" on forecast_question_comments;
create policy "forecast comments read all"
  on forecast_question_comments for select using (true);

drop policy if exists "forecast comments insert own" on forecast_question_comments;
create policy "forecast comments insert own"
  on forecast_question_comments for insert with check (auth.uid() = user_id);

drop policy if exists "forecast comments update own" on forecast_question_comments;
create policy "forecast comments update own"
  on forecast_question_comments for update using (auth.uid() = user_id);

drop policy if exists "forecast comments delete own" on forecast_question_comments;
create policy "forecast comments delete own"
  on forecast_question_comments for delete using (auth.uid() = user_id);
