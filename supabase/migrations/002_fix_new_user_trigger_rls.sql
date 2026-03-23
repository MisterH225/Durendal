-- ══════════════════════════════════════════════
-- Corrige la création profil + compte à l'inscription (Google / email)
-- Sur Supabase hosted, supabase_auth_admin doit pouvoir INSERT malgré le RLS.
-- ══════════════════════════════════════════════

-- Plans : lecture pour le rôle du pipeline Auth (en plus de anon/authenticated si déjà fait)
drop policy if exists "Lecture plans pour supabase_auth_admin" on public.plans;
create policy "Lecture plans pour supabase_auth_admin"
  on public.plans for select
  to supabase_auth_admin
  using (true);

-- Compte + profil : INSERT uniquement pour le pipeline Auth (pas les utilisateurs finaux)
drop policy if exists "Insert accounts for auth admin" on public.accounts;
create policy "Insert accounts for auth admin"
  on public.accounts for insert
  to supabase_auth_admin
  with check (true);

drop policy if exists "Insert profiles for auth admin" on public.profiles;
create policy "Insert profiles for auth admin"
  on public.profiles for insert
  to supabase_auth_admin
  with check (true);

-- Fonction : search_path explicite + schéma public (évite résolution ambiguë / RLS bizarre)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  free_plan_id uuid;
  new_account_id uuid;
begin
  select id into free_plan_id from public.plans where name = 'free' limit 1;
  if free_plan_id is null then
    raise exception 'Plan free introuvable';
  end if;

  insert into public.accounts (type, plan_id, subscription_status, trial_ends_at)
  values ('individual', free_plan_id, 'active', null)
  returning id into new_account_id;

  insert into public.profiles (id, account_id, email, full_name, role)
  values (
    new.id,
    new_account_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case
      when new.email = nullif(trim(current_setting('app.superadmin_email', true)), '')
      then 'superadmin'
      else 'individual'
    end
  );

  return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;
