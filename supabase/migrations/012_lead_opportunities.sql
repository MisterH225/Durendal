-- ============================================================
-- 012 — Module Opportunités commerciales
-- ============================================================

-- ── Extensions sur companies (réutilisée comme "account") ──
ALTER TABLE companies ADD COLUMN IF NOT EXISTS normalized_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sub_industry text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS employee_range text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_range text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_type text;

-- ── Extensions sur signals ──
ALTER TABLE signals ADD COLUMN IF NOT EXISTS signal_subtype text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS extracted_data jsonb;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS confidence_score real DEFAULT 0.5;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS dedupe_hash text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS company_name_raw text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS company_website_raw text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS company_country_raw text;

-- ── account_signals (jointure signaux ↔ companies) ──
CREATE TABLE IF NOT EXISTS account_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  signal_id uuid REFERENCES signals(id) ON DELETE CASCADE NOT NULL,
  signal_weight real DEFAULT 1.0,
  match_reason jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, signal_id)
);

-- ── lead_opportunities ──
CREATE TABLE IF NOT EXISTS lead_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  primary_watch_id uuid REFERENCES watches(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  fit_score real DEFAULT 0,
  intent_score real DEFAULT 0,
  recency_score real DEFAULT 0,
  engagement_score real DEFAULT 20,
  reachability_score real DEFAULT 0,
  confidence_score real DEFAULT 0,
  noise_penalty real DEFAULT 0,
  total_score real DEFAULT 0,
  heat_level text DEFAULT 'cold' CHECK (heat_level IN ('hot','warm','cold')),
  recommended_angle text,
  recommended_next_action text,
  status text DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','proposal','negotiation','won','lost','dismissed','too_early')),
  last_signal_at timestamptz,
  first_detected_at timestamptz DEFAULT now(),
  last_scored_at timestamptz,
  score_breakdown jsonb DEFAULT '{}',
  explanation jsonb DEFAULT '{}',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_opp_account ON lead_opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_lead_opp_company ON lead_opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_lead_opp_score ON lead_opportunities(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_opp_heat ON lead_opportunities(heat_level);
CREATE INDEX IF NOT EXISTS idx_lead_opp_status ON lead_opportunities(status);

-- ── contact_candidates ──
CREATE TABLE IF NOT EXISTS contact_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES lead_opportunities(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  full_name text NOT NULL,
  job_title text,
  seniority text,
  department text,
  email text,
  phone text,
  linkedin_url text,
  source text,
  confidence_score real DEFAULT 0.5,
  reachability_score real DEFAULT 0,
  is_decision_maker boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── opportunity_feedback ──
CREATE TABLE IF NOT EXISTS opportunity_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES lead_opportunities(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) NOT NULL,
  feedback_type text NOT NULL CHECK (feedback_type IN ('good_fit','bad_fit','too_early','won','lost','duplicate')),
  comment text,
  created_at timestamptz DEFAULT now()
);

-- ── opportunity_activity (timeline) ──
CREATE TABLE IF NOT EXISTS opportunity_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES lead_opportunities(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  payload jsonb DEFAULT '{}',
  actor_user_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ── RLS ──
ALTER TABLE lead_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own opportunities" ON lead_opportunities
  FOR SELECT USING (account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users see own contacts" ON contact_candidates
  FOR SELECT USING (opportunity_id IN (SELECT id FROM lead_opportunities WHERE account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid())));

CREATE POLICY "Users manage own feedback" ON opportunity_feedback
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users see own activity" ON opportunity_activity
  FOR SELECT USING (opportunity_id IN (SELECT id FROM lead_opportunities WHERE account_id IN (SELECT account_id FROM profiles WHERE id = auth.uid())));

-- Service role (admin) a accès complet via supabase admin client
