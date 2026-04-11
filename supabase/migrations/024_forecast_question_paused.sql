-- Statut "paused" : question masquée du public mais conservée pour l'éditorial

do $$ begin
  alter table forecast_questions drop constraint if exists forecast_questions_status_check;
exception when others then null;
end $$;

do $$ begin
  alter table forecast_questions
    add constraint forecast_questions_status_check
    check (status in ('draft','open','paused','closed','resolved_yes','resolved_no','annulled'));
exception when others then null;
end $$;

do $$ begin
  drop policy if exists "forecast public questions read" on forecast_questions;
  create policy "forecast public questions read" on forecast_questions
    for select using (status not in ('draft', 'paused'));
exception when others then null;
end $$;
