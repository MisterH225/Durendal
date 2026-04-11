-- =============================================================
-- 029_resolution_engine.sql
-- Hybrid resolution engine: profiles, jobs, evidence, proposals,
-- disputes, audit log. Adds resolution metadata to forecast_questions.
-- Fully idempotent — safe to re-run.
-- =============================================================

-- ─── 1. New columns on forecast_questions ─────────────────────

do $$ begin
  alter table forecast_questions add column resolution_class text default 'B';
exception when duplicate_column then null; end $$;

do $$ begin
  alter table forecast_questions add column resolution_mode text default 'assisted';
exception when duplicate_column then null; end $$;

do $$ begin
  alter table forecast_questions add column resolve_after timestamptz;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table forecast_questions add column dispute_window_ends timestamptz;
exception when duplicate_column then null; end $$;

-- Extend status enum to include new resolution states
do $$ begin
  alter table forecast_questions drop constraint if exists forecast_questions_status_check;
  alter table forecast_questions add constraint forecast_questions_status_check
    check (status in (
      'draft','open','closed','paused',
      'resolved_yes','resolved_no','annulled','cancelled',
      'needs_review','disputed'
    ));
exception when others then null; end $$;

-- ─── 2. resolution_profiles ──────────────────────────────────

create table if not exists resolution_profiles (
  id                    uuid        primary key default gen_random_uuid(),
  question_id           uuid        not null unique references forecast_questions(id) on delete cascade,
  resolution_class      text        not null default 'B'
                          check (resolution_class in ('A','B','C')),
  resolution_mode       text        not null default 'assisted'
                          check (resolution_mode in ('auto','assisted','manual')),
  outcome_type          text        not null default 'binary'
                          check (outcome_type in ('binary','multi_choice','numeric_threshold','event_occurrence','official_declaration')),
  primary_source_type   text        check (primary_source_type in ('government','central_bank','election_commission','exchange_feed','news_publisher','press_release','regulator','analyst','ai_search')),
  primary_source_url    text,
  primary_source_config jsonb       not null default '{}',
  fallback_source_url   text,
  fallback_source_type  text        check (fallback_source_type in ('government','central_bank','election_commission','exchange_feed','news_publisher','press_release','regulator','analyst','ai_search')),
  resolve_after         timestamptz,
  resolve_deadline      timestamptz,
  threshold_value       real,
  threshold_operator    text        check (threshold_operator in ('gt','gte','lt','lte','eq')),
  tie_break_rule        text,
  cancellation_rule     text,
  ambiguity_rule        text,
  auto_resolve_eligible boolean     not null default false,
  requires_multi_source boolean     not null default false,
  min_source_confidence text        not null default 'high'
                          check (min_source_confidence in ('very_high','high','medium','low','very_low')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_resolution_profiles_question on resolution_profiles(question_id);
create index if not exists idx_resolution_profiles_class    on resolution_profiles(resolution_class);

-- ─── 3. resolution_jobs ──────────────────────────────────────

create table if not exists resolution_jobs (
  id                uuid        primary key default gen_random_uuid(),
  question_id       uuid        not null references forecast_questions(id) on delete cascade,
  profile_id        uuid        references resolution_profiles(id) on delete set null,
  status            text        not null default 'pending'
                      check (status in (
                        'pending','source_fetching','evidence_ready','proposal_pending',
                        'approved','rejected','disputed','finalized',
                        'annulled','cancelled','failed'
                      )),
  started_at        timestamptz,
  completed_at      timestamptz,
  proposed_outcome  text,
  confidence        real        check (confidence >= 0 and confidence <= 1),
  confidence_label  text        check (confidence_label in ('very_high','high','medium','low','very_low')),
  auto_resolved     boolean     not null default false,
  resolved_by       uuid,
  failure_reason    text,
  retry_count       int         not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_resolution_jobs_question on resolution_jobs(question_id);
create index if not exists idx_resolution_jobs_status   on resolution_jobs(status);
create index if not exists idx_resolution_jobs_pending  on resolution_jobs(status, created_at)
  where status in ('pending','source_fetching','evidence_ready','proposal_pending');

-- ─── 4. resolution_evidence ─────────────────────────────────

create table if not exists resolution_evidence (
  id                uuid        primary key default gen_random_uuid(),
  job_id            uuid        not null references resolution_jobs(id) on delete cascade,
  source_type       text        check (source_type in ('government','central_bank','election_commission','exchange_feed','news_publisher','press_release','regulator','analyst','ai_search')),
  source_url        text,
  source_trust      text        not null default 'indicative'
                      check (source_trust in ('authoritative','reliable','indicative','unverified')),
  title             text,
  extracted_text    text,
  raw_data          jsonb       not null default '{}',
  fetched_at        timestamptz not null default now(),
  is_stale          boolean     not null default false,
  confidence        text        not null default 'medium'
                      check (confidence in ('very_high','high','medium','low','very_low')),
  supports_outcome  text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_resolution_evidence_job on resolution_evidence(job_id);

-- ─── 5. resolution_proposals ────────────────────────────────

create table if not exists resolution_proposals (
  id                uuid        primary key default gen_random_uuid(),
  job_id            uuid        not null references resolution_jobs(id) on delete cascade,
  question_id       uuid        not null references forecast_questions(id) on delete cascade,
  proposed_outcome  text        not null,
  confidence        real        not null check (confidence >= 0 and confidence <= 1),
  rationale         text,
  evidence_summary  text,
  source_agreement  boolean     not null default true,
  fallback_checked  boolean     not null default false,
  status            text        not null default 'pending'
                      check (status in ('pending','approved','rejected','escalated')),
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  review_notes      text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_resolution_proposals_job      on resolution_proposals(job_id);
create index if not exists idx_resolution_proposals_question on resolution_proposals(question_id);
create index if not exists idx_resolution_proposals_status   on resolution_proposals(status)
  where status = 'pending';

-- ─── 6. resolution_disputes ─────────────────────────────────

create table if not exists resolution_disputes (
  id                uuid        primary key default gen_random_uuid(),
  question_id       uuid        not null references forecast_questions(id) on delete cascade,
  job_id            uuid        references resolution_jobs(id) on delete set null,
  filed_by          uuid        not null,
  reason            text        not null,
  evidence_url      text,
  status            text        not null default 'open'
                      check (status in ('open','under_review','upheld','rejected','withdrawn')),
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  resolution_notes  text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_resolution_disputes_question on resolution_disputes(question_id);
create index if not exists idx_resolution_disputes_status   on resolution_disputes(status)
  where status in ('open','under_review');

-- ─── 7. resolution_audit_log ────────────────────────────────

create table if not exists resolution_audit_log (
  id            uuid        primary key default gen_random_uuid(),
  question_id   uuid        not null references forecast_questions(id) on delete cascade,
  job_id        uuid        references resolution_jobs(id) on delete set null,
  action        text        not null,
  actor_type    text        not null default 'system'
                  check (actor_type in ('system','admin','user')),
  actor_id      uuid,
  details       jsonb       not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_resolution_audit_log_question on resolution_audit_log(question_id);
create index if not exists idx_resolution_audit_log_action   on resolution_audit_log(action);
create index if not exists idx_resolution_audit_log_created  on resolution_audit_log(created_at desc);

-- ─── 8. RLS ─────────────────────────────────────────────────

do $$ begin alter table resolution_profiles  enable row level security; exception when others then null; end $$;
do $$ begin alter table resolution_jobs      enable row level security; exception when others then null; end $$;
do $$ begin alter table resolution_evidence  enable row level security; exception when others then null; end $$;
do $$ begin alter table resolution_proposals enable row level security; exception when others then null; end $$;
do $$ begin alter table resolution_disputes  enable row level security; exception when others then null; end $$;
do $$ begin alter table resolution_audit_log enable row level security; exception when others then null; end $$;

-- Public read on proposals and audit log (transparency)
do $$ begin
  drop policy if exists "resolution_proposals_public_read" on resolution_proposals;
  create policy "resolution_proposals_public_read" on resolution_proposals
    for select using (status in ('approved','rejected','escalated'));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "resolution_audit_log_public_read" on resolution_audit_log;
  create policy "resolution_audit_log_public_read" on resolution_audit_log
    for select using (true);
exception when others then null; end $$;

-- Users can read disputes on questions they forecasted
do $$ begin
  drop policy if exists "resolution_disputes_read_own" on resolution_disputes;
  create policy "resolution_disputes_read_own" on resolution_disputes
    for select using (filed_by = auth.uid() or status in ('upheld','rejected'));
exception when others then null; end $$;

-- Users can file disputes on questions they forecasted
do $$ begin
  drop policy if exists "resolution_disputes_insert_own" on resolution_disputes;
  create policy "resolution_disputes_insert_own" on resolution_disputes
    for insert with check (filed_by = auth.uid());
exception when others then null; end $$;

-- Public read on resolution profiles (linked to public questions)
do $$ begin
  drop policy if exists "resolution_profiles_public_read" on resolution_profiles;
  create policy "resolution_profiles_public_read" on resolution_profiles
    for select using (true);
exception when others then null; end $$;

-- Public read on evidence for resolved jobs
do $$ begin
  drop policy if exists "resolution_evidence_public_read" on resolution_evidence;
  create policy "resolution_evidence_public_read" on resolution_evidence
    for select using (true);
exception when others then null; end $$;

-- Public read on jobs
do $$ begin
  drop policy if exists "resolution_jobs_public_read" on resolution_jobs;
  create policy "resolution_jobs_public_read" on resolution_jobs
    for select using (true);
exception when others then null; end $$;
