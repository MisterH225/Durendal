-- 035_intel_workflow_architecture.sql
-- Event-driven intelligence workflow: intel_events (state container), recalculation, causal probability log.
-- Namespaced intel_* to avoid collision with forecast_events (channel cycles) and signals (veille).
-- Idempotent blocks where possible.

-- ── Enums (as check constraints for portability) ─────────────────────────────

-- ── Entities (canonical actors: org, country, person) ─────────────────────
create table if not exists intel_entities (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null check (entity_type in ('organization','country','person','institution','commodity','other')),
  canonical_name  text not null,
  slug            text unique,
  external_ids    jsonb not null default '{}',
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_intel_entities_type on intel_entities(entity_type);
create index if not exists idx_intel_entities_name_lower on intel_entities(lower(canonical_name));

-- ── Intel Event: living state container for a real-world situation ──────────
create table if not exists intel_events (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  title             text not null,
  summary           text,
  status            text not null default 'active'
                    check (status in ('draft','active','cooling','resolved','archived')),
  severity          smallint not null default 2 check (severity between 1 and 5),
  primary_region    text,
  sectors           text[] not null default '{}',
  timeline_anchor   timestamptz,
  tags              text[] not null default '{}',
  forecast_channel_slug text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_intel_events_status on intel_events(status);
create index if not exists idx_intel_events_severity on intel_events(severity);
create index if not exists idx_intel_events_updated on intel_events(updated_at desc);

-- Append-only state versions
create table if not exists intel_event_states (
  id          uuid primary key default gen_random_uuid(),
  intel_event_id uuid not null references intel_events(id) on delete cascade,
  version     int not null,
  state       jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (intel_event_id, version)
);

create index if not exists idx_intel_event_states_event on intel_event_states(intel_event_id, version desc);

-- Append-only context snapshots for materiality + forecast inputs
create table if not exists intel_event_context_snapshots (
  id              uuid primary key default gen_random_uuid(),
  intel_event_id  uuid not null references intel_events(id) on delete cascade,
  snapshot        jsonb not null default '{}',
  summary         text,
  structured_facts jsonb not null default '{}',
  embedding_id    text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_intel_context_event_created on intel_event_context_snapshots(intel_event_id, created_at desc);

-- Link veille / platform signals to intel events (signals = veille-collected articles)
create table if not exists intel_event_signal_links (
  id               uuid primary key default gen_random_uuid(),
  intel_event_id   uuid not null references intel_events(id) on delete cascade,
  signal_id        uuid not null references signals(id) on delete cascade,
  link_confidence  real not null default 0.5 check (link_confidence >= 0 and link_confidence <= 1),
  link_reason      text,
  created_at       timestamptz not null default now(),
  unique (intel_event_id, signal_id)
);

create index if not exists idx_intel_event_signal_signal on intel_event_signal_links(signal_id);
create index if not exists idx_intel_event_signal_event on intel_event_signal_links(intel_event_id);

-- Bridge: forecast_questions ↔ intel_events (many-to-many)
create table if not exists intel_question_event_links (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references forecast_questions(id) on delete cascade,
  intel_event_id   uuid not null references intel_events(id) on delete cascade,
  weight           real not null default 1.0 check (weight > 0),
  created_at       timestamptz not null default now(),
  unique (question_id, intel_event_id)
);

create index if not exists idx_intel_qel_question on intel_question_event_links(question_id);
create index if not exists idx_intel_qel_event on intel_question_event_links(intel_event_id);

-- Optional: signal ↔ entity mentions
create table if not exists intel_signal_entity_links (
  signal_id    uuid not null references signals(id) on delete cascade,
  entity_id    uuid not null references intel_entities(id) on delete cascade,
  confidence   real not null default 0.5,
  role         text,
  primary key (signal_id, entity_id)
);

-- Recalculation pipeline
create table if not exists intel_recalculation_requests (
  id                   uuid primary key default gen_random_uuid(),
  idempotency_key      text not null unique,
  status               text not null default 'pending'
                       check (status in ('pending','processing','succeeded','skipped','failed','cancelled')),
  intel_event_id       uuid references intel_events(id) on delete set null,
  context_snapshot_id  uuid references intel_event_context_snapshots(id) on delete set null,
  question_ids         uuid[] not null default '{}',
  trigger_signal_ids   uuid[] not null default '{}',
  materiality_score    real,
  materiality_factors  jsonb not null default '[]',
  reason               text,
  skip_reason          text,
  requested_by         text default 'system',
  created_at           timestamptz not null default now(),
  processed_at         timestamptz,
  last_error           text
);

create index if not exists idx_intel_recalc_status_created on intel_recalculation_requests(status, created_at);
create index if not exists idx_intel_recalc_event on intel_recalculation_requests(intel_event_id);

create table if not exists intel_recalculation_jobs (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references intel_recalculation_requests(id) on delete cascade,
  question_id     uuid not null references forecast_questions(id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending','running','done','failed','dead')),
  attempts        int not null default 0,
  max_attempts    int not null default 5,
  available_at    timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (request_id, question_id)
);

create index if not exists idx_intel_recalc_jobs_pending on intel_recalculation_jobs(status, available_at)
  where status in ('pending','running');

-- Causal probability audit (extends forecast_probability_history with intel linkage)
create table if not exists intel_probability_change_log (
  id                       uuid primary key default gen_random_uuid(),
  question_id              uuid not null references forecast_questions(id) on delete cascade,
  recalculation_request_id uuid references intel_recalculation_requests(id) on delete set null,
  context_snapshot_id  uuid references intel_event_context_snapshots(id) on delete set null,
  trigger_signal_ids     uuid[] not null default '{}',
  ai_prev                real,
  ai_new                 real,
  crowd_prev             real,
  crowd_new              real,
  blended_prev           real,
  blended_new            real,
  change_reason          text not null,
  blend_formula_version  text,
  created_at             timestamptz not null default now()
);

create index if not exists idx_intel_prob_log_question on intel_probability_change_log(question_id, created_at desc);
create index if not exists idx_intel_prob_log_request on intel_probability_change_log(recalculation_request_id);

-- Analyst / ops
create table if not exists intel_analyst_review_tasks (
  id            uuid primary key default gen_random_uuid(),
  task_type     text not null check (task_type in (
                  'signal_link_ambiguous','probability_spike','contradiction','export_approval','manual_merge','other')),
  status        text not null default 'open' check (status in ('open','in_progress','resolved','dismissed')),
  priority      smallint not null default 2 check (priority between 1 and 5),
  ref_table     text,
  ref_id        uuid,
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid
);

create index if not exists idx_intel_analyst_open on intel_analyst_review_tasks(status, priority, created_at);

-- Veille export queue (intel-scoped)
create table if not exists intel_veille_exports (
  id            uuid primary key default gen_random_uuid(),
  watch_id      uuid,
  intel_event_id uuid references intel_events(id) on delete set null,
  status        text not null default 'pending'
                check (status in ('pending','approved','processing','failed','done')),
  format        text not null default 'json',
  artifact_url  text,
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_intel_veille_exports_status on intel_veille_exports(status, created_at);

-- Source trust profiles (optional; may mirror sources table)
create table if not exists intel_source_profiles (
  id            uuid primary key default gen_random_uuid(),
  source_key    text unique not null,
  trust_tier    smallint not null default 2 check (trust_tier between 1 and 5),
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Workflow audit / outbox (append-only)
create table if not exists intel_workflow_events (
  id               uuid primary key default gen_random_uuid(),
  topic            text not null,
  event_name       text not null,
  payload          jsonb not null default '{}',
  correlation_id   uuid,
  idempotency_key  text,
  producer         text not null default 'worker',
  occurred_at      timestamptz not null default now()
);

create index if not exists idx_intel_workflow_topic_time on intel_workflow_events(topic, occurred_at desc);
create unique index if not exists idx_intel_workflow_idempotency on intel_workflow_events(idempotency_key) where idempotency_key is not null;

create table if not exists intel_workflow_failures (
  id            uuid primary key default gen_random_uuid(),
  ref_table     text not null,
  ref_id        uuid,
  error_code    text,
  error_message text,
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_intel_workflow_failures_created on intel_workflow_failures(created_at desc);
