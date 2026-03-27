-- ── Migration 004 : corriger les FK watch_id sans ON DELETE CASCADE ──────────
-- Les tables alerts et chat_messages référencent watches(id) sans cascade,
-- ce qui bloque la suppression d'une veille si des alertes ou messages existent.

-- 1. alerts.watch_id → ON DELETE CASCADE
--    (les alertes d'une veille supprimée n'ont plus de sens)
alter table alerts
  drop constraint if exists alerts_watch_id_fkey;

alter table alerts
  add constraint alerts_watch_id_fkey
  foreign key (watch_id)
  references watches(id)
  on delete cascade;

-- 2. chat_messages.watch_id → ON DELETE SET NULL
--    (le contexte de veille est optionnel, le message peut rester)
alter table chat_messages
  drop constraint if exists chat_messages_watch_id_fkey;

alter table chat_messages
  add constraint chat_messages_watch_id_fkey
  foreign key (watch_id)
  references watches(id)
  on delete set null;
