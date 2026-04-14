-- ============================================================================
-- 047 — Relation categories + outcome evidence
-- Adds relation_category column to storyline_edges, expands the relation_type
-- CHECK constraint to support the full two-layer relation taxonomy, and adds
-- evidence columns to storyline_cards for outcome cards.
-- ============================================================================

-- ── Add relation_category to storyline_edges ─────────────────────────────────

ALTER TABLE storyline_edges
  ADD COLUMN IF NOT EXISTS relation_category text;

ALTER TABLE storyline_edges
  ADD COLUMN IF NOT EXISTS causal_evidence text;

-- Drop old constraint, then add the expanded one
ALTER TABLE storyline_edges
  DROP CONSTRAINT IF EXISTS storyline_edges_relation_type_check;

ALTER TABLE storyline_edges
  ADD CONSTRAINT storyline_edges_relation_type_check CHECK (relation_type IN (
    'before', 'after', 'concurrent_with', 'immediate_precursor', 'long_term_precursor',
    'causes', 'contributes_to', 'enables', 'triggers', 'prevents',
    'background_context', 'related_to', 'same_storyline',
    'response_to', 'spillover_from', 'retaliation_to', 'market_reaction_to', 'policy_reaction_to', 'parallel_development',
    'may_lead_to', 'raises_probability_of', 'lowers_probability_of', 'outcome_of',
    'preceded_by', 'likely_cause',
    'precedes', 'parallel', 'corollary', 'leads_to',
    'contradicts', 'supports', 'raises_probability', 'lowers_probability'
  ));

ALTER TABLE storyline_edges
  DROP CONSTRAINT IF EXISTS storyline_edges_relation_category_check;

ALTER TABLE storyline_edges
  ADD CONSTRAINT storyline_edges_relation_category_check CHECK (
    relation_category IS NULL OR relation_category IN (
      'temporal', 'causal', 'contextual', 'corollary', 'outcome'
    )
  );

-- ── Add evidence columns to storyline_cards for outcome cards ────────────────

ALTER TABLE storyline_cards
  ADD COLUMN IF NOT EXISTS supporting_evidence jsonb DEFAULT '[]';

ALTER TABLE storyline_cards
  ADD COLUMN IF NOT EXISTS contradicting_evidence jsonb DEFAULT '[]';

ALTER TABLE storyline_cards
  ADD COLUMN IF NOT EXISTS outcome_status text;

ALTER TABLE storyline_cards
  DROP CONSTRAINT IF EXISTS storyline_cards_outcome_status_check;

ALTER TABLE storyline_cards
  ADD CONSTRAINT storyline_cards_outcome_status_check CHECK (
    outcome_status IS NULL OR outcome_status IN ('projected', 'verified', 'contradicted', 'expired')
  );

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_storyline_edges_category
  ON storyline_edges (storyline_id, relation_category)
  WHERE relation_category IS NOT NULL;
