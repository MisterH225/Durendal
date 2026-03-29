-- ============================================================
-- 014 + 015 COMBINÉ — À exécuter dans le SQL Editor Supabase
-- Crée les tables du pipeline + la recherche sectorielle
-- Idempotent : peut être relancé sans erreur
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- MIGRATION 014 — Pipeline agents Opportunités
-- ══════════════════════════════════════════════════════════════

-- ── discovered_sources ──
CREATE TABLE IF NOT EXISTS discovered_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  watch_id uuid REFERENCES watches(id) ON DELETE CASCADE,
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
  watch_id uuid REFERENCES watches(id) ON DELETE CASCADE,
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

-- ── opportunity_evidence ──
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

-- ── pipeline_runs ──
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  watch_id uuid REFERENCES watches(id) ON DELETE CASCADE,
  status text DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  stats jsonb DEFAULT '{}',
  errors text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── RLS pour 014 ──
ALTER TABLE discovered_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fetched_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own discovered_sources') THEN
    CREATE POLICY "Users see own discovered_sources" ON discovered_sources
      FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own fetched_pages') THEN
    CREATE POLICY "Users see own fetched_pages" ON fetched_pages
      FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own extracted_signals') THEN
    CREATE POLICY "Users see own extracted_signals" ON extracted_signals
      FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own opportunity_evidence') THEN
    CREATE POLICY "Users see own opportunity_evidence" ON opportunity_evidence
      FOR SELECT USING (opportunity_id IN (
        SELECT id FROM lead_opportunities WHERE account_id IN (
          SELECT account_id FROM profiles WHERE id = auth.uid()
        )
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own pipeline_runs') THEN
    CREATE POLICY "Users see own pipeline_runs" ON pipeline_runs
      FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════
-- MIGRATION 015 — Recherche sectorielle
-- ══════════════════════════════════════════════════════════════

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

-- ── Ajouter search_id aux tables pipeline ──

ALTER TABLE discovered_sources ADD COLUMN IF NOT EXISTS search_id uuid REFERENCES opportunity_searches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_disc_src_search ON discovered_sources(search_id);

-- Remplacer l'index unique watch-based par un index contextuel
DROP INDEX IF EXISTS idx_disc_src_url_watch;
CREATE UNIQUE INDEX IF NOT EXISTS idx_disc_src_url_ctx ON discovered_sources(account_id, url, COALESCE(watch_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(search_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE extracted_signals ADD COLUMN IF NOT EXISTS search_id uuid REFERENCES opportunity_searches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ext_sig_search ON extracted_signals(search_id);

ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS search_id uuid REFERENCES opportunity_searches(id) ON DELETE SET NULL;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS country text;

-- origin avec DO block pour éviter l'erreur si la colonne existe déjà
DO $$ BEGIN
  ALTER TABLE lead_opportunities ADD COLUMN origin text DEFAULT 'watch';
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Rendre company_id nullable (peut ne pas être connu pour les opportunités sectorielles)
DO $$ BEGIN
  ALTER TABLE lead_opportunities ALTER COLUMN company_id DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_opp_search ON lead_opportunities(search_id);
CREATE INDEX IF NOT EXISTS idx_lead_opp_origin ON lead_opportunities(origin);
CREATE INDEX IF NOT EXISTS idx_lead_opp_sector ON lead_opportunities(sector);

ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS search_id uuid REFERENCES opportunity_searches(id) ON DELETE CASCADE;

-- ── RLS pour opportunity_searches ──
ALTER TABLE opportunity_searches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own searches') THEN
    CREATE POLICY "Users see own searches" ON opportunity_searches
      FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users create own searches') THEN
    CREATE POLICY "Users create own searches" ON opportunity_searches
      FOR INSERT WITH CHECK (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users update own searches') THEN
    CREATE POLICY "Users update own searches" ON opportunity_searches
      FOR UPDATE USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- FIN — Les deux migrations sont appliquées
-- ══════════════════════════════════════════════════════════════
