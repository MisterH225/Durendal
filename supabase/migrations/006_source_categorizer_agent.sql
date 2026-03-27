-- ══════════════════════════════════════════════
-- Agent autonome de catégorisation des sources
-- ══════════════════════════════════════════════

-- Colonnes IA sur la table sources (enrichissement automatique)
alter table sources add column if not exists ai_domains       text[] default '{}';
alter table sources add column if not exists ai_description   text;
alter table sources add column if not exists ai_categorized_at timestamptz;
alter table sources add column if not exists ai_confidence     float;

-- Table de configuration des agents système (superadmin only)
create table if not exists admin_agents (
  id          text primary key,            -- 'source_categorizer', etc.
  name        text not null,
  description text,
  status      text not null default 'active', -- 'active', 'paused', 'disabled'
  prompt      text not null,                  -- prompt LLM éditable par le superadmin
  model       text not null default 'gemini-2.5-flash',
  config      jsonb default '{}',             -- paramètres supplémentaires
  last_run_at timestamptz,
  runs_count  integer default 0,
  errors_count integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Log d'exécution de l'agent
create table if not exists admin_agent_runs (
  id          uuid primary key default gen_random_uuid(),
  agent_id    text references admin_agents(id) on delete cascade not null,
  status      text not null,    -- 'running', 'done', 'error'
  trigger     text,             -- 'manual', 'auto_insert', 'bulk'
  sources_processed integer default 0,
  sources_updated   integer default 0,
  duration_ms       integer,
  error_message     text,
  metadata    jsonb default '{}',
  started_at  timestamptz default now(),
  completed_at timestamptz
);

-- RLS : admin_agents lisible uniquement via service_role (pas de RLS user)
alter table admin_agents enable row level security;
alter table admin_agent_runs enable row level security;

-- Aucune policy user → accessible uniquement via createAdminClient()

-- Seed : agent catégoriseur de sources
insert into admin_agents (id, name, description, status, prompt, model) values (
  'source_categorizer',
  'Catégoriseur de sources',
  'Analyse les sites web de la bibliothèque de sources pour les catégoriser automatiquement par domaine d''activité (construction, banque, presse, mines, etc.). Se déclenche à chaque ajout de source.',
  'active',
  'Tu es un analyste expert en classification de sources d''information pour la veille concurrentielle en Afrique.

Analyse ce site web et détermine ses DOMAINES DE COUVERTURE principaux.

SITE : {{url}}
NOM : {{name}}
CATÉGORIE EXISTANTE : {{source_category}}
SECTEURS EXISTANTS : {{sectors}}

Réponds UNIQUEMENT en JSON valide :
{
  "domains": ["domaine1", "domaine2", "domaine3"],
  "description": "Description courte du site et de sa couverture éditoriale (1-2 phrases)",
  "confidence": 0.85,
  "source_category_suggestion": "press|institutional|blog|social|customs|corporate|government|research|trade"
}

DOMAINES POSSIBLES (utilise ces catégories ou crée-en si nécessaire) :
banque, finance, assurance, fintech, mines, énergie, pétrole, construction, BTP, immobilier, agriculture, agroalimentaire, télécommunications, technologie, e-commerce, logistique, transport, santé, pharmaceutique, éducation, presse généraliste, presse économique, presse tech, institutionnel, gouvernement, régulation, douanes, commerce international, startups, investissement, capital-risque

RÈGLES :
- Maximum 5 domaines par source.
- Ordonne par pertinence décroissante.
- "confidence" : ta confiance dans la classification (0.0-1.0).
- Base-toi sur le nom, l''URL, la catégorie existante et les secteurs connus.',
  'gemini-2.5-flash'
) on conflict (id) do nothing;
