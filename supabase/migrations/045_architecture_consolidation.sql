-- ============================================================================
-- 045: Architecture consolidation (Phase 0-2 from master architecture review)
-- ============================================================================

-- ── 1. FK on forecast_user_forecasts.user_id ────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'forecast_user_forecasts_user_id_fkey'
      AND table_name = 'forecast_user_forecasts'
  ) THEN
    ALTER TABLE forecast_user_forecasts
      ADD CONSTRAINT forecast_user_forecasts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 2. Merge intel_source_profiles into source_trust_profiles ───────────────
-- Copy any intel_source_profiles rows that don't exist in source_trust_profiles,
-- then add a trust_tier column to source_trust_profiles for intel-specific data.

ALTER TABLE source_trust_profiles
  ADD COLUMN IF NOT EXISTS trust_tier integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS intel_notes text;

INSERT INTO source_trust_profiles (
  provider_id, source_domain, source_name, trust_score, trust_tier
)
SELECT
  'newsdata'::text,
  isp.source_key,
  isp.source_key,
  round((COALESCE(isp.trust_tier, 3) - 1) * 0.25, 2),
  COALESCE(isp.trust_tier, 3)
FROM intel_source_profiles isp
WHERE NOT EXISTS (
  SELECT 1 FROM source_trust_profiles stp
  WHERE stp.source_domain = isp.source_key
)
ON CONFLICT DO NOTHING;

-- ── 3. Add market_probability to forecast_questions ─────────────────────────

ALTER TABLE forecast_questions
  ADD COLUMN IF NOT EXISTS market_probability double precision;

-- ── 4. Ingestion event types in queue (allow longer event_type values) ──────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'forecast_event_queue'
      AND column_name = 'event_type'
      AND character_maximum_length IS NOT NULL
      AND character_maximum_length < 100
  ) THEN
    ALTER TABLE forecast_event_queue
      ALTER COLUMN event_type TYPE varchar(100);
  END IF;
END $$;

-- ── 5. Index for market-question links lookup (used by blended recompute) ───

CREATE INDEX IF NOT EXISTS idx_market_question_links_question
  ON external_market_question_links (question_id)
  WHERE status = 'confirmed';
