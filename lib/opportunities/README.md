# Module Opportunités — Architecture Agents Pipeline

## Architecture

Pipeline en 5 couches avec agents spécialisés :

```
[Veille utilisateur]
       ↓
╔══════════════════════════════════════╗
║  Layer 1 — Discovery Agent          ║
║  Perplexity Sonar + Firecrawl       ║
║  → discovered_sources               ║
╠══════════════════════════════════════╣
║  Layer 2 — Fetch Agent              ║
║  Firecrawl Scrape + Native fetch    ║
║  → fetched_pages                    ║
╠══════════════════════════════════════╣
║  Layer 3 — Signal Extraction Agent  ║
║  Gemini Flash extraction métier     ║
║  → extracted_signals                ║
╠══════════════════════════════════════╣
║  Layer 4 — Entity Resolution        ║
║  Normalisation entreprises          ║
║  → company_id linking               ║
╠══════════════════════════════════════╣
║  Layer 5 — Qualification Agent      ║
║  Primary trigger, hypothèse,        ║
║  preuves, score, display status     ║
║  → lead_opportunities               ║
║  → opportunity_evidence             ║
╚══════════════════════════════════════╝
```

## Tables Pipeline (Migration 014)

| Table | Rôle |
|---|---|
| `discovered_sources` | URLs découvertes par Sonar/Firecrawl |
| `fetched_pages` | Contenu extrait des pages |
| `extracted_signals` | Signaux métier structurés (Gemini) |
| `opportunity_evidence` | Preuves relationnelles par opportunité |
| `pipeline_runs` | Audit des exécutions pipeline |

## Fichiers

```
lib/opportunities/
├── agents/
│   ├── discovery-agent.ts        — Layer 1
│   ├── fetch-agent.ts            — Layer 2
│   ├── signal-extraction-agent.ts — Layer 3
│   └── qualification-agent.ts    — Layer 5
├── services/
│   ├── sonar-service.ts          — Interface Perplexity isolée
│   └── firecrawl-service.ts      — Interface Firecrawl isolée
├── pipeline.ts                   — Orchestrateur principal
├── signals-taxonomy.ts           — 14 types de signaux
├── scoring.ts                    — Moteur de scoring
├── sector-config.ts              — Config par secteur
├── normalizer.ts                 — Normalisation noms entreprises
├── message-generator.ts          — Génération messages (Gemini)
├── opportunity-engine.ts         — Legacy (backward compat)
├── seed-pipeline.ts              — Données de démonstration
└── __tests__/
    ├── pipeline.test.ts          — Tests pipeline
    ├── scoring.test.ts           — Tests scoring
    ├── normalizer.test.ts        — Tests normalisation
    └── trigger-engine.test.ts    — Tests trigger engine
```

## API

| Route | Méthode | Description |
|---|---|---|
| `/api/opportunities` | GET | Liste paginée + filtres |
| `/api/opportunities` | POST | Legacy recompute |
| `/api/opportunities/run-pipeline` | POST | Lancer le pipeline complet |
| `/api/opportunities/[id]` | GET | Détail + evidence + signals |
| `/api/opportunities/[id]` | PATCH | Mise à jour statut |
| `/api/opportunities/[id]/feedback` | POST | Feedback utilisateur |
| `/api/opportunities/[id]/generate-message` | POST | Génération message IA |
| `/api/opportunities/config` | GET | Config + watches |

## Lancer le pipeline

```bash
# Via API (depuis l'UI)
POST /api/opportunities/run-pipeline
{ "watchId": "uuid-de-la-veille" }

# Seed des données de démo
npx tsx lib/opportunities/seed-pipeline.ts
```

## Règle produit clé

Une opportunité **visible** doit toujours avoir :
- Un signal principal clair (`primary_trigger_label`)
- Une hypothèse commerciale (`business_hypothesis`)
- Au moins 2 preuves exploitables
- Un niveau de confiance

Sinon : `display_status = hidden | draft`

## Taxonomie signaux

14 types : `tender_detected`, `project_launch`, `expansion_plan`, `hiring_spike`, `executive_change`, `partnership`, `distributor_appointment`, `import_activity`, `funding_event`, `product_launch`, `new_location`, `procurement_signal`, `competitor_switch`, `compliance_event`, `digital_activity_spike`

Chaque type a : label, businessLabel, badge, hypothesisTemplate, baseScore, decayDays, category.

## Mode 2 — Recherche sectorielle

### Architecture

```
[Formulaire : secteur + pays]
       ↓
╔══════════════════════════════════════╗
║  Query Builder (sector-search-taxonomy)
║  → 10-15 requêtes ciblées par secteur
╠══════════════════════════════════════╣
║  Discovery (Sonar + Firecrawl)       ║
║  → discovered_sources (search_id)    ║
╠══════════════════════════════════════╣
║  Fetch → Extract → Resolve → Qualify ║
║  (mêmes agents, contexte search_id)  ║
╚══════════════════════════════════════╝
       ↓
[Opportunités avec origin=sector_search]
```

### Tables

- `opportunity_searches` — paramètres de recherche (secteur, pays, sous-secteur, etc.)
- `discovered_sources.search_id` — lien vers la recherche
- `extracted_signals.search_id` — lien vers la recherche
- `lead_opportunities.search_id` + `origin` + `sector` + `country`

### API

```
POST /api/opportunity-searches        — Créer une recherche
GET  /api/opportunity-searches        — Lister les recherches
GET  /api/opportunity-searches/:id    — Détail recherche
POST /api/opportunity-searches/:id/run — Lancer le pipeline
GET  /api/opportunities?origin=sector_search&searchId=xxx
```

### Taxonomie sectorielle

8 verticales : BTP, Mines, Agriculture, Industrie, Distribution, Énergie, Santé, Tech.

Chaque secteur a : `queryTemplates`, `signalTypes`, `synonyms`, `entityTypes`, `subSectors`.

### Migration

Exécuter `supabase/migrations/015_sector_search.sql` dans le SQL Editor Supabase.

### Usage

```bash
# Seed recherches sectorielles démo
npx tsx lib/opportunities/seed-sector-search.ts

# Lancer via API
curl -X POST /api/opportunity-searches -d '{"sector":"BTP","country":"SN"}'
curl -X POST /api/opportunity-searches/{id}/run
```

## Tests

```bash
npx tsx lib/opportunities/__tests__/pipeline.test.ts
npx tsx lib/opportunities/__tests__/scoring.test.ts
npx tsx lib/opportunities/__tests__/normalizer.test.ts
npx tsx lib/opportunities/__tests__/sector-search.test.ts
```
