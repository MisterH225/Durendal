-- =============================================================
-- 016_forecast_foundation.sql
-- Forecast module: channels, events, questions, forecasts,
-- probability history, signal feed, async queue.
-- Fully idempotent — safe to re-run.
-- =============================================================

create table if not exists forecast_channels (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        unique not null,
  name        text        not null,
  description text,
  sort_order  int         not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists forecast_events (
  id          uuid        primary key default gen_random_uuid(),
  channel_id  uuid        not null references forecast_channels(id) on delete cascade,
  slug        text        unique not null,
  title       text        not null,
  description text,
  status      text        not null default 'active'
                check (status in ('draft','active','closed','archived')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  tags        text[]      not null default '{}',
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_forecast_events_channel on forecast_events(channel_id);
create index if not exists idx_forecast_events_status  on forecast_events(status);

create table if not exists forecast_questions (
  id                  uuid        primary key default gen_random_uuid(),
  event_id            uuid        not null references forecast_events(id) on delete cascade,
  channel_id          uuid        not null references forecast_channels(id) on delete cascade,
  slug                text        unique not null,
  title               text        not null,
  description         text,
  close_date          timestamptz not null,
  resolution_source   text        not null,
  resolution_criteria text        not null,
  resolution_url      text,
  status              text        not null default 'open'
                        check (status in ('draft','open','closed','resolved_yes','resolved_no','annulled')),
  resolved_at         timestamptz,
  resolved_by         uuid,
  resolution_notes    text,
  crowd_probability   real,
  ai_probability      real,
  blended_probability real,
  forecast_count      int         not null default 0,
  tags                text[]      not null default '{}',
  featured            boolean     not null default false,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_forecast_questions_event      on forecast_questions(event_id);
create index if not exists idx_forecast_questions_channel    on forecast_questions(channel_id);
create index if not exists idx_forecast_questions_status     on forecast_questions(status);
create index if not exists idx_forecast_questions_close_date on forecast_questions(close_date);
create index if not exists idx_forecast_questions_featured   on forecast_questions(featured) where featured = true;

create table if not exists forecast_user_forecasts (
  id          uuid    primary key default gen_random_uuid(),
  question_id uuid    not null references forecast_questions(id) on delete cascade,
  user_id     uuid    not null,
  probability real    not null check (probability >= 0 and probability <= 1),
  reasoning   text,
  revision    int     not null default 1,
  is_current  boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_forecast_user_forecasts_question on forecast_user_forecasts(question_id);
create index if not exists idx_forecast_user_forecasts_user     on forecast_user_forecasts(user_id);
create unique index if not exists idx_forecast_user_forecasts_current
  on forecast_user_forecasts(question_id, user_id) where is_current = true;

create table if not exists forecast_ai_forecasts (
  id          uuid    primary key default gen_random_uuid(),
  question_id uuid    not null references forecast_questions(id) on delete cascade,
  probability real    not null check (probability >= 0 and probability <= 1),
  confidence  text    not null default 'medium' check (confidence in ('low','medium','high')),
  model       text    not null default 'gemini-2.5-flash',
  reasoning   jsonb   not null default '{}',
  revision    int     not null default 1,
  is_current  boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_forecast_ai_forecasts_current
  on forecast_ai_forecasts(question_id) where is_current = true;

create table if not exists forecast_probability_history (
  id                  uuid  primary key default gen_random_uuid(),
  question_id         uuid  not null references forecast_questions(id) on delete cascade,
  crowd_probability   real,
  ai_probability      real,
  blended_probability real,
  forecast_count      int   not null default 0,
  snapshot_at         timestamptz not null default now()
);

create index if not exists idx_forecast_probability_history_question_snapshot
  on forecast_probability_history(question_id, snapshot_at desc);

create table if not exists forecast_signal_feed (
  id          uuid  primary key default gen_random_uuid(),
  question_id uuid  not null references forecast_questions(id) on delete cascade,
  event_id    uuid  references forecast_events(id) on delete set null,
  channel_id  uuid  references forecast_channels(id) on delete set null,
  signal_type text  not null check (signal_type in (
                      'probability_shift','crowd_ai_disagreement','ai_brief_update','resolution')),
  title       text  not null,
  summary     text,
  data        jsonb not null default '{}',
  severity    text  not null default 'info' check (severity in ('info','warning','critical')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_forecast_signal_feed_created_at on forecast_signal_feed(created_at desc);
create index if not exists idx_forecast_signal_feed_type       on forecast_signal_feed(signal_type);

create table if not exists forecast_event_queue (
  id             uuid  primary key default gen_random_uuid(),
  event_type     text  not null,
  correlation_id uuid,
  payload        jsonb not null,
  status         text  not null default 'pending'
                   check (status in ('pending','running','done','failed')),
  attempts       int   not null default 0,
  max_attempts   int   not null default 5,
  available_at   timestamptz not null default now(),
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_forecast_event_queue_pending
  on forecast_event_queue(status, available_at) where status in ('pending','running');

-- FK constraints to profiles (safe to skip if profiles absent)
do $$ begin
  alter table forecast_events    add constraint fk_forecast_events_created_by    foreign key (created_by) references profiles(id) on delete set null;
exception when others then null; end $$;
do $$ begin
  alter table forecast_questions add constraint fk_forecast_questions_created_by  foreign key (created_by)  references profiles(id) on delete set null;
exception when others then null; end $$;
do $$ begin
  alter table forecast_questions add constraint fk_forecast_questions_resolved_by foreign key (resolved_by) references profiles(id) on delete set null;
exception when others then null; end $$;

-- RLS
do $$ begin alter table forecast_channels         enable row level security; exception when others then null; end $$;
do $$ begin alter table forecast_events           enable row level security; exception when others then null; end $$;
do $$ begin alter table forecast_questions        enable row level security; exception when others then null; end $$;
do $$ begin alter table forecast_user_forecasts   enable row level security; exception when others then null; end $$;
do $$ begin alter table forecast_ai_forecasts     enable row level security; exception when others then null; end $$;
do $$ begin alter table forecast_probability_history enable row level security; exception when others then null; end $$;
do $$ begin alter table forecast_signal_feed      enable row level security; exception when others then null; end $$;
do $$ begin alter table forecast_event_queue      enable row level security; exception when others then null; end $$;

-- Policies
do $$ begin drop policy if exists "forecast public channels read"  on forecast_channels;  create policy "forecast public channels read"  on forecast_channels  for select using (is_active = true); exception when others then null; end $$;
do $$ begin drop policy if exists "forecast public events read"    on forecast_events;    create policy "forecast public events read"    on forecast_events    for select using (status in ('active','closed','archived')); exception when others then null; end $$;
do $$ begin drop policy if exists "forecast public questions read"  on forecast_questions; create policy "forecast public questions read"  on forecast_questions for select using (status <> 'draft'); exception when others then null; end $$;
do $$ begin drop policy if exists "forecast public probability history read" on forecast_probability_history; create policy "forecast public probability history read" on forecast_probability_history for select using (true); exception when others then null; end $$;
do $$ begin drop policy if exists "forecast public ai forecasts read" on forecast_ai_forecasts; create policy "forecast public ai forecasts read" on forecast_ai_forecasts for select using (is_current = true); exception when others then null; end $$;
do $$ begin drop policy if exists "forecast public signal feed read"  on forecast_signal_feed; create policy "forecast public signal feed read" on forecast_signal_feed for select using (true); exception when others then null; end $$;
do $$ begin drop policy if exists "forecast user forecasts read own"   on forecast_user_forecasts; create policy "forecast user forecasts read own"   on forecast_user_forecasts for select using (user_id = auth.uid()); exception when others then null; end $$;
do $$ begin drop policy if exists "forecast user forecasts insert own" on forecast_user_forecasts; create policy "forecast user forecasts insert own" on forecast_user_forecasts for insert with check (user_id = auth.uid()); exception when others then null; end $$;
do $$ begin drop policy if exists "forecast user forecasts update own" on forecast_user_forecasts; create policy "forecast user forecasts update own" on forecast_user_forecasts for update using (user_id = auth.uid()); exception when others then null; end $$;

-- Seed channels
insert into forecast_channels (slug, name, description, sort_order) values
  ('macro-commodities',       'Macro & Commodities',    'Macroéconomie, matières premières, politique monétaire', 1),
  ('politics-policy',         'Politics & Policy',      'Politique, régulation, géopolitique',                    2),
  ('tech-ai',                 'Tech & AI',              'Technologie, IA, régulation tech',                       3),
  ('agriculture-risk',        'Agriculture Risk',       'Risques agricoles et sécurité alimentaire',              4),
  ('climate',                 'Climate',                'Climat, transition énergétique, risques environnementaux',5),
  ('logistics',               'Logistics',              'Supply chain, transport et commerce',                    6),
  ('regional-business-events','Regional Business Events','Événements business régionaux',                         7)
on conflict (slug) do nothing;
