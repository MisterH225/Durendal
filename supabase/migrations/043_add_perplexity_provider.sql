-- ============================================================================
-- 043 — Add Perplexity Sonar as ingestion provider
-- AI-powered real-time news search via Sonar API
-- ============================================================================

-- Extend provider_type CHECK to include 'ai_search'
ALTER TABLE external_source_providers
  DROP CONSTRAINT IF EXISTS external_source_providers_provider_type_check;

ALTER TABLE external_source_providers
  ADD CONSTRAINT external_source_providers_provider_type_check
  CHECK (provider_type IN ('news', 'financial_news', 'event_monitor', 'prediction_market', 'unified_market', 'ai_search'));

-- Seed the Perplexity provider
INSERT INTO external_source_providers
  (id, display_name, provider_type, base_url, auth_strategy, default_trust, rate_limit_rpm, rate_limit_daily, config)
VALUES
  ('perplexity', 'Perplexity Sonar', 'ai_search', 'https://api.perplexity.ai', 'api_key', 0.60, 20, 500,
   '{"model": "sonar", "search_context_size": "high", "search_recency_filter": "day"}')
ON CONFLICT (id) DO NOTHING;

-- Initialize rate limit state for Perplexity
INSERT INTO provider_rate_limit_state (provider_id)
VALUES ('perplexity')
ON CONFLICT (provider_id) DO NOTHING;
