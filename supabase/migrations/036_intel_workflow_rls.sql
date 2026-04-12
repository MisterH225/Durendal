-- 036_intel_workflow_rls.sql
-- RLS policies for intel_* workflow tables (admin read + service role).

-- Enable RLS
do $$ begin alter table intel_entities                 enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_events                   enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_event_states             enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_event_context_snapshots  enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_event_signal_links       enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_question_event_links     enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_signal_entity_links      enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_recalculation_requests   enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_recalculation_jobs       enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_probability_change_log   enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_analyst_review_tasks     enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_veille_exports           enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_source_profiles          enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_workflow_events          enable row level security; exception when others then null; end $$;
do $$ begin alter table intel_workflow_failures        enable row level security; exception when others then null; end $$;

-- Admin read policy helper (superadmin profile)
do $$ begin
  drop policy if exists "intel admin read" on intel_events;
  create policy "intel admin read" on intel_events
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_entities;
  create policy "intel admin read" on intel_entities
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_event_states;
  create policy "intel admin read" on intel_event_states
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_event_context_snapshots;
  create policy "intel admin read" on intel_event_context_snapshots
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_event_signal_links;
  create policy "intel admin read" on intel_event_signal_links
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_question_event_links;
  create policy "intel admin read" on intel_question_event_links
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_signal_entity_links;
  create policy "intel admin read" on intel_signal_entity_links
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_recalculation_requests;
  create policy "intel admin read" on intel_recalculation_requests
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_recalculation_jobs;
  create policy "intel admin read" on intel_recalculation_jobs
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_probability_change_log;
  create policy "intel admin read" on intel_probability_change_log
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_analyst_review_tasks;
  create policy "intel admin read" on intel_analyst_review_tasks
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_veille_exports;
  create policy "intel admin read" on intel_veille_exports
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_source_profiles;
  create policy "intel admin read" on intel_source_profiles
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_workflow_events;
  create policy "intel admin read" on intel_workflow_events
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;

do $$ begin
  drop policy if exists "intel admin read" on intel_workflow_failures;
  create policy "intel admin read" on intel_workflow_failures
    for select
    using (exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'superadmin'
    ));
exception when others then null; end $$;
