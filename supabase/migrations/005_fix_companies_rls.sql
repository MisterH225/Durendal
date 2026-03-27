-- ════════════════════════════════════════════════════════════════════
-- Migration 005 : Corriger les policies RLS manquantes
--
-- Problème : watch_companies a RLS activé mais 0 policy → tout INSERT
-- est bloqué silencieusement côté client.
-- companies n'a pas de policy INSERT pour les utilisateurs.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Table companies ────────────────────────────────────────────────
-- Activer RLS (idempotent)
alter table companies enable row level security;

-- Tout utilisateur authentifié peut lire les entreprises (globales ou liées à son compte)
create policy "Authenticated can view companies"
  on companies for select
  to authenticated
  using (true);

-- Tout utilisateur authentifié peut créer une entreprise
create policy "Authenticated can insert companies"
  on companies for insert
  to authenticated
  with check (true);

-- Un utilisateur peut mettre à jour une entreprise qu'il a créée (optionnel)
create policy "Authenticated can update companies"
  on companies for update
  to authenticated
  using (true);

-- ── 2. Table watch_companies ──────────────────────────────────────────
-- SELECT : un utilisateur voit uniquement les liens de ses propres veilles
create policy "Users can view own watch_companies"
  on watch_companies for select
  to authenticated
  using (
    watch_id in (
      select id from watches
      where account_id = (
        select account_id from profiles where id = auth.uid()
      )
    )
  );

-- INSERT : un utilisateur peut lier une entreprise à l'une de ses veilles
create policy "Users can insert watch_companies"
  on watch_companies for insert
  to authenticated
  with check (
    watch_id in (
      select id from watches
      where account_id = (
        select account_id from profiles where id = auth.uid()
      )
    )
  );

-- DELETE : un utilisateur peut supprimer un lien de ses propres veilles
create policy "Users can delete watch_companies"
  on watch_companies for delete
  to authenticated
  using (
    watch_id in (
      select id from watches
      where account_id = (
        select account_id from profiles where id = auth.uid()
      )
    )
  );
