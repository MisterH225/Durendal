-- ── Migration 003 : Observabilité agents + mémoire chat ──────────────────────
-- À exécuter dans Supabase SQL Editor

-- 1. signals : ajoute source_name (nom lisible de la source, sans jointure)
alter table signals add column if not exists source_name text;

-- 2. agent_jobs : ajoute metadata JSONB pour stocker les métriques de qualité
--    Structure attendue :
--    {
--      "signals_count": 12,
--      "grounding_sources": 8,
--      "avg_relevance": 0.74,
--      "duplicates_skipped": 2,
--      "breakdown": {"grounding": 8, "website": 2, "linkedin": 2}
--    }
alter table agent_jobs add column if not exists signals_count integer default 0;
alter table agent_jobs add column if not exists metadata jsonb;

-- 3. chat_messages : ajoute session_id pour regrouper les conversations
--    (optionnel, utile si on veut plusieurs fils de discussion)
alter table chat_messages add column if not exists session_id uuid;

-- Index pour retrouver les jobs avec le plus de signaux
create index if not exists idx_agent_jobs_signals_count on agent_jobs(signals_count desc);

-- Index sur source_name pour filtrer les signaux par source
create index if not exists idx_signals_source_name on signals(source_name);

-- Index sur session_id pour le chat
create index if not exists idx_chat_session on chat_messages(session_id);
