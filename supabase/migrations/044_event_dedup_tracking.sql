-- ============================================================================
-- 044 — Event semantic dedup: merge log
-- Tracks when the question-generator merges a proposed event into an
-- existing one instead of creating a duplicate. Used for observability
-- and to tune the matching threshold over time.
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecast_event_merge_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_title     text        NOT NULL,
  matched_event_id uuid        REFERENCES forecast_events(id) ON DELETE SET NULL,
  channel_id       uuid        NOT NULL REFERENCES forecast_channels(id) ON DELETE CASCADE,
  confidence       real        NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  match_reason     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feml_channel   ON forecast_event_merge_log (channel_id, created_at DESC);
CREATE INDEX idx_feml_event     ON forecast_event_merge_log (matched_event_id);

ALTER TABLE forecast_event_merge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY svc_forecast_event_merge_log
  ON forecast_event_merge_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY read_forecast_event_merge_log
  ON forecast_event_merge_log FOR SELECT TO authenticated
  USING (true);
