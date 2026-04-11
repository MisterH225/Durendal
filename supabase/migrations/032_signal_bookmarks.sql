-- 032_signal_bookmarks.sql
-- Permet aux utilisateurs de suivre/sauvegarder des signaux

create table if not exists signal_bookmarks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  signal_id  uuid not null references forecast_signal_feed(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, signal_id)
);

create index if not exists idx_signal_bookmarks_user
  on signal_bookmarks(user_id, created_at desc);

create index if not exists idx_signal_bookmarks_signal
  on signal_bookmarks(signal_id);

-- RLS
alter table signal_bookmarks enable row level security;

drop policy if exists "Users can view own bookmarks" on signal_bookmarks;
create policy "Users can view own bookmarks"
  on signal_bookmarks for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own bookmarks" on signal_bookmarks;
create policy "Users can insert own bookmarks"
  on signal_bookmarks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own bookmarks" on signal_bookmarks;
create policy "Users can delete own bookmarks"
  on signal_bookmarks for delete
  using (auth.uid() = user_id);
