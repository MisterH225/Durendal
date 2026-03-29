-- ============================================================
-- 013 — Opportunités orientées preuves
-- Ajoute les champs signal déclencheur, hypothèse business,
-- preuves observées et statut qualité aux lead_opportunities.
-- ============================================================

ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS primary_trigger_type text;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS primary_trigger_label text;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS primary_trigger_summary text;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS business_hypothesis text;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS opportunity_reason text;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS trigger_confidence real DEFAULT 0;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS evidence_count integer DEFAULT 0;
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS evidence_summary jsonb DEFAULT '[]';
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS evidence_status text DEFAULT 'weak' CHECK (evidence_status IN ('sufficient','insufficient','weak'));
ALTER TABLE lead_opportunities ADD COLUMN IF NOT EXISTS display_status text DEFAULT 'visible' CHECK (display_status IN ('visible','hidden','draft'));

CREATE INDEX IF NOT EXISTS idx_lead_opp_display ON lead_opportunities(display_status);
CREATE INDEX IF NOT EXISTS idx_lead_opp_trigger ON lead_opportunities(primary_trigger_type);
