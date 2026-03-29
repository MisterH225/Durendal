-- ============================================================
-- 015 — Recherche d'opportunités par secteur / pays
-- Table : opportunity_searches
-- Alter : pipeline tables support search_id alongside watch_id
-- ============================================================

-- ── opportunity_searches ──
CREATE TABLE IF NOT EXISTS opportunity_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES profiles(id) NOT NULL,
  mode text NOT NULL DEFAULT 'sector_based' CHECK (mode IN ('watch_based','sector_based')),
  sector text NOT NULL,
  sub_sector text,
  country text NOT NULL,
  region text,
  keywords jsonb DEFAULT '[]',
  opportunity_types jsonb DEFAULT '[]',
  date_range_days integer DEFAULT 30,
  status text DEFAULT 'draft' CHECK (status IN ('draft','running','completed','failed','partial')),
  results_count integer DEFAULT 0,
  stats jsonb DEFAULT '{}',
  errors text[] DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_search_account ON opportunity_searches(account_id);
CREATE INDEX IF NOT EXISTS idx_opp_search_status ON opportunity_searches(status);
CREATE INDEX IF NOT EXISTS idx_opp_search_sector ON opportunity_searches(sector, country);

-- ── Extend pipeline tables to support sector search (search_id nullable) ──

-- discovered_sources: make watch_id nullable, add search_id
ALTER TABLE discovered_sources ALTER COLUMN watch_id DROP NOT NULL;
ALTER TABLE discovered_sources ADD COLUMN IF NOT EXISTS search_id uuid REFERENCES opportunity_searches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_disc_src_search ON discovered_sources(search_id);
-- Relax unique index to handle search-based sources
DROP INDEX IF EXISTS idx_disc_src_url_watch;
CREATE UNIQUE INDEX IF NOT EXISTS idx_disc_src_url_ctx ON discovered_sources(account_id, url, COALESCE(watch_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(search_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- extracted_signals: make watch_id nullable, add search_id
ALTER TABLE extracted_signals ALTER COLUMN watch_id DROP NOT NULL;
ALTER TABLE extracted_signals ADD COLUMN IF NOT EXISTS search_id uuid REFERENCES opportunity_searches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ext_sig_search ON extracted_signals(search_id);

-- lead_opportunities: add search_id + sector/country columns
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS search_id uuid REFERENCES opportunity_searches(id) ON DELETE SET NULL;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS origin text DEFAULT 'watch' CHECK (origin IN ('watch','sector_search','both'));
ALTER TABLE lead_opportunities ALTER COLUMN company_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_opp_search ON lead_opportunities(search_id);
CREATE INDEX IF NOT EXISTS idx_lead_opp_origin ON lead_opportunities(origin);
CREATE INDEX IF NOT EXISTS idx_lead_opp_sector ON lead_opportunities(sector);

-- pipeline_runs: add search_id
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS search_id uuid REFERENCES opportunity_searches(id) ON DELETE CASCADE;
ALTER TABLE pipeline_runs ALTER COLUMN watch_id DROP NOT NULL;

-- ── RLS ──
ALTER TABLE opportunity_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own searches" ON opportunity_searches
  FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users create own searches" ON opportunity_searches
  FOR INSERT WITH CHECK (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users update own searches" ON opportunity_searches
  FOR UPDATE USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));
