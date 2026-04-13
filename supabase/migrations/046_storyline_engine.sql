-- ============================================================================
-- 046 — Storyline Engine
-- Replaces the in-memory-only graph explorer with a persistent, source-grounded
-- storyline system that supports temporal/causal linking, outcome predictions,
-- save/follow, and incremental updates.
-- ============================================================================

-- ── 1. canonical_entities ────────────────────────────────────────────────────
-- Extends intel_entities with aliases. We keep intel_entities as-is and add an
-- alias table for entity resolution.

CREATE TABLE IF NOT EXISTS entity_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid NOT NULL REFERENCES intel_entities(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  language    text DEFAULT 'fr',
  source      text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (entity_id, alias)
);
CREATE INDEX idx_entity_aliases_alias ON entity_aliases (lower(alias));
CREATE INDEX idx_entity_aliases_entity ON entity_aliases (entity_id);

-- ── 2. normalized_events ─────────────────────────────────────────────────────
-- A single canonical event row that multiple articles/signals can map to.
-- Bridges forecast_events, intel_events, and newly discovered events.

CREATE TABLE IF NOT EXISTS normalized_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  summary         text,
  event_type      text,  -- e.g. policy_change, conflict, market_move, election, etc.
  who             text[], -- entity names involved
  what            text,
  happened_at     timestamptz,
  where_geo       text[], -- countries/regions
  why             text,
  sectors         text[],
  tags            text[],
  confidence      real DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  importance      smallint DEFAULT 5 CHECK (importance >= 0 AND importance <= 10),
  -- Link to existing platform event tables (nullable — only set when bridging)
  forecast_event_id  uuid REFERENCES forecast_events(id) ON DELETE SET NULL,
  intel_event_id     uuid REFERENCES intel_events(id) ON DELETE SET NULL,
  -- Dedup
  dedup_hash      text,
  merged_into_id  uuid REFERENCES normalized_events(id) ON DELETE SET NULL,
  source_origin   text DEFAULT 'platform', -- platform | external_retrieval | ai_inferred
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_norm_events_happened ON normalized_events (happened_at DESC NULLS LAST);
CREATE INDEX idx_norm_events_type ON normalized_events (event_type);
CREATE INDEX idx_norm_events_dedup ON normalized_events (dedup_hash) WHERE dedup_hash IS NOT NULL;
CREATE INDEX idx_norm_events_forecast ON normalized_events (forecast_event_id) WHERE forecast_event_id IS NOT NULL;
CREATE INDEX idx_norm_events_intel ON normalized_events (intel_event_id) WHERE intel_event_id IS NOT NULL;

-- ── 3. event_evidence_links ──────────────────────────────────────────────────
-- Links normalized events to their source articles/signals (evidence).

CREATE TABLE IF NOT EXISTS event_evidence_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
  source_type     text NOT NULL, -- signal_feed | external_signal | veille_signal | url
  source_id       text,          -- ID in the source table (nullable for raw URLs)
  url             text,
  title           text,
  excerpt         text,
  trust_score     real DEFAULT 0.5,
  published_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (event_id, source_type, COALESCE(source_id, url))
);
CREATE INDEX idx_event_evidence_event ON event_evidence_links (event_id);

-- ── 4. event_entity_links ────────────────────────────────────────────────────
-- Links normalized events to canonical entities.

CREATE TABLE IF NOT EXISTS event_entity_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
  entity_id   uuid NOT NULL REFERENCES intel_entities(id) ON DELETE CASCADE,
  role        text, -- subject, object, affected, mentioned
  confidence  real DEFAULT 0.7,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (event_id, entity_id, role)
);
CREATE INDEX idx_event_entity_event ON event_entity_links (event_id);
CREATE INDEX idx_event_entity_entity ON event_entity_links (entity_id);

-- ── 5. event_relations ───────────────────────────────────────────────────────
-- Temporal, causal, and corollary relations between normalized events.

CREATE TABLE IF NOT EXISTS event_relations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id uuid NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
  target_event_id uuid NOT NULL REFERENCES normalized_events(id) ON DELETE CASCADE,
  relation_type   text NOT NULL, -- predecessor, successor, causes, caused_by, corollary, parallel, escalation, de_escalation, response_to, spillover
  confidence      real DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  explanation     text,
  evidence_basis  text[], -- supporting source URLs or IDs
  time_delta_days integer, -- approximate temporal distance (negative = before, positive = after)
  created_at      timestamptz DEFAULT now(),
  UNIQUE (source_event_id, target_event_id, relation_type)
);
CREATE INDEX idx_event_rel_source ON event_relations (source_event_id);
CREATE INDEX idx_event_rel_target ON event_relations (target_event_id);
CREATE INDEX idx_event_rel_type ON event_relations (relation_type);

-- ── 6. storylines ────────────────────────────────────────────────────────────
-- A saved storyline instance.

CREATE TABLE IF NOT EXISTS storylines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid, -- nullable for system-generated storylines
  title           text NOT NULL,
  description     text,
  anchor_event_id uuid REFERENCES normalized_events(id) ON DELETE SET NULL,
  -- Input that produced this storyline
  input_type      text NOT NULL, -- url | article_id | keyword | event_id | storyline_refresh
  input_value     text NOT NULL,
  -- Metadata
  status          text DEFAULT 'active', -- active | archived | deleted
  region          text,
  sectors         text[],
  tags            text[],
  -- Versioning
  version         integer DEFAULT 1,
  last_refreshed  timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_storylines_user ON storylines (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_storylines_anchor ON storylines (anchor_event_id) WHERE anchor_event_id IS NOT NULL;
CREATE INDEX idx_storylines_status ON storylines (status);

-- ── 7. storyline_cards ───────────────────────────────────────────────────────
-- Cards projected into a storyline (events, corollary events, outcomes).

CREATE TABLE IF NOT EXISTS storyline_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id    uuid NOT NULL REFERENCES storylines(id) ON DELETE CASCADE,
  event_id        uuid REFERENCES normalized_events(id) ON DELETE SET NULL,
  card_type       text NOT NULL, -- anchor | predecessor | successor | corollary | outcome | context
  -- Position in the storyline topology
  trunk_position  integer, -- ordinal on main trunk (null for branches)
  branch_id       text,    -- null for trunk, identifier for corollary branch
  -- Display
  label           text NOT NULL,
  summary         text,
  happened_at     timestamptz,
  -- For outcome cards
  probability     real CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1)),
  probability_source text, -- ai_estimate | community | blended | platform
  outcome_status  text,    -- pending | confirmed | failed | partially_confirmed
  -- Metadata
  importance      smallint DEFAULT 5,
  confidence      real DEFAULT 0.7,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_storyline_cards_storyline ON storyline_cards (storyline_id);
CREATE INDEX idx_storyline_cards_event ON storyline_cards (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_storyline_cards_type ON storyline_cards (storyline_id, card_type);

-- ── 8. storyline_edges ───────────────────────────────────────────────────────
-- Visual/logical edges between cards in a storyline.

CREATE TABLE IF NOT EXISTS storyline_edges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id    uuid NOT NULL REFERENCES storylines(id) ON DELETE CASCADE,
  source_card_id  uuid NOT NULL REFERENCES storyline_cards(id) ON DELETE CASCADE,
  target_card_id  uuid NOT NULL REFERENCES storyline_cards(id) ON DELETE CASCADE,
  edge_type       text NOT NULL, -- leads_to | causes | triggers | corollary_of | may_lead_to | response_to | parallel_to
  confidence      real DEFAULT 0.7,
  label           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (storyline_id, source_card_id, target_card_id, edge_type)
);
CREATE INDEX idx_storyline_edges_storyline ON storyline_edges (storyline_id);

-- ── 9. card_evidence ─────────────────────────────────────────────────────────
-- Source evidence attached to each card.

CREATE TABLE IF NOT EXISTS card_evidence (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid NOT NULL REFERENCES storyline_cards(id) ON DELETE CASCADE,
  url             text,
  title           text,
  source_name     text,
  excerpt         text,
  published_at    timestamptz,
  trust_score     real DEFAULT 0.5,
  -- Link to platform content
  platform_type   text, -- signal_feed | external_signal | veille_signal | forecast_question
  platform_id     text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_card_evidence_card ON card_evidence (card_id);

-- ── 10. outcome_predictions ──────────────────────────────────────────────────
-- Detailed outcome prediction tracking for outcome cards.

CREATE TABLE IF NOT EXISTS outcome_predictions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid NOT NULL REFERENCES storyline_cards(id) ON DELETE CASCADE,
  storyline_id    uuid NOT NULL REFERENCES storylines(id) ON DELETE CASCADE,
  description     text NOT NULL,
  probability     real NOT NULL CHECK (probability >= 0 AND probability <= 1),
  probability_source text DEFAULT 'ai_estimate',
  reasoning       text,
  evidence_for    text[],
  evidence_against text[],
  -- Resolution
  status          text DEFAULT 'pending', -- pending | confirmed | failed | partially_confirmed | superseded
  resolved_at     timestamptz,
  resolution_note text,
  -- Link to platform forecast if available
  forecast_question_id uuid REFERENCES forecast_questions(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_outcome_pred_card ON outcome_predictions (card_id);
CREATE INDEX idx_outcome_pred_storyline ON outcome_predictions (storyline_id);
CREATE INDEX idx_outcome_pred_status ON outcome_predictions (status);

-- ── 11. storyline_snapshots ──────────────────────────────────────────────────
-- Version snapshots for tracking evolution.

CREATE TABLE IF NOT EXISTS storyline_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id    uuid NOT NULL REFERENCES storylines(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  snapshot_data   jsonb NOT NULL, -- full serialized storyline state
  cards_count     integer,
  edges_count     integer,
  change_summary  text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_storyline_snap_storyline ON storyline_snapshots (storyline_id, version DESC);

-- ── 12. storyline_update_events ──────────────────────────────────────────────
-- Log of changes/updates to saved storylines.

CREATE TABLE IF NOT EXISTS storyline_update_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id    uuid NOT NULL REFERENCES storylines(id) ON DELETE CASCADE,
  event_type      text NOT NULL, -- card_added | card_updated | edge_added | probability_changed | outcome_resolved | refresh_complete
  payload         jsonb,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX idx_storyline_updates_storyline ON storyline_update_events (storyline_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE normalized_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE storylines ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyline_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyline_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyline_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyline_update_events ENABLE ROW LEVEL SECURITY;

-- Service role: full access on all tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'entity_aliases', 'normalized_events', 'event_evidence_links',
      'event_entity_links', 'event_relations', 'storylines',
      'storyline_cards', 'storyline_edges', 'card_evidence',
      'outcome_predictions', 'storyline_snapshots', 'storyline_update_events'
    ])
  LOOP
    EXECUTE format('CREATE POLICY svc_all_%I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

-- Authenticated users: read all events/relations/evidence (public intelligence)
CREATE POLICY auth_read_norm_events ON normalized_events FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_event_evidence ON event_evidence_links FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_event_entity ON event_entity_links FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_event_relations ON event_relations FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_entity_aliases ON entity_aliases FOR SELECT TO authenticated USING (true);

-- Storylines: users see own + system-generated
CREATE POLICY auth_read_storylines ON storylines FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY auth_insert_storylines ON storylines FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY auth_update_storylines ON storylines FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY auth_delete_storylines ON storylines FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Storyline children: access follows parent storyline
CREATE POLICY auth_read_cards ON storyline_cards FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM storylines s WHERE s.id = storyline_id AND (s.user_id = auth.uid() OR s.user_id IS NULL)));
CREATE POLICY auth_read_edges ON storyline_edges FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM storylines s WHERE s.id = storyline_id AND (s.user_id = auth.uid() OR s.user_id IS NULL)));
CREATE POLICY auth_read_card_evidence ON card_evidence FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM storyline_cards sc
    JOIN storylines s ON s.id = sc.storyline_id
    WHERE sc.id = card_id AND (s.user_id = auth.uid() OR s.user_id IS NULL)
  ));
CREATE POLICY auth_read_outcomes ON outcome_predictions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM storylines s WHERE s.id = storyline_id AND (s.user_id = auth.uid() OR s.user_id IS NULL)));
CREATE POLICY auth_read_snapshots ON storyline_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM storylines s WHERE s.id = storyline_id AND (s.user_id = auth.uid() OR s.user_id IS NULL)));
CREATE POLICY auth_read_updates ON storyline_update_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM storylines s WHERE s.id = storyline_id AND (s.user_id = auth.uid() OR s.user_id IS NULL)));
