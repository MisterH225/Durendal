-- ============================================================================
-- 046 — Storyline Intelligence Engine
-- Core tables for the storyline feature: saved storylines, cards, edges,
-- snapshots (versioning), and per-card source evidence.
-- ============================================================================

-- ── Storylines (user-saved intelligence maps) ────────────────────────────────

CREATE TABLE IF NOT EXISTS storylines (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor_type       text        NOT NULL CHECK (anchor_type IN ('keyword', 'article', 'event', 'url')),
  anchor_ref        text        NOT NULL,
  anchor_title      text        NOT NULL,
  anchor_summary    text,
  status            text        NOT NULL DEFAULT 'building'
                    CHECK (status IN ('building', 'ready', 'stale', 'archived')),
  last_built_at     timestamptz,
  last_refreshed_at timestamptz,
  card_count        int         NOT NULL DEFAULT 0,
  metadata          jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_storylines_user      ON storylines (user_id, updated_at DESC);
CREATE INDEX idx_storylines_anchor    ON storylines (anchor_type, anchor_ref);
CREATE INDEX idx_storylines_status    ON storylines (status) WHERE status != 'archived';

-- ── Storyline cards (nodes in the visual storyline) ──────────────────────────

CREATE TABLE IF NOT EXISTS storyline_cards (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id       uuid        NOT NULL REFERENCES storylines(id) ON DELETE CASCADE,
  card_type          text        NOT NULL
                     CHECK (card_type IN ('event', 'article', 'signal', 'entity', 'outcome', 'context')),
  temporal_position  text        NOT NULL
                     CHECK (temporal_position IN ('deep_past', 'past', 'recent', 'anchor', 'concurrent', 'consequence', 'future')),
  title              text        NOT NULL,
  summary            text,
  date               date,
  confidence         real        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  probability        real        CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1)),
  probability_source text        CHECK (probability_source IS NULL OR probability_source IN ('ai_estimate', 'crowd', 'blended', 'market')),
  entities           text[]      NOT NULL DEFAULT '{}',
  region_tags        text[]      NOT NULL DEFAULT '{}',
  sector_tags        text[]      NOT NULL DEFAULT '{}',
  source_urls        text[]      NOT NULL DEFAULT '{}',
  platform_ref_type  text,
  platform_ref_id    uuid,
  importance         smallint    NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  metadata           jsonb       NOT NULL DEFAULT '{}',
  sort_order         int         NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_storyline_cards_storyline ON storyline_cards (storyline_id, sort_order);
CREATE INDEX idx_storyline_cards_position  ON storyline_cards (storyline_id, temporal_position);
CREATE INDEX idx_storyline_cards_platform  ON storyline_cards (platform_ref_type, platform_ref_id)
  WHERE platform_ref_id IS NOT NULL;

-- ── Storyline edges (causal / temporal links between cards) ──────────────────

CREATE TABLE IF NOT EXISTS storyline_edges (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id    uuid        NOT NULL REFERENCES storylines(id) ON DELETE CASCADE,
  source_card_id  uuid        NOT NULL REFERENCES storyline_cards(id) ON DELETE CASCADE,
  target_card_id  uuid        NOT NULL REFERENCES storyline_cards(id) ON DELETE CASCADE,
  relation_type   text        NOT NULL
                  CHECK (relation_type IN (
                    'causes', 'triggers', 'precedes', 'parallel', 'corollary',
                    'leads_to', 'contradicts', 'supports',
                    'raises_probability', 'lowers_probability'
                  )),
  confidence      real        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  explanation     text,
  is_trunk        boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_card_id, target_card_id, relation_type)
);

CREATE INDEX idx_storyline_edges_storyline ON storyline_edges (storyline_id);

-- ── Storyline snapshots (versioned state for "what changed") ─────────────────

CREATE TABLE IF NOT EXISTS storyline_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id  uuid        NOT NULL REFERENCES storylines(id) ON DELETE CASCADE,
  version       int         NOT NULL,
  cards_json    jsonb       NOT NULL DEFAULT '[]',
  edges_json    jsonb       NOT NULL DEFAULT '[]',
  narrative     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storyline_id, version)
);

CREATE INDEX idx_storyline_snapshots_storyline ON storyline_snapshots (storyline_id, version DESC);

-- ── Storyline card sources (evidence per card) ───────────────────────────────

CREATE TABLE IF NOT EXISTS storyline_card_sources (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id            uuid        NOT NULL REFERENCES storyline_cards(id) ON DELETE CASCADE,
  source_url         text,
  source_title       text,
  source_domain      text,
  excerpt            text,
  trust_score        real        CHECK (trust_score IS NULL OR (trust_score >= 0 AND trust_score <= 1)),
  is_platform_source boolean     NOT NULL DEFAULT false,
  platform_signal_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_storyline_card_sources_card ON storyline_card_sources (card_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE storylines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyline_cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyline_edges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyline_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyline_card_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE (
    SELECT string_agg(
      format(
        'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'svc_' || t, t
      ), '; '
    )
    FROM unnest(ARRAY[
      'storylines', 'storyline_cards', 'storyline_edges',
      'storyline_snapshots', 'storyline_card_sources'
    ]) AS t
  );
END $$;

CREATE POLICY read_own_storylines ON storylines
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY write_own_storylines ON storylines
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY read_storyline_cards ON storyline_cards
  FOR SELECT TO authenticated
  USING (storyline_id IN (SELECT id FROM storylines WHERE user_id = auth.uid()));

CREATE POLICY read_storyline_edges ON storyline_edges
  FOR SELECT TO authenticated
  USING (storyline_id IN (SELECT id FROM storylines WHERE user_id = auth.uid()));

CREATE POLICY read_storyline_snapshots ON storyline_snapshots
  FOR SELECT TO authenticated
  USING (storyline_id IN (SELECT id FROM storylines WHERE user_id = auth.uid()));

CREATE POLICY read_storyline_card_sources ON storyline_card_sources
  FOR SELECT TO authenticated
  USING (card_id IN (
    SELECT sc.id FROM storyline_cards sc
    JOIN storylines s ON sc.storyline_id = s.id
    WHERE s.user_id = auth.uid()
  ));
