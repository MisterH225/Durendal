-- ============================================================
-- 014 — Pipeline agents Opportunités
-- Tables : discovered_sources, fetched_pages, extracted_signals,
--          opportunity_evidence
-- ============================================================

-- ── discovered_sources ──
CREATE TABLE IF NOT EXISTS discovered_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  watch_id uuid REFERENCES watches(id) ON DELETE CASCADE NOT NULL,
  query text NOT NULL,
  source_type text DEFAULT 'web',
  provider text DEFAULT 'perplexity',
  title text,
  url text NOT NULL,
  domain text,
  snippet text,
  relevance_score real DEFAULT 0.5,
  status text DEFAULT 'pending' CHECK (status IN ('pending','fetched','failed','skipped','duplicate')),
  discovered_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disc_src_account ON discovered_sources(account_id);
CREATE INDEX IF NOT EXISTS idx_disc_src_watch ON discovered_sources(watch_id);
CREATE INDEX IF NOT EXISTS idx_disc_src_status ON discovered_sources(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_disc_src_url_watch ON discovered_sources(watch_id, url);

-- ── fetched_pages ──
CREATE TABLE IF NOT EXISTS fetched_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  source_id uuid REFERENCES discovered_sources(id) ON DELETE SET NULL,
  url text NOT NULL,
  domain text,
  title text,
  published_at timestamptz,
  fetched_at timestamptz DEFAULT now(),
  extracted_text text,
  metadata jsonb DEFAULT '{}',
  fetch_status text DEFAULT 'success' CHECK (fetch_status IN ('success','failed','timeout','blocked')),
  content_hash text,
  word_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fetched_account ON fetched_pages(account_id);
CREATE INDEX IF NOT EXISTS idx_fetched_source ON fetched_pages(source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fetched_url_account ON fetched_pages(account_id, url);

-- ── extracted_signals ──
CREATE TABLE IF NOT EXISTS extracted_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  watch_id uuid REFERENCES watches(id) ON DELETE CASCADE NOT NULL,
  page_id uuid REFERENCES fetched_pages(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  company_name_raw text,
  company_website_raw text,
  company_country_raw text,
  signal_type text NOT NULL,
  signal_subtype text,
  signal_label text NOT NULL,
  signal_summary text,
  extracted_facts jsonb DEFAULT '{}',
  confidence_score real DEFAULT 0.5,
  source_reliability real DEFAULT 0.5,
  source_url text,
  source_name text,
  source_domain text,
  detected_at timestamptz DEFAULT now(),
  event_date timestamptz,
  dedupe_hash text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ext_sig_account ON extracted_signals(account_id);
CREATE INDEX IF NOT EXISTS idx_ext_sig_watch ON extracted_signals(watch_id);
CREATE INDEX IF NOT EXISTS idx_ext_sig_company ON extracted_signals(company_id);
CREATE INDEX IF NOT EXISTS idx_ext_sig_type ON extracted_signals(signal_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_sig_dedupe ON extracted_signals(dedupe_hash) WHERE dedupe_hash IS NOT NULL;

-- ── opportunity_evidence (relationnelle) ──
CREATE TABLE IF NOT EXISTS opportunity_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES lead_opportunities(id) ON DELETE CASCADE NOT NULL,
  signal_id uuid REFERENCES extracted_signals(id) ON DELETE SET NULL,
  page_id uuid REFERENCES fetched_pages(id) ON DELETE SET NULL,
  evidence_type text NOT NULL,
  label text NOT NULL,
  short_excerpt text,
  source_name text,
  source_url text,
  evidence_date timestamptz,
  confidence_score real DEFAULT 0.5,
  rank integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_ev_opp ON opportunity_evidence(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_ev_signal ON opportunity_evidence(signal_id);

-- ── pipeline_runs (audit) ──
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  watch_id uuid REFERENCES watches(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  stats jsonb DEFAULT '{}',
  errors text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── RLS ──
ALTER TABLE discovered_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fetched_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own discovered_sources" ON discovered_sources
  FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users see own fetched_pages" ON fetched_pages
  FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users see own extracted_signals" ON extracted_signals
  FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users see own opportunity_evidence" ON opportunity_evidence
  FOR SELECT USING (opportunity_id IN (
    SELECT id FROM lead_opportunities WHERE account_id IN (
      SELECT account_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users see own pipeline_runs" ON pipeline_runs
  FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));
