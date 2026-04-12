-- ============================================================================
-- 041 — External multi-source ingestion layer
-- Tables for provider management, raw ingestion, normalized signals,
-- deduplication, source trust, prediction markets, and observability.
-- ============================================================================

-- ── Provider registry ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_source_providers (
  id               text        PRIMARY KEY,   -- e.g. 'newsdata', 'finlight', 'gdelt', 'polymarket', 'dome'
  display_name     text        NOT NULL,
  provider_type    text        NOT NULL       CHECK (provider_type IN ('news', 'financial_news', 'event_monitor', 'prediction_market', 'unified_market')),
  base_url         text,
  auth_strategy    text        NOT NULL       DEFAULT 'api_key' CHECK (auth_strategy IN ('api_key', 'none', 'oauth', 'custom')),
  is_enabled       boolean     NOT NULL       DEFAULT true,
  default_trust    real        NOT NULL       DEFAULT 0.5  CHECK (default_trust BETWEEN 0 AND 1),
  rate_limit_rpm   int,
  rate_limit_daily int,
  config           jsonb       NOT NULL       DEFAULT '{}',
  created_at       timestamptz NOT NULL       DEFAULT now(),
  updated_at       timestamptz NOT NULL       DEFAULT now()
);

INSERT INTO external_source_providers (id, display_name, provider_type, auth_strategy, default_trust, rate_limit_rpm, rate_limit_daily, config) VALUES
  ('newsdata',    'NewsData.io',  'news',              'api_key', 0.55, 30,  200,  '{"endpoints": ["latest", "archive", "crypto"]}'),
  ('finlight',    'Finlight',     'financial_news',    'api_key', 0.65, 60,  1000, '{"supports_websocket": true}'),
  ('gdelt',       'GDELT',        'event_monitor',     'none',    0.45, 120, null, '{"endpoints": ["doc", "geo", "timeline"]}'),
  ('polymarket',  'Polymarket',   'prediction_market',  'none',    0.70, 60,  null, '{"gamma_api": true}'),
  ('dome',        'Dome / Unified', 'unified_market',   'api_key', 0.60, 30,  null, '{"stub": true}')
ON CONFLICT (id) DO NOTHING;

-- ── Source-level trust profiles (per domain / publisher) ─────────────────────

CREATE TABLE IF NOT EXISTS source_trust_profiles (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       text        NOT NULL REFERENCES external_source_providers(id),
  source_domain     text        NOT NULL,
  source_name       text,
  trust_score       real        NOT NULL DEFAULT 0.5 CHECK (trust_score BETWEEN 0 AND 1),
  bias_label        text,
  language          text,
  geography_focus   text[],
  category_focus    text[],
  total_ingested    int         NOT NULL DEFAULT 0,
  total_deduped     int         NOT NULL DEFAULT 0,
  last_seen_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, source_domain)
);

CREATE INDEX idx_stp_provider    ON source_trust_profiles (provider_id);
CREATE INDEX idx_stp_domain      ON source_trust_profiles (source_domain);

-- ── Ingestion run tracking ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_ingestion_runs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      text        NOT NULL REFERENCES external_source_providers(id),
  flow_type        text        NOT NULL CHECK (flow_type IN ('news_general', 'news_financial', 'event_discovery', 'market_snapshot', 'backfill')),
  status           text        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  items_fetched    int         NOT NULL DEFAULT 0,
  items_normalized int         NOT NULL DEFAULT 0,
  items_deduped    int         NOT NULL DEFAULT 0,
  items_persisted  int         NOT NULL DEFAULT 0,
  errors           jsonb       NOT NULL DEFAULT '[]',
  cursor_state     jsonb,      -- provider pagination bookmark for next run
  duration_ms      int,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sir_provider_ts ON source_ingestion_runs (provider_id, started_at DESC);

-- ── Raw ingestion items (audit trail) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS raw_ingestion_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid        NOT NULL REFERENCES source_ingestion_runs(id) ON DELETE CASCADE,
  provider_id      text        NOT NULL REFERENCES external_source_providers(id),
  external_id      text,
  raw_payload      jsonb       NOT NULL,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  normalized       boolean     NOT NULL DEFAULT false,
  UNIQUE (provider_id, external_id)
);

CREATE INDEX idx_rii_run         ON raw_ingestion_items (run_id);
CREATE INDEX idx_rii_provider_ext ON raw_ingestion_items (provider_id, external_id);

-- ── Normalized external signals ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_signals (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         text         NOT NULL REFERENCES external_source_providers(id),
  external_id         text,
  raw_item_id         uuid         REFERENCES raw_ingestion_items(id) ON DELETE SET NULL,

  -- Content
  title               text         NOT NULL,
  summary             text,
  body_excerpt        text,
  url                 text,
  image_url           text,

  -- Temporal
  published_at        timestamptz,
  ingested_at         timestamptz  NOT NULL DEFAULT now(),

  -- Origin
  language            text,
  source_name         text,
  source_domain       text,
  authors             text[],

  -- Classification
  geography           text[],
  entity_tags         text[],
  category_tags       text[],
  sentiment           real          CHECK (sentiment IS NULL OR sentiment BETWEEN -1 AND 1),
  signal_type         text          NOT NULL DEFAULT 'news',
  source_type         text          NOT NULL DEFAULT 'article' CHECK (source_type IN ('article','wire','blog','social','government','market_data','event_detection','prediction_market')),

  -- Scoring
  trust_score         real          NOT NULL DEFAULT 0.5 CHECK (trust_score BETWEEN 0 AND 1),
  novelty_score       real          DEFAULT 0.5 CHECK (novelty_score IS NULL OR novelty_score BETWEEN 0 AND 1),
  relevance_score     real          DEFAULT 0.5 CHECK (relevance_score IS NULL OR relevance_score BETWEEN 0 AND 1),

  -- Market fields (nullable, only for prediction market signals)
  market_probability  real          CHECK (market_probability IS NULL OR market_probability BETWEEN 0 AND 1),
  market_volume       numeric,
  market_id           text,

  -- Linking
  event_link_status   text          NOT NULL DEFAULT 'pending' CHECK (event_link_status IN ('pending', 'linked', 'unlinked', 'rejected')),
  dedup_group_id      uuid,
  dedup_hash          text,

  -- Audit
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (provider_id, external_id)
);

CREATE INDEX idx_es_provider       ON external_signals (provider_id);
CREATE INDEX idx_es_published      ON external_signals (published_at DESC);
CREATE INDEX idx_es_signal_type    ON external_signals (signal_type);
CREATE INDEX idx_es_dedup_hash     ON external_signals (dedup_hash) WHERE dedup_hash IS NOT NULL;
CREATE INDEX idx_es_event_link     ON external_signals (event_link_status) WHERE event_link_status = 'pending';
CREATE INDEX idx_es_dedup_group    ON external_signals (dedup_group_id) WHERE dedup_group_id IS NOT NULL;
CREATE INDEX idx_es_url            ON external_signals (url) WHERE url IS NOT NULL;

-- ── Signal source links (preserves multi-source provenance) ──────────────────

CREATE TABLE IF NOT EXISTS signal_source_links (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id        uuid        NOT NULL REFERENCES external_signals(id) ON DELETE CASCADE,
  provider_id      text        NOT NULL REFERENCES external_source_providers(id),
  external_id      text,
  url              text,
  published_at     timestamptz,
  trust_score      real,
  raw_item_id      uuid        REFERENCES raw_ingestion_items(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal_id, provider_id, external_id)
);

CREATE INDEX idx_ssl_signal ON signal_source_links (signal_id);

-- ── Dedup groups ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS signal_dedup_groups (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_url    text,
  title_hash       text,
  representative_signal_id uuid REFERENCES external_signals(id) ON DELETE SET NULL,
  member_count     int         NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sdg_canonical ON signal_dedup_groups (canonical_url) WHERE canonical_url IS NOT NULL;
CREATE INDEX idx_sdg_title     ON signal_dedup_groups (title_hash)    WHERE title_hash IS NOT NULL;

-- ── Event link candidates (signal → forecast_event / intel_event) ────────────

CREATE TABLE IF NOT EXISTS event_link_candidates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id        uuid        NOT NULL REFERENCES external_signals(id) ON DELETE CASCADE,
  target_type      text        NOT NULL CHECK (target_type IN ('forecast_event', 'intel_event', 'forecast_question')),
  target_id        uuid        NOT NULL,
  confidence       real        NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  match_reason     text,
  status           text        NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'accepted', 'rejected')),
  reviewed_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signal_id, target_type, target_id)
);

CREATE INDEX idx_elc_signal  ON event_link_candidates (signal_id);
CREATE INDEX idx_elc_target  ON event_link_candidates (target_type, target_id);
CREATE INDEX idx_elc_pending ON event_link_candidates (status) WHERE status = 'candidate';

-- ── External markets (prediction markets) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_markets (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      text        NOT NULL REFERENCES external_source_providers(id),
  external_id      text        NOT NULL,
  title            text        NOT NULL,
  description      text,
  category         text,
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'resolved', 'archived')),
  url              text,
  image_url        text,
  end_date         timestamptz,
  outcomes         jsonb       NOT NULL DEFAULT '[]',
  tags             text[],
  volume           numeric,
  liquidity        numeric,
  last_probability real        CHECK (last_probability IS NULL OR last_probability BETWEEN 0 AND 1),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, external_id)
);

CREATE INDEX idx_em_provider   ON external_markets (provider_id);
CREATE INDEX idx_em_status     ON external_markets (status);
CREATE INDEX idx_em_category   ON external_markets (category);

-- ── Market snapshots (time series) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_market_snapshots (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id        uuid        NOT NULL REFERENCES external_markets(id) ON DELETE CASCADE,
  probability      real        NOT NULL CHECK (probability BETWEEN 0 AND 1),
  volume_24h       numeric,
  liquidity        numeric,
  outcomes_detail  jsonb,
  captured_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ems_market_ts ON external_market_snapshots (market_id, captured_at DESC);

-- ── Market ↔ Question linking ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_market_question_links (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id        uuid        NOT NULL REFERENCES external_markets(id) ON DELETE CASCADE,
  question_id      uuid        NOT NULL REFERENCES forecast_questions(id) ON DELETE CASCADE,
  match_confidence real        NOT NULL DEFAULT 0.5 CHECK (match_confidence BETWEEN 0 AND 1),
  match_method     text,
  status           text        NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'confirmed', 'rejected')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, question_id)
);

CREATE INDEX idx_emql_question ON external_market_question_links (question_id);
CREATE INDEX idx_emql_market   ON external_market_question_links (market_id);

-- ── Ingestion failures (dead letter) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingestion_failures (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      text        NOT NULL REFERENCES external_source_providers(id),
  run_id           uuid        REFERENCES source_ingestion_runs(id) ON DELETE SET NULL,
  error_code       text        NOT NULL,
  error_message    text,
  raw_payload      jsonb,
  retryable        boolean     NOT NULL DEFAULT true,
  retried_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_if_provider ON ingestion_failures (provider_id, created_at DESC);

-- ── Provider rate limit state ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_rate_limit_state (
  provider_id      text        PRIMARY KEY REFERENCES external_source_providers(id),
  window_start     timestamptz NOT NULL DEFAULT now(),
  requests_in_window int       NOT NULL DEFAULT 0,
  daily_start      date        NOT NULL DEFAULT CURRENT_DATE,
  requests_today   int         NOT NULL DEFAULT 0,
  is_throttled     boolean     NOT NULL DEFAULT false,
  throttled_until  timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── RLS policies (service role bypass) ───────────────────────────────────────

ALTER TABLE external_source_providers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_trust_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_ingestion_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_ingestion_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_signals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_source_links           ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_dedup_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_link_candidates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_markets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_market_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_market_question_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_failures            ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_rate_limit_state     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE (
    SELECT string_agg(
      format(
        'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'svc_' || t, t
      ), '; '
    )
    FROM unnest(ARRAY[
      'external_source_providers', 'source_trust_profiles',
      'source_ingestion_runs', 'raw_ingestion_items',
      'external_signals', 'signal_source_links',
      'signal_dedup_groups', 'event_link_candidates',
      'external_markets', 'external_market_snapshots',
      'external_market_question_links', 'ingestion_failures',
      'provider_rate_limit_state'
    ]) AS t
  );
END $$;

-- Public read for external_signals and external_markets (useful for frontend)
CREATE POLICY read_signals  ON external_signals        FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_markets  ON external_markets        FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_snaps    ON external_market_snapshots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_links    ON external_market_question_links FOR SELECT TO anon, authenticated USING (true);
