# Audit d'Architecture — MarketLens

> **Date** : 27 mars 2026
> **Scope** : Audit complet du repository `marketlens` — observation uniquement, aucune modification.
> **Convention** : Les éléments marqués *(hypothèse)* sont des déductions ; tout le reste est directement observé dans le code.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Arborescence commentée](#3-arborescence-commentée)
4. [Frontend](#4-frontend)
5. [Backend](#5-backend)
6. [Base de données / schéma métier](#6-base-de-données--schéma-métier)
7. [Flux de données métier](#7-flux-de-données-métier)
8. [Module Opportunités](#8-module-opportunités)
9. [Module Rapports](#9-module-rapports)
10. [Collecte / veille / scraping / agents / IA](#10-collecte--veille--scraping--agents--ia)
11. [Services externes / APIs](#11-services-externes--apis)
12. [Endpoints API](#12-endpoints-api)
13. [Dette technique / risques](#13-dette-technique--risques)
14. [Fichiers critiques](#14-fichiers-critiques)
15. [Résumé exécutif](#15-résumé-exécutif)

---

## 1. Vue d'ensemble

MarketLens est un **SaaS B2B de veille commerciale et d'intelligence marché** ciblant principalement l'Afrique. L'application permet aux utilisateurs de :

- Créer des **veilles** autour d'entreprises, de secteurs et de pays.
- Déclencher des **agents IA** qui collectent automatiquement des signaux depuis le web (presse, sites officiels, sources sectorielles).
- Générer une chaîne de **rapports** (synthèse concurrentielle → analyse de marché → plan stratégique → prédictions) via LLM.
- Détecter et qualifier des **opportunités commerciales** à partir des signaux collectés, avec scoring et preuves.
- Effectuer des **recherches sectorielles** d'opportunités par pays (BTP, Mines, Agro, etc.).
- Dialoguer avec un **assistant IA conversationnel** contextuel lié aux veilles.

### Architecture

Le projet est un **monolithe Next.js 14 (App Router)** déployé *(hypothèse)* sur Vercel. Toute l'application — frontend, API, logique métier, jobs — coexiste dans un unique déploiement. Supabase sert de **backend-as-a-service** unique : PostgreSQL, authentification, stockage fichiers et Row Level Security. Il n'y a **pas de serveur Express/Nest/Fastify séparé** : les routes API Next.js jouent le rôle de backend.

La logique métier vit dans deux couches :

- **Routes API** (`app/api/`) : points d'entrée HTTP, auth, orchestration.
- **Modules lib** (`lib/`) : agents, pipelines, scoring, taxonomie, services IA — la vraie logique.

Il n'y a **aucune queue de messages**, aucun worker dédié, aucun service bus. Les pipelines (collecte, rapports, opportunités) s'exécutent de manière synchrone dans des requêtes HTTP avec un timeout de 300 secondes. Un unique cron HTTP (`/api/cron/run-agents`) itère sur les veilles et les déclenche séquentiellement.

---

## 2. Stack technique

| Couche | Technologie | Version / détail |
|--------|-------------|-----------------|
| **Framework fullstack** | Next.js (App Router) | 14.2.5 |
| **Frontend** | React + TypeScript | React 18, TypeScript 5 |
| **CSS** | Tailwind CSS | 3.4.1 |
| **Graphiques** | Recharts | 2.12.7 |
| **Icônes** | Lucide React | 0.436.0 |
| **Utilitaires CSS** | clsx + tailwind-merge | 2.1.1 / 2.5.2 |
| **Base de données** | PostgreSQL (Supabase) | via `@supabase/supabase-js` 2.45 |
| **Auth** | Supabase Auth | email/mot de passe, OTP, Google OAuth |
| **SSR auth** | `@supabase/ssr` | 0.9.0 |
| **ORM** | Aucun | Requêtes Supabase JS directes |
| **LLM principal** | Google Gemini API (REST) | gemini-2.5-flash |
| **Recherche web** | Perplexity Sonar API | v1/sonar + /search + embeddings |
| **Scraping** | Firecrawl API | v1/search + v1/scrape |
| **Simulation** | MiroFish (Python/Flask externe, optionnel) | port 5001 |
| **Logos** | Logo.dev (ex-Clearbit) | img.logo.dev/\{domain\} |
| **LinkedIn** | Proxycurl | nubela.co/proxycurl |
| **Export** | html2pdf.js (côté client) | 0.14.0 |
| **Jobs/Cron** | Pas de queue — HTTP cron → route API | — |
| **Monitoring** | Aucun détecté | — |
| **Tests** | Aucun framework (exécution manuelle `npx tsx`) | — |
| **Déploiement** | Vercel *(hypothèse)* | config Edge compatible |

### Dépendances runtime (package.json)

| Package | Version |
|---------|---------|
| `@supabase/ssr` | ^0.9.0 |
| `@supabase/supabase-js` | ^2.45.0 |
| `clsx` | ^2.1.1 |
| `html2pdf.js` | ^0.14.0 |
| `lucide-react` | ^0.436.0 |
| `next` | 14.2.5 |
| `react` | ^18 |
| `react-dom` | ^18 |
| `recharts` | ^2.12.7 |
| `tailwind-merge` | ^2.5.2 |

**Observation** : seulement 10 dépendances runtime. Le projet est léger en bibliothèques tierces mais lourd en code applicatif.

---

## 3. Arborescence commentée

```
marketlens/
│
├── app/                              # Next.js App Router — toute l'application
│   ├── layout.tsx                    #   Layout HTML racine (lang="fr", globals.css, SEO)
│   │
│   ├── (auth)/                       #   Groupe routes auth (publiques)
│   │   ├── login/page.tsx            #     Login (email/pwd, OTP, Google OAuth)
│   │   ├── signup/page.tsx           #     Inscription
│   │   ├── verify/page.tsx           #     Vérification email
│   │   ├── verify-otp/page.tsx       #     Vérification OTP
│   │   └── reset/page.tsx            #     Réinitialisation mot de passe
│   │
│   ├── (dashboard)/                  #   Shell principal authentifié
│   │   ├── layout.tsx                #     Layout : sidebar + topbar + vérif auth/profil
│   │   ├── dashboard/page.tsx        #     Accueil : métriques, état agents, onboarding
│   │   ├── veilles/                  #     Module veilles
│   │   │   ├── page.tsx              #       Liste des veilles
│   │   │   ├── new/page.tsx          #       Création multi-étapes
│   │   │   └── [id]/                 #       Détail veille
│   │   │       ├── page.tsx          #         Signaux, rapports, jobs
│   │   │       ├── edit/page.tsx     #         Édition veille
│   │   │       └── reports/[reportId]/page.tsx  # Affichage rapport
│   │   ├── opportunities/            #     Module opportunités
│   │   │   ├── page.tsx              #       Wrapper → OpportunitiesClient
│   │   │   ├── OpportunitiesClient.tsx #     Liste, filtres, onglets, pipeline
│   │   │   ├── OpportunityDetail.tsx #       Panneau détail + actions
│   │   │   └── SectorSearchPanel.tsx #       Recherche sectorielle
│   │   ├── marche/page.tsx           #     Dashboard analyse marché (Recharts)
│   │   ├── agents/page.tsx           #     Description/statut des 5 agents IA
│   │   ├── actions/page.tsx          #     Recommandations stratégiques (Agent 4)
│   │   ├── assistant/page.tsx        #     Chat IA conversationnel
│   │   ├── notifications/page.tsx    #     Centre d'alertes
│   │   ├── profil/page.tsx           #     Profil utilisateur
│   │   └── forfait/page.tsx          #     Grille tarifaire / plans
│   │
│   ├── admin/                        #   Panel super-admin (layout séparé)
│   │   ├── layout.tsx                #     Sidebar admin, vérif role superadmin
│   │   ├── page.tsx                  #     Redirect → /admin/dashboard
│   │   ├── dashboard/page.tsx        #     Stats globales SaaS
│   │   ├── users/page.tsx            #     Gestion utilisateurs
│   │   ├── plans/page.tsx            #     Configuration plans tarifaires
│   │   ├── sources/                  #     Gestion sources de données
│   │   │   ├── page.tsx              #       Wrapper
│   │   │   └── SourcesClient.tsx     #       CRUD sources + upload docs
│   │   ├── agents/                   #     Config agents système
│   │   │   ├── page.tsx              #       Vue agents
│   │   │   ├── prediction/page.tsx   #       Config Agent 5 (prédiction)
│   │   │   └── categorizer/page.tsx  #       Config catégoriseur sources
│   │   ├── access/page.tsx           #     Accès spéciaux
│   │   ├── billing/page.tsx          #     Paiements
│   │   └── settings/page.tsx         #     Paramètres
│   │
│   ├── api/                          #   36 routes API REST
│   │   ├── agents/                   #     scrape, synthesize, analyze, predict, strategy
│   │   ├── opportunities/            #     CRUD + pipeline + config + feedback + messages
│   │   ├── opportunity-searches/     #     Recherche sectorielle (CRUD + run)
│   │   ├── watches/                  #     CRUD veilles + entreprises
│   │   ├── chat/                     #     Assistant + chat rapport
│   │   ├── companies/search/         #     Autocomplete entreprises
│   │   ├── cron/run-agents/          #     Exécution automatique veilles
│   │   ├── admin/                    #     Sources, agents, users, plans, promo, accès
│   │   ├── auth/status/              #     Diagnostic session
│   │   ├── debug/search/             #     Test chaîne IA
│   │   ├── marche/                   #     Données dashboard marché
│   │   ├── promo/apply/              #     Application codes promo
│   │   └── webhooks/source-added/    #     Post-hook catégorisation
│   │
│   └── auth/                         #   Callback OAuth Supabase
│
├── components/                       # Composants partagés (3 fichiers seulement)
│   ├── dashboard/
│   │   ├── Sidebar.tsx               #   Navigation principale + mobile
│   │   └── Topbar.tsx                #   Barre supérieure
│   └── admin/
│       └── SuperAdminBar.tsx         #   Bandeau admin conditionnel
│
├── lib/                              # Logique métier et services
│   ├── agents/                       #   7 fichiers : collecte + rapports (Agents 1-5)
│   │   ├── collector-engine.ts       #     Moteur collecte multi-agents (5 sous-agents)
│   │   ├── report-generator.ts       #     Agent 2 : rapport de veille
│   │   ├── report-challengers.ts     #     3 challengers + synthèse enrichie
│   │   ├── market-analyst.ts         #     Agent 3 : analyse de marché
│   │   ├── strategy-advisor.ts       #     Agent 4 : plan stratégique
│   │   ├── prediction-engine.ts      #     Agent 5 : prédictions (+ MiroFish opt.)
│   │   └── company-finder.ts         #     Recherche entreprises (Clearbit + Gemini)
│   │
│   ├── opportunities/                #   Pipeline opportunités
│   │   ├── pipeline.ts               #     Orchestrateur pipeline veille
│   │   ├── sector-search-pipeline.ts #     Orchestrateur pipeline sectoriel
│   │   ├── opportunity-engine.ts     #     Recalcul legacy (depuis signals)
│   │   ├── scoring.ts                #     Scoring legacy (6 sous-scores)
│   │   ├── trigger-engine.ts         #     Trigger engine legacy
│   │   ├── normalizer.ts             #     Normalisation noms entreprises
│   │   ├── signals-taxonomy.ts       #     Catalogue types de signaux
│   │   ├── sector-config.ts          #     Config par verticale (BTP, Mines, etc.)
│   │   ├── sector-search-taxonomy.ts #     Profils recherche sectorielle
│   │   ├── seed-sector-search.ts     #     Données de démo
│   │   ├── README.md                 #     Documentation du module
│   │   ├── agents/                   #     4 agents pipeline
│   │   │   ├── discovery-agent.ts    #       Découverte URLs (Sonar + Firecrawl)
│   │   │   ├── fetch-agent.ts        #       Téléchargement pages
│   │   │   ├── signal-extraction-agent.ts  # Extraction signaux (Gemini)
│   │   │   └── qualification-agent.ts      # Scoring + trigger + preuves
│   │   ├── services/                 #     Wrappers services externes
│   │   │   ├── sonar-service.ts      #       Wrapper Perplexity Sonar
│   │   │   └── firecrawl-service.ts  #       Wrapper Firecrawl
│   │   └── __tests__/                #     Tests unitaires
│   │       └── sector-search.test.ts #       22 tests sector search
│   │
│   ├── ai/                           #   Wrappers IA
│   │   ├── gemini.ts                 #     Client Google Gemini (REST)
│   │   └── perplexity.ts             #     Client Perplexity (Sonar, Search, Embed)
│   │
│   ├── supabase/                     #   Clients Supabase
│   │   ├── server.ts                 #     Client SSR (cookies Next.js)
│   │   ├── admin.ts                  #     Client admin (service role)
│   │   └── client.ts                 #     Client navigateur
│   │
│   ├── auth/                         #   Helpers auth
│   │   └── ui-bypass.ts              #     Mode prévisualisation (bypass auth)
│   │
│   ├── modules/                      #   Connecteurs externes
│   │   └── mirofish-connector.ts     #     Pipeline MiroFish 7 étapes
│   │
│   └── countries.ts                  #   Référentiel pays (codes ISO, noms, drapeaux)
│
├── supabase/
│   └── migrations/                   # 16 fichiers SQL (001 → 015 + combiné)
│
├── styles/
│   └── globals.css                   # Tailwind + composants CSS custom
│
├── types/
│   └── html2pdf.d.ts                 # Déclaration TypeScript html2pdf
│
├── public/                           # Assets statiques (logo.png, etc.)
├── middleware.ts                      # Auth middleware Edge
├── next.config.mjs                   # Config Next.js
├── tailwind.config.js                # Config Tailwind
├── package.json                      # 10 deps runtime, 9 devDeps
├── tsconfig.json                     # strict: true, paths: @/* → ./*
└── .env.local                        # 9 variables d'environnement
```

---

## 4. Frontend

### 4.1 Organisation

Le frontend utilise le **Next.js App Router** avec deux patterns de composants :

- **Server Components** (défaut) : pages qui lisent directement Supabase en SSR (`createClient()` serveur). Exemples : dashboard, liste veilles, détail veille, rapports, actions, notifications, forfait.
- **Client Components** (`'use client'`) : pages avec interactivité, formulaires, état local. Exemples : création veille, opportunités, assistant, marché, panel admin sources.

### 4.2 Routing

| Groupe | Routes | Rôle |
|--------|--------|------|
| `(auth)` | `/login`, `/signup`, `/verify`, `/verify-otp`, `/reset` | Auth (publiques) |
| `(dashboard)` | `/dashboard`, `/veilles/*`, `/opportunities`, `/marche`, `/agents`, `/actions`, `/assistant`, `/notifications`, `/profil`, `/forfait` | App principale (authentifiée) |
| `admin` | `/admin/dashboard`, `/admin/users`, `/admin/plans`, `/admin/sources`, `/admin/agents/*`, `/admin/access`, `/admin/billing`, `/admin/settings` | Super-admin (layout séparé) |

### 4.3 Layout principal

Le **layout dashboard** (`app/(dashboard)/layout.tsx`) est un Server Component async qui :
1. Vérifie la session Supabase (ou bypass en mode prévisualisation)
2. Charge le profil utilisateur avec son plan depuis `profiles → accounts → plans`
3. Compte les alertes non lues
4. Rend le shell : `Sidebar` (navigation) + `Topbar` + `SuperAdminBar` conditionnelle
5. Redirige vers `/login` si pas de session

Le **layout admin** (`app/admin/layout.tsx`) est similaire mais avec un sidebar dédié et une vérification du rôle `superadmin`.

### 4.4 Pages principales

| Page | Type | Data fetching | APIs appelées |
|------|------|---------------|---------------|
| Dashboard | Server | Supabase SSR (watches, signals, alerts, reports, agent\_jobs) | — |
| Liste veilles | Server | Supabase SSR (watches + companies) | — |
| Nouvelle veille | Client | `fetch` | `/api/companies/search`, `/api/watches`, `/api/agents/scrape` |
| Détail veille | Server | Supabase SSR (watch, signals, reports, jobs) | — |
| Rapports | Server | Supabase SSR (reports) | `/api/chat/report` (chat) |
| Édition veille | Client+Supabase | Supabase client + `fetch` | `/api/companies/search`, Supabase direct |
| Opportunités | Client | `fetch` | `/api/opportunities`, `/api/opportunities/config`, `/api/opportunities/run-pipeline` |
| Sector Search | Client | `fetch` | `/api/opportunity-searches`, `/api/opportunity-searches/[id]/run`, `/api/opportunities` |
| Marché | Client | `fetch` | `/api/marche` |
| Agents | Client | `fetch` | `/api/agents/scrape` (lancement) |
| Assistant | Client | `fetch` | `/api/chat` |
| Actions | Server | Supabase SSR (recommendations) | — |
| Notifications | Server→Client | Supabase SSR → client | — |
| Profil | Server→Client | Supabase SSR → client | — |
| Forfait | Server | Supabase SSR (plans) | — |

### 4.5 Gestion de l'état

- **Aucun store global** : pas de Zustand, Redux, React Context partagé.
- Chaque composant client gère son propre état via `useState`/`useEffect`.
- **Pas de cache SWR/React Query** : les données sont rechargées à chaque navigation.
- Les données entre pages ne sont jamais partagées, chaque page fetch son propre état.

### 4.6 Design system

- **Pas de bibliothèque de composants** (pas de Shadcn, Radix, Material, etc.).
- Tailwind CSS utilisé directement avec des classes utilitaires.
- Classes CSS custom dans `globals.css` : `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `card`, `card-lg`, `input`, `input-error`, `label`, `badge`, `badge-*`, `sidebar-item`, `sidebar-item-active`, `metric-card`, `section-header`.
- **Composants partagés très limités** : seulement 3 fichiers dans `components/` (`Sidebar`, `Topbar`, `SuperAdminBar`).
- Le composant `CompanyLogo` (logo entreprise avec fallback) est **copié-collé dans 4 fichiers** avec la même logique.

### 4.7 Export

- Export PDF via `html2pdf.js` côté client (bouton dans la page rapport).
- Pas d'export serveur, pas de PDF généré côté backend.

---

## 5. Backend

### 5.1 Organisation

Le backend est constitué de **routes API Next.js** dans `app/api/`. Il n'y a pas de framework backend séparé (pas d'Express, Nest, Fastify). Chaque fichier `route.ts` exporte des handlers HTTP (`GET`, `POST`, `PATCH`, `DELETE`).

La logique métier est séparée en modules dans `lib/` :

```
app/api/              → Point d'entrée HTTP, auth, orchestration
lib/agents/           → Logique de collecte et génération de rapports
lib/opportunities/    → Pipeline opportunités, scoring, taxonomie
lib/ai/               → Wrappers LLM (Gemini, Perplexity)
lib/supabase/         → Clients base de données
lib/modules/          → Connecteurs externes (MiroFish)
```

### 5.2 Modules métier

| Module | Localisation | Responsabilité |
|--------|-------------|----------------|
| Collecte web | `lib/agents/collector-engine.ts` | 5 sous-agents parallèles : web\_scanner, press\_monitor, analyst, deep\_research, deep\_research\_iterative |
| Rapport veille | `lib/agents/report-generator.ts` | Agent 2 : synthèse concurrentielle |
| Enrichissement | `lib/agents/report-challengers.ts` | 3 challengers Gemini + fusion |
| Analyse marché | `lib/agents/market-analyst.ts` | Agent 3 : cartographie, tendances, scénarios |
| Stratégie | `lib/agents/strategy-advisor.ts` | Agent 4 : SWOT, recommandations, roadmap |
| Prédictions | `lib/agents/prediction-engine.ts` | Agent 5 : prédictions + MiroFish optionnel |
| Recherche entreprises | `lib/agents/company-finder.ts` | Clearbit + Gemini |
| Discovery pipeline | `lib/opportunities/agents/discovery-agent.ts` | Sonar + Firecrawl → URLs |
| Fetch pipeline | `lib/opportunities/agents/fetch-agent.ts` | Scraping → contenu |
| Extraction signaux | `lib/opportunities/agents/signal-extraction-agent.ts` | Gemini → signaux structurés |
| Qualification | `lib/opportunities/agents/qualification-agent.ts` | Scoring, trigger, preuves |
| Opportunités legacy | `lib/opportunities/opportunity-engine.ts` | Recalcul depuis `signals` |
| Scoring legacy | `lib/opportunities/scoring.ts` | 6 sous-scores (fit, intent, recency, etc.) |
| Trigger legacy | `lib/opportunities/trigger-engine.ts` | Signal principal, hypothèse |
| Pipeline veille | `lib/opportunities/pipeline.ts` | Orchestration discovery→qualify |
| Pipeline sectoriel | `lib/opportunities/sector-search-pipeline.ts` | Orchestration recherche par secteur/pays |
| Taxonomie signaux | `lib/opportunities/signals-taxonomy.ts` | Types, scores, labels, hypothèses |
| Config sectorielle | `lib/opportunities/sector-config.ts` | Priorités par verticale |
| Taxonomie sectorielle | `lib/opportunities/sector-search-taxonomy.ts` | Templates requêtes, synonymes |

### 5.3 Auth et middlewares

- **Middleware Edge** (`middleware.ts`) : vérifie la session Supabase sur toutes les routes non publiques. Redirige vers `/login` si absent. Vérifie le rôle `superadmin` pour `/admin`.
- **Mode bypass** (`lib/auth/ui-bypass.ts`) : si `AUTH_UI_BYPASS=true`, pas de vérification auth ; profil factice injecté. Prévu pour la prévisualisation locale.
- **Pas de middleware API systématique** : chaque route API vérifie l'auth de manière indépendante (ou pas du tout).

### 5.4 Validation

- **Aucune bibliothèque de validation** (pas de Zod, Joi, Yup, class-validator).
- Validation manuelle ad hoc dans chaque route (vérification de champs, casting).
- Pas de schéma de validation réutilisable.

### 5.5 Gestion des erreurs

- `try/catch` individuel dans chaque route.
- Réponses `NextResponse.json({ error: message }, { status: code })`.
- Pas de middleware d'erreur centralisé.
- Certaines erreurs sont silencieuses (catch vide avec `continue`).

### 5.6 Logs

- `console.log` et `console.error` uniquement.
- Pas de service de logging structuré (pas de Pino, Winston, Sentry).
- Pas de corrélation de requêtes (request ID).

### 5.7 Jobs / Cron

- **Un seul cron** : `POST /api/cron/run-agents` — itère sur les veilles dont `next_run_at < now()` et appelle `POST /api/agents/scrape` pour chacune.
- Protégé par `Authorization: Bearer CRON_SECRET` (si la variable est définie, sinon non protégé).
- Exécution synchrone dans une requête HTTP (timeout 300s via `maxDuration` Next.js).
- Pas de queue (BullMQ, Inngest, etc.), pas de worker, pas de retry automatique.

---

## 6. Base de données / schéma métier

### 6.1 Liste des entités

Le schéma est défini par 16 migrations SQL dans `supabase/migrations/`. Voici l'inventaire complet des tables :

#### Cœur utilisateur

| Table | Rôle | Migration |
|-------|------|-----------|
| `plans` | Plans tarifaires (Free, Pro, Business). `agents_enabled`, `max_watches`, `max_reports_per_month`, `has_assistant`, etc. | 001 |
| `accounts` | Comptes clients. `type` (individual/company), FK vers `plans`, `subscription_status`, `stripe_customer_id`. | 001 |
| `profiles` | Utilisateurs. FK vers `auth.users` et `accounts`. `role` (user/superadmin), `email`, `full_name`. | 001, 011 |

#### Veille

| Table | Rôle | Migration |
|-------|------|-----------|
| `watches` | Veilles commerciales. `sectors[]`, `countries[]`, `frequency`, `agents_config`, `last_run_at`. FK `account_id`, `created_by`. | 001 |
| `companies` | Entreprises surveillées ou découvertes. `name`, `sector`, `country`, `website`, `domain`, `logo_url`. | 001, 008, 012 |
| `watch_companies` | Relation N:N veilles ↔ entreprises. + `aspects[]`. PK (`watch_id`, `company_id`). | 001, 008 |
| `sources` | Sources de données admin (web, RSS, documents). `type`, `url`, `scraping_method`, `reliability_score`, `ai_*` (catégorisation). | 001, 006, 010 |

#### Signaux (veille)

| Table | Rôle | Migration |
|-------|------|-----------|
| `signals` | Signaux bruts collectés par Agent 1. `raw_content`, `relevance_score`, `sentiment`, `signal_type`, `is_processed`. FK `watch_id`, `company_id`, `source_id`. | 001, 003, 007, 012 |

#### Signaux (pipeline opportunités)

| Table | Rôle | Migration |
|-------|------|-----------|
| `discovered_sources` | URLs découvertes par Sonar/Firecrawl. `url`, `domain`, `provider`, `status`, `relevance_score`. FK `watch_id` OU `search_id`. | 014, 015 |
| `fetched_pages` | Pages web téléchargées et parsées. `content`, `status`. FK `source_id` (discovered\_sources). | 014 |
| `extracted_signals` | Signaux structurés extraits par Gemini. `signal_type`, `signal_label`, `confidence_score`, `extracted_facts`. FK `watch_id` OU `search_id`, `company_id`. | 014, 015 |

#### Opportunités

| Table | Rôle | Migration |
|-------|------|-----------|
| `lead_opportunities` | Opportunités commerciales qualifiées. `total_score`, `heat_level`, `primary_trigger_*`, `business_hypothesis`, `evidence_*`, `display_status`. FK `company_id` (nullable), `primary_watch_id`, `search_id`. | 012, 013, 015 |
| `opportunity_evidence` | Preuves rattachées. `evidence_type`, `label`, `short_excerpt`, `source_url`, `confidence_score`, `rank`. FK `opportunity_id`, `signal_id`. | 014 |
| `contact_candidates` | Contacts potentiels par opportunité. | 012 |
| `opportunity_feedback` | Feedback utilisateur (positif/négatif). | 012 |
| `opportunity_activity` | Journal d'activité par opportunité. | 012 |
| `account_signals` | Signaux dénormalisés par compte (chemin legacy). | 012 |
| `opportunity_searches` | Recherches sectorielles. `sector`, `country`, `keywords[]`, `opportunity_types[]`, `status`. FK `account_id`, `created_by_user_id`. | 015 |

#### Rapports

| Table | Rôle | Migration |
|-------|------|-----------|
| `reports` | Rapports générés (tous types). `type` (synthesis/analyse/market/strategy/prediction), `content` (JSONB), `agent_used`, `parent_report_id`, `charts`. FK `watch_id`, `account_id`. | 001, 007 |
| `recommendations` | Recommandations stratégiques (Agent 4). `title`, `description`, `priority`, `type`, `confidence_score`. FK `watch_id`, `account_id`, `report_id`. | 001, 007 |

#### Jobs et agents

| Table | Rôle | Migration |
|-------|------|-----------|
| `agent_jobs` | Journal d'exécution. `agent_number`, `status`, `tokens_used`, `cost_usd`. FK `watch_id`. | 001, 003 |
| `pipeline_runs` | Logs pipeline opportunités. `status`, `stats`, `errors`, `started_at`, `completed_at`. FK `watch_id` OU `search_id`. | 014, 015 |
| `admin_agents` | Config agents système (catégoriseur, prédiction). `id` texte, `prompt`, `model`, `config`. | 006, 009 |
| `admin_agent_runs` | Logs d'exécution agents admin. FK `agent_id`. | 006 |

#### Divers

| Table | Rôle | Migration |
|-------|------|-----------|
| `alerts` | Notifications utilisateur. `type`, `title`, `message`, `is_read`. FK `account_id`, `watch_id`. | 001 |
| `chat_messages` | Historique assistant IA. `role`, `content`, `tokens_used`. FK `account_id`, `user_id`, `watch_id`. | 001, 003 |
| `promo_codes` | Codes promotionnels. | 001 |
| `promo_code_uses` | Utilisations codes promo. FK `code_id`, `account_id`. | 001 |
| `special_access` | Accès spéciaux (démo, trial étendu). FK `account_id`. | 001 |
| `referrals` | Programme de parrainage. FK `referrer_id`, `referee_id`. | 001 |

### 6.2 Schéma relationnel textuel

```
auth.users
  └── 1:1 ── profiles ── N:1 ── accounts ── N:1 ── plans
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
             watches             alerts          special_access
                │             chat_messages       promo_code_uses
                │
        ┌───────┼──────────┐
        │       │          │
  watch_companies │     agent_jobs
      │          │
  companies   signals ────────┐
      │          │             │
      │    ┌─────┴───┐        │
      │    │         │        │
      │  reports  account_    │
      │    │      signals   recommendations
      │    │ (parent_report_id ← auto-ref)
      │    │
      │    └── reports.embedding (vector, non utilisé)
      │
      ├── lead_opportunities ←───── opportunity_searches
      │         │
      │    ┌────┼──────────────┐
      │    │    │              │
      │  evidence  feedback  activity
      │
      └── contact_candidates


Pipeline (tables dédiées, FK parallèles) :

  discovered_sources ──→ fetched_pages ──→ extracted_signals
       │ (watch_id|search_id)                   │
       │                                        └──→ lead_opportunities
       │                                               (watch_id|search_id)
  opportunity_searches ─────────────────────────────→  search_id
  pipeline_runs ──── (watch_id|search_id)
```

### 6.3 Points structurels notables

- **Deux tables de signaux** : `signals` (Agent 1/veille) et `extracted_signals` (pipeline opportunités). Structures différentes, pas de pont.
- `reports.content` est du **JSONB libre** sans schéma contraint.
- `reports.embedding` : colonne `vector(1536)` avec index IVFFlat créée mais **jamais alimentée ni requêtée** dans le code.
- `lead_opportunities` admet `company_id` nullable (pour les marchés publics sans entreprise privée).
- Extension PostgreSQL `vector` activée (pgvector).

---

## 7. Flux de données métier

### 7.1 Création d'une veille

```
[UI] /veilles/new (Client Component, multi-étapes)
  │
  ├── Étape recherche entreprises
  │   └── GET /api/companies/search?q=...
  │       └── Clearbit autocomplete → résultats affichés
  │
  ├── Soumission formulaire
  │   └── POST /api/watches
  │       └── admin: INSERT watches
  │       └── admin: INSERT companies (si nouvelles)
  │       └── admin: INSERT watch_companies (liaisons)
  │       └── Réponse: { watch }
  │
  └── Lancement optionnel immédiat
      └── POST /api/agents/scrape { watchId }
          └── (voir flux 7.2)
```

**Tables écrites** : `watches`, `companies`, `watch_companies`
**Sortie UI** : redirection vers `/veilles/[id]`

### 7.2 Exécution d'une veille (collecte complète + rapports)

```
POST /api/agents/scrape { watchId }
│   maxDuration = 300s
│
├── Lecture watches + watch_companies + companies + sources
│
├── PHASE 1 — Collecte Perplexity Sonar
│   └── Par entreprise : requête Sonar → texte brut
│       └── Gemini : extraction signaux structurés
│           └── INSERT signals (is_processed: false)
│
├── PHASE 2 — Collecte Firecrawl
│   └── Par entreprise : search + scrape HTML
│       └── Gemini : extraction signaux
│           └── INSERT signals
│
├── PHASE 3 — Collecte LinkedIn (optionnel, Proxycurl)
│   └── Profils entreprises → extraction Gemini → INSERT signals
│
├── PHASE 4 — Sources admin configurées
│   └── Fetch HTML → extraction Gemini → INSERT signals
│
├── COLLECTE collector-engine (5 sous-agents parallèles)
│   └── web_scanner, press_monitor, analyst, deep_research, deep_research_iterative
│       └── Perplexity + Firecrawl → Gemini extraction
│           └── INSERT signals (dédup par hash)
│
├── INSERT agent_jobs (Agent 1, completed)
│
├── AGENT 2 — Rapport de veille
│   └── SELECT signals WHERE is_processed = false, watch_id
│   └── Prompt Gemini → JSON structuré
│   └── INSERT reports (type: 'synthesis', agent_used: 2)
│   └── UPDATE signals SET is_processed = true
│   └── INSERT alerts ('report_ready')
│
├── CHALLENGER PIPELINE (Pro/Business uniquement)
│   └── 3 challengers Gemini en parallèle (angles morts, fact-check, profondeur)
│   └── Synthèse enrichie → INSERT reports (type: 'analyse', agent_used: 2)
│   └── UPDATE rapport initial (is_draft: true, final_report_id)
│
├── AGENT 3 — Analyse de marché
│   └── Lecture rapport Agent 2 + signaux
│   └── Prompt Gemini → JSON (cartographie, tendances, scénarios, chart_data)
│   └── INSERT reports (type: 'market', agent_used: 3)
│
├── AGENT 4 — Stratégie
│   └── Lecture rapports Agent 2+3 + signaux
│   └── Prompt Gemini → JSON (SWOT, recommandations, roadmap)
│   └── INSERT reports (type: 'strategy', agent_used: 4)
│   └── INSERT recommendations
│
└── AGENT 5 — Prédictions
    └── Lecture rapports 2+3+4 + signaux + optionnel MiroFish
    └── Prompt Gemini → JSON (prédictions par entreprise, market, scenarios)
    └── INSERT reports (type: 'prediction', agent_used: 5)
```

**Tables écrites** : `signals`, `agent_jobs`, `reports`, `recommendations`, `alerts`, `watches` (last\_run\_at)
**Sortie UI** : rapports visibles dans `/veilles/[id]` onglet "Rapports"

### 7.3 Génération d'opportunités (pipeline veille)

```
POST /api/opportunities/run-pipeline { watchId }
│
├── runDiscovery (discovery-agent)
│   └── Sonar + Firecrawl en parallèle → URLs
│   └── UPSERT discovered_sources (watch_id)
│
├── fetchPendingSources (fetch-agent)
│   └── SELECT discovered_sources WHERE status = 'pending'
│   └── Firecrawl scrape → INSERT/UPDATE fetched_pages
│   └── UPDATE discovered_sources.status = 'fetched'
│
├── extractSignalsFromPages (signal-extraction-agent)
│   └── SELECT fetched_pages non traitées (join sources)
│   └── Gemini extraction → UPSERT extracted_signals
│
├── resolveAccountsFromSignals (pipeline.ts)
│   └── Match extracted_signals.company_name_raw → companies existantes
│   └── UPDATE extracted_signals SET company_id
│
├── qualifyOpportunities (qualification-agent)
│   └── GROUP extracted_signals BY company_id
│   └── Pour chaque entreprise :
│       ├── selectPrimaryTrigger() → signal le plus fort
│       ├── buildBusinessHypothesis() → hypothèse commerciale
│       ├── computeOpportunityScore() → score 0-100
│       ├── assessEvidenceQuality() → sufficient/insufficient/weak
│       ├── computeDisplayStatus() → visible/draft/hidden
│       └── UPSERT lead_opportunities + INSERT opportunity_evidence
│
└── UPDATE pipeline_runs (completed, stats)
```

**Tables écrites** : `discovered_sources`, `fetched_pages`, `extracted_signals`, `lead_opportunities`, `opportunity_evidence`, `pipeline_runs`
**Sortie UI** : opportunités affichées dans `/opportunities` onglet "Depuis mes veilles"

### 7.4 Recherche sectorielle d'opportunités

```
POST /api/opportunity-searches { sector, country, ... }
  └── INSERT opportunity_searches (status: 'draft')

POST /api/opportunity-searches/[id]/run
│
├── buildSectorQueries (taxonomy)
│   └── Génère 10-15 requêtes texte ciblées
│
├── searchWithSonar + firecrawlBatchSearch
│   └── UPSERT discovered_sources (search_id)
│
├── fetchSectorSources
│   └── Même logique que fetch-agent avec search_id
│
├── extractSectorSignals
│   └── Même logique que signal-extraction-agent avec search_id
│
├── resolveEntitiesForSectorSearch
│   └── Match ou INSERT companies
│
├── qualifySectorOpportunities
│   └── UPSERT lead_opportunities (origin: 'sector_search', search_id)
│
└── UPDATE opportunity_searches (status: completed)
```

**Tables écrites** : `opportunity_searches`, `discovered_sources`, `fetched_pages`, `extracted_signals`, `companies`, `lead_opportunities`, `opportunity_evidence`
**Sortie UI** : résultats dans `/opportunities` onglet "Recherche marché"

### 7.5 Affichage dashboard

```
[UI] /dashboard (Server Component)
│
└── Supabase SSR → Promise.all([
      watches (actives, count),
      signals (count),
      alerts (non lues, count),
      watch_companies (count → nb entreprises),
      reports (count),
      agent_jobs (récents, état)
    ])
│
└── Rendu :
    ├── Métriques (entreprises, signaux, alertes, rapports)
    ├── Derniers signaux
    ├── État des agents IA
    └── Cards onboarding si 0 veilles
```

**Tables lues** : `profiles`, `watches`, `signals`, `alerts`, `watch_companies`, `reports`, `agent_jobs`
**Sortie UI** : page `/dashboard`

---

## 8. Module Opportunités

### 8.1 Localisation du code

| Couche | Fichiers |
|--------|----------|
| **Frontend** | `app/(dashboard)/opportunities/page.tsx` (wrapper), `OpportunitiesClient.tsx` (liste + filtres + onglets), `OpportunityDetail.tsx` (drawer détail), `SectorSearchPanel.tsx` (formulaire + résultats recherche) |
| **API** | `app/api/opportunities/route.ts` (GET liste, POST recalcul legacy), `app/api/opportunities/config/route.ts`, `app/api/opportunities/[id]/route.ts` (GET détail, PATCH statut), `app/api/opportunities/[id]/feedback/route.ts`, `app/api/opportunities/[id]/generate-message/route.ts`, `app/api/opportunities/run-pipeline/route.ts` |
| **API sectoriel** | `app/api/opportunity-searches/route.ts`, `app/api/opportunity-searches/[id]/route.ts`, `app/api/opportunity-searches/[id]/run/route.ts` |
| **Logique métier** | `lib/opportunities/pipeline.ts`, `lib/opportunities/sector-search-pipeline.ts`, `lib/opportunities/opportunity-engine.ts`, `lib/opportunities/scoring.ts`, `lib/opportunities/trigger-engine.ts`, `lib/opportunities/agents/*.ts`, `lib/opportunities/services/*.ts`, `lib/opportunities/signals-taxonomy.ts`, `lib/opportunities/sector-config.ts`, `lib/opportunities/sector-search-taxonomy.ts`, `lib/opportunities/normalizer.ts` |
| **DB** | `lead_opportunities`, `opportunity_evidence`, `opportunity_feedback`, `opportunity_activity`, `contact_candidates`, `account_signals`, `discovered_sources`, `fetched_pages`, `extracted_signals`, `pipeline_runs`, `opportunity_searches` |

### 8.2 Comment les opportunités sont créées

**Trois chemins coexistent** :

1. **Pipeline veille** (`pipeline.ts` → `qualification-agent.ts`) : Discovery → Fetch → Extract → Qualify. Déclenché manuellement via `POST /api/opportunities/run-pipeline`. Écrit dans `extracted_signals` → `lead_opportunities`.

2. **Pipeline sectoriel** (`sector-search-pipeline.ts`) : Même séquence mais déclenchée par `POST /api/opportunity-searches/[id]/run` avec `search_id` au lieu de `watch_id`. Requêtes construites depuis la taxonomie sectorielle.

3. **Chemin legacy** (`opportunity-engine.ts`) : Recalcul direct à partir de la table `signals` (Agent 1) via `POST /api/opportunities` body POST. Utilise `scoring.ts` et `trigger-engine.ts`.

### 8.3 Scoring

**Deux systèmes de scoring indépendants coexistent** :

**Système A — Legacy** (`scoring.ts` + `trigger-engine.ts`) :
- Utilisé par `opportunity-engine.ts`
- 6 sous-scores : fit, intent, recency, engagement, reachability, noise penalty
- Agrégation pondérée → score 0-100 → heat level (hot/warm/cold)
- Confiance calculée séparément

**Système B — Pipeline** (`qualification-agent.ts`) :
- Scoring inline : intent par catégorie signal, récence, qualité preuves, convergence types, sector match, trigger confidence
- Score 0-100 → heat level
- Preuves structurées (evidence items)

Les deux systèmes **ne partagent pas les mêmes formules, pondérations, ni seuils**.

### 8.4 Affichage UI

`OpportunitiesClient.tsx` propose :
- 2 onglets : "Depuis mes veilles" / "Recherche marché"
- Filtres : heat (hot/warm/cold), status, tri, recherche texte
- Pagination
- Détail dans un drawer latéral (`OpportunityDetail.tsx`)
- Informations affichées : entreprise, score, heat, trigger principal, hypothèse, preuves, signaux, contacts
- Actions : feedback (pouce haut/bas), changement statut, génération message (email/WhatsApp/LinkedIn)

### 8.5 Relations avec les autres modules

- **Veilles** : `lead_opportunities.primary_watch_id` → `watches.id`
- **Entreprises** : `lead_opportunities.company_id` → `companies.id` (nullable)
- **Signaux pipeline** : `extracted_signals` → `opportunity_evidence` → `lead_opportunities`
- **Recherches** : `lead_opportunities.search_id` → `opportunity_searches.id`
- **Rapports** : **aucune relation directe**. Les rapports et les opportunités sont des outputs parallèles sans lien.

---

## 9. Module Rapports

### 9.1 Localisation

| Composant | Fichier |
|-----------|---------|
| Affichage | `app/(dashboard)/veilles/[id]/reports/[reportId]/page.tsx` |
| Agent 2 | `lib/agents/report-generator.ts` |
| Challengers | `lib/agents/report-challengers.ts` |
| Agent 3 | `lib/agents/market-analyst.ts` |
| Agent 4 | `lib/agents/strategy-advisor.ts` |
| Agent 5 | `lib/agents/prediction-engine.ts` |
| Chat rapport | `app/api/chat/report/route.ts` |

### 9.2 Données consommées

Tous les rapports se basent sur :
- La table `signals` (signaux bruts collectés par Agent 1), tronqués puis envoyés au LLM
- Le(s) rapport(s) du niveau précédent (Agent 3 lit Agent 2, Agent 4 lit 2+3, Agent 5 lit 2+3+4)
- La configuration admin (`admin_agents`) pour l'Agent 5

Il n'y a **pas** :
- De données financières structurées
- De cours ou indices macroéconomiques
- De base sectorielle quantitative
- De séries temporelles stockées
- De RAG sur les données historiques

### 9.3 Structure des rapports

Chaque rapport est un `JSONB` dans `reports.content`. La structure varie par type :

| Type | `agent_used` | Structure JSON |
|------|-------------|----------------|
| `synthesis` | 2 | `title`, `executive_summary`, `company_analyses[]`, `competitive_comparison`, `market_dynamics`, `alerts[]`, `recommendations[]`, `sources[]` |
| `analyse` | 2 | Même structure enrichie + `challenger_improvements` |
| `market` | 3 | `market_overview`, `player_mapping`, `structural_trends`, `entry_barriers`, `attractiveness_matrix`, `scenarios[]`, `chart_data` |
| `strategy` | 4 | `swot`, `recommendations[]`, `roadmap`, `risks`, `partnerships`, `chart_data` |
| `prediction` | 5 | `predictions_by_company[]`, `market_predictions`, `confidence_matrix`, `scenarios[]` |

### 9.4 LLM et prompts

- **100% Google Gemini** (modèle `gemini-2.5-flash`) pour tous les rapports
- Entrée : JSON stringifié des signaux tronqués (800 chars max pour Agent 2, 500 pour Challengers) + rapport(s) précédent(s) + prompt structuré
- Sortie : JSON structuré parsé via `parseGeminiJson` (tentative regex si JSON pas clean)
- Prompts en dur dans le code TypeScript, pas de versioning ni de stockage

### 9.5 Ce qui est chiffré vs narratif

- **Narratif (90%+)** : titre, synthèse exécutive, analyses par entreprise, comparaison, SWOT, prédictions — tout est texte généré par le LLM
- **Chiffré (métadonnées)** : `tokens_used`, `confidence_score` dans les enregistrements
- **Chiffré (dans le contenu)** : `chart_data` optionnel (Agents 3, 4), scores et pourcentages dans les matrices — mais ces chiffres sont **générés par le LLM**, pas issus de données structurées

### 9.6 Pourquoi les rapports manquent de précision quantitative

1. **Troncation des signaux** : `raw_content` coupé à 500-800 chars. L'information chiffrée est souvent en fin de texte et perdue.
2. **Aucune source de données structurées** : pas de base de données financières, macroéconomiques ou sectorielles. Le LLM doit extraire les chiffres du texte brut.
3. **Chaîne de perte** : texte brut → troncation → extraction LLM → troncation → rapport LLM. Chaque étape peut perdre des données quantitatives.
4. **Prompts récemment améliorés** : des instructions "DONNÉES CHIFFRÉES OBLIGATOIRES" ont été ajoutées mais sans données source structurées, l'effet reste limité.
5. **Pas de vérification factuelle structurée** : le challenger "fact-check" compare texte vs texte, pas texte vs données.

### 9.7 Persistance et recomputabilité

- Rapports stockés dans `reports.content` (JSONB) — le contenu complet est persisté.
- Les signaux sources sont marqués `is_processed = true` après traitement — pas de re-traitement sans reset.
- **Pas d'historisation des prompts** ni des réponses LLM brutes.
- Les rapports sont en théorie recomputables si les signaux sont réinitialisés.

---

## 10. Collecte / veille / scraping / agents / IA

### 10.1 Inventaire complet des composants IA

| Composant | Fichier | Rôle | LLM | Services web |
|-----------|---------|------|-----|--------------|
| **Collector Engine** | `lib/agents/collector-engine.ts` | 5 sous-agents parallèles de collecte | Gemini (extraction) | Perplexity Sonar + Firecrawl |
| **Discovery Agent** | `lib/opportunities/agents/discovery-agent.ts` | Découverte URLs pour pipeline opportunités | — | Sonar + Firecrawl |
| **Fetch Agent** | `lib/opportunities/agents/fetch-agent.ts` | Scraping pages web | — | Firecrawl (scrape) |
| **Signal Extraction Agent** | `lib/opportunities/agents/signal-extraction-agent.ts` | Extraction signaux structurés depuis HTML | Gemini | — |
| **Qualification Agent** | `lib/opportunities/agents/qualification-agent.ts` | Scoring, trigger, preuves (algorithmique) | — | — |
| **Report Generator** | `lib/agents/report-generator.ts` | Agent 2 : rapport de veille | Gemini | — |
| **Report Challengers** | `lib/agents/report-challengers.ts` | 3 challengers + synthèse enrichie | Gemini | — |
| **Market Analyst** | `lib/agents/market-analyst.ts` | Agent 3 : analyse marché | Gemini | — |
| **Strategy Advisor** | `lib/agents/strategy-advisor.ts` | Agent 4 : plan stratégique | Gemini | — |
| **Prediction Engine** | `lib/agents/prediction-engine.ts` | Agent 5 : prédictions | Gemini + MiroFish (opt.) | MiroFish (HTTP) |
| **Company Finder** | `lib/agents/company-finder.ts` | Recherche entreprises | Gemini | Clearbit |
| **Source Categorizer** | (dans routes admin) | Classification auto des sources | Gemini | — |
| **Assistant Chat** | `app/api/chat/route.ts` | Chat conversationnel + function calling | Gemini (chat) | — |
| **Report Chat** | `app/api/chat/report/route.ts` | Chat contextuel sur un rapport | Gemini + MiroFish | — |
| **Sonar Service** | `lib/opportunities/services/sonar-service.ts` | Wrapper Perplexity pour discovery | — | Perplexity Sonar + Search |
| **Firecrawl Service** | `lib/opportunities/services/firecrawl-service.ts` | Wrapper scraping | — | Firecrawl API |
| **MiroFish Connector** | `lib/modules/mirofish-connector.ts` | Pipeline simulation 7 étapes | — | MiroFish (localhost:5001) |

### 10.2 Deux pipelines de collecte distincts

**Pipeline A — Scrape veille** (`/api/agents/scrape` + `collector-engine.ts`) :
- Déclenché pour une veille (watchId)
- Stocke les signaux dans la table `signals`
- Produit des rapports dans `reports`
- Exécution : tout dans une seule requête HTTP (timeout 300s)

**Pipeline B — Opportunités** (`pipeline.ts` / `sector-search-pipeline.ts`) :
- Déclenché pour une veille OU une recherche sectorielle
- Stocke les intermédiaires dans `discovered_sources` → `fetched_pages` → `extracted_signals`
- Produit des opportunités dans `lead_opportunities`
- Exécution : dans une requête HTTP (pas de queue)

**Les deux pipelines ne se coordonnent pas et ne partagent pas leurs résultats.** La même URL peut être découverte et scrapée par les deux pipelines indépendamment.

### 10.3 Détail du Collector Engine (5 sous-agents)

| Sous-agent | Stratégie | Sources |
|------------|-----------|---------|
| `web_scanner` | Sites officiels + news directes par entreprise | Perplexity + fetch HTML |
| `press_monitor` | Presse (Reuters, Jeune Afrique, Bloomberg, etc.) | Perplexity + fetch |
| `analyst` | Rapports sectoriels, forecasts | Perplexity + Firecrawl |
| `deep_research` | Concurrents, expansion, partenariats — multi-angle | Perplexity + Firecrawl |
| `deep_research_iterative` | Deep research avec itérations Gemini (gaps → follow-up) | Gemini + Perplexity |

### 10.4 MiroFish

Le connecteur MiroFish (`lib/modules/mirofish-connector.ts`) orchestre un pipeline externe en 7 étapes :
1. Upload de matériel + génération d'ontologie
2. Construction graphe de connaissances (async, polling)
3. Création simulation multi-agents
4. Préparation profils agents (async, polling)
5. Lancement simulation (polling)
6. Génération rapport (async, polling)
7. Récupération rapport

Timeouts pouvant aller jusqu'à 15 minutes. Optionnel, désactivé par défaut, activé via `admin_agents` config.

---

## 11. Services externes / APIs

| Service | Usage | Fichiers d'intégration | Criticité |
|---------|-------|------------------------|-----------|
| **Supabase** (PostgreSQL + Auth + Storage) | DB, authentification, stockage fichiers | `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/client.ts` | **Critique** — tout repose dessus |
| **Google Gemini** | Extraction signaux, rapports 2-5, chat, company finder, catégorisation | `lib/ai/gemini.ts` → appelé depuis tous les agents | **Critique** — aucun fallback LLM |
| **Perplexity Sonar** | Recherche web pour collecte et discovery | `lib/ai/perplexity.ts`, `lib/opportunities/services/sonar-service.ts` | **Important** — dégradation gracieuse si absent |
| **Firecrawl** | Scraping web (search + scrape HTML) | `lib/opportunities/services/firecrawl-service.ts`, `lib/agents/collector-engine.ts` | **Important** — dégradation gracieuse |
| **Clearbit** | Autocomplete entreprises | `app/api/companies/search/route.ts`, `lib/agents/company-finder.ts` | **Mineur** — UX dégradée seulement |
| **Logo.dev** | Logos d'entreprises | UI components (4 fichiers), `lib/agents/company-finder.ts` | **Mineur** — fallback initiales |
| **Proxycurl** | Données LinkedIn entreprises | `app/api/agents/scrape/route.ts` (hard-codé) | **Mineur** — usage sporadique |
| **MiroFish** | Simulation prédictive multi-agents | `lib/modules/mirofish-connector.ts` | **Optionnel** — désactivé par défaut |
| **Google OAuth** | Login social | Config Supabase (pas de code dédié) | **Optionnel** — email/OTP comme alternative |

### Variables d'environnement

| Variable | Service |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase (admin) |
| `GEMINI_API_KEY` | Google Gemini |
| `PERPLEXITY_API_KEY` | Perplexity Sonar |
| `FIRECRAWL_API_KEY` | Firecrawl |
| `NEXT_PUBLIC_APP_URL` | URL de l'app (cron callbacks) |
| `SUPERADMIN_EMAIL` | Email du superadmin |
| `AUTH_UI_BYPASS` | Mode prévisualisation (true/false) |

*(Hypothèse)* `CRON_SECRET` est attendu par le cron mais n'est pas dans `.env.local`.

---

## 12. Endpoints API

### Auth

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/auth/status` | Diagnostic session / cookies |

### Veilles

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/watches` | Liste des veilles du compte |
| POST | `/api/watches` | Création veille + liaison entreprises |
| POST | `/api/watches/[id]/companies` | Ajout entreprises à une veille |

### Agents

| Méthode | Route | Rôle | Auth |
|---------|-------|------|------|
| POST | `/api/agents/scrape` | Collecte complète + rapports 2-5 | **Aucune** |
| POST | `/api/agents/synthesize` | Rapport Agent 2 seul | **Aucune** |
| POST | `/api/agents/analyze` | Agents 3 et/ou 4 | Session |
| POST | `/api/agents/strategy` | Agent 4 léger (recommandations) | **Aucune** |
| POST | `/api/agents/predict` | Agent 5 (prédictions) | **Aucune** |

### Opportunités

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/opportunities` | Liste paginée + stats + filtres |
| POST | `/api/opportunities` | Recalcul legacy (recomputeOpportunities) |
| GET | `/api/opportunities/config` | Config UI (watches, taxonomie, secteurs) |
| GET | `/api/opportunities/[id]` | Détail + preuves + signaux |
| PATCH | `/api/opportunities/[id]` | MAJ statut, tags, angle |
| POST | `/api/opportunities/[id]/feedback` | Feedback utilisateur (pouce haut/bas) |
| POST | `/api/opportunities/[id]/generate-message` | Génération message IA |
| POST | `/api/opportunities/run-pipeline` | Pipeline complet veille |

### Recherches sectorielles

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/opportunity-searches` | Liste recherches du compte |
| POST | `/api/opportunity-searches` | Création brouillon recherche |
| GET | `/api/opportunity-searches/[id]` | Détail + count opportunités |
| POST | `/api/opportunity-searches/[id]/run` | Exécution pipeline sectoriel |

### Chat

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/chat` | Envoi message à l'assistant |
| GET | `/api/chat` | Historique messages |
| DELETE | `/api/chat` | Reset conversation |
| POST | `/api/chat/report` | Chat contextualisé sur un rapport |

### Entreprises

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/companies/search` | Autocomplete (Clearbit) |

### Marché

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/marche` | Données dashboard marché |

### Cron

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/cron/run-agents` | Exécution automatique des veilles "due" |

### Admin

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/admin/sources` | Création source web |
| PATCH | `/api/admin/sources/[id]` | MAJ source |
| DELETE | `/api/admin/sources/[id]` | Suppression source |
| POST | `/api/admin/sources/documents` | Upload document |
| GET/POST/PATCH/DELETE | `/api/admin/agents/prediction` | Config agent prédiction |
| GET/POST/PATCH/DELETE | `/api/admin/agents/categorizer` | Config catégoriseur |
| POST | `/api/admin/special-access` | Accès spéciaux |
| POST | `/api/admin/switch-plan` | Changement plan admin |
| GET/POST | `/api/admin/promo-codes` | Gestion codes promo |
| PATCH | `/api/admin/promo-codes/[id]` | MAJ code promo |
| PATCH | `/api/admin/users/[id]` | MAJ utilisateur / rôle |
| PATCH | `/api/admin/plans/[id]` | MAJ plan |

### Debug / Webhooks / Promo

| Méthode | Route | Rôle | Auth |
|---------|-------|------|------|
| GET | `/api/debug/search` | Test chaîne Perplexity/Firecrawl/Gemini | **Aucune** |
| POST | `/api/webhooks/source-added` | Post-hook catégorisation source | Token webhook |
| POST | `/api/promo/apply` | Application code promo | Session |

---

## 13. Dette technique / risques

### 13.1 Sécurité — Routes API non protégées (CRITIQUE)

Les routes suivantes n'ont **aucune vérification d'authentification** :

- `POST /api/agents/scrape` — peut déclencher une collecte complète + génération de rapports pour n'importe quel `watchId`
- `POST /api/agents/predict` — peut générer des prédictions
- `POST /api/agents/strategy` — peut générer des recommandations
- `POST /api/agents/synthesize` — peut générer un rapport
- `GET /api/companies/search` — proxy vers Clearbit sans rate limiting
- `GET /api/debug/search` — expose la chaîne Perplexity/Firecrawl/Gemini
- `GET /api/admin/promo-codes` — liste tous les codes promo (vérif utilisateur mais pas superadmin)

**Risque** : toute personne connaissant un `watchId` valide peut consommer massivement des tokens IA et générer des rapports.

### 13.2 Duplication de logique métier

- **Scoring** : implémenté dans `scoring.ts` (6 sous-scores) ET dans `qualification-agent.ts` (inline) avec des formules et pondérations différentes.
- **Trigger/hypothesis** : implémenté dans `trigger-engine.ts` ET dans `qualification-agent.ts` avec une logique similaire mais pas identique.
- **Extraction de signaux** : prompts LLM dans `collector-engine.ts` (pour la veille) ET dans `signal-extraction-agent.ts` (pour le pipeline) — deux prompts différents pour la même tâche.
- **CompanyLogo** : composant avec logique de fallback copié-collé dans 4 fichiers UI distincts.

### 13.3 Deux systèmes de signaux non connectés

Les tables `signals` (Agent 1 / veille) et `extracted_signals` (pipeline opportunités) stockent des données similaires dans des schémas incompatibles :
- Pas de pont ni de synchronisation entre les deux
- Les opportunités ne bénéficient pas de tous les signaux collectés par Agent 1
- Les rapports ne voient pas les signaux du pipeline opportunités
- Complexité accrue pour toute évolution transverse

### 13.4 Absence de queue / worker

- Tout s'exécute dans des requêtes HTTP Next.js avec timeout 300s
- **Risque de timeout** sur les veilles avec beaucoup d'entreprises
- **Pas de retry** en cas d'échec partiel
- **Pas de parallélisme contrôlé** au niveau infrastructure
- **Pas de monitoring** des jobs en cours ou échoués
- Le cron déclenche les veilles séquentiellement via HTTP self-call

### 13.5 Schéma rapports libre (JSONB)

`reports.content` est un JSONB sans schéma contraint. Chaque agent produit une structure différente. Le frontend fait du rendu conditionnel massif basé sur la présence de champs. Tout changement de structure nécessite de vérifier la rétrocompatibilité.

### 13.6 Absence de données structurées

Les rapports et les analyses reposent à **100% sur du texte extrait par LLM**. Il n'y a :
- Pas de données financières structurées
- Pas de cours/indices macroéconomiques
- Pas de base sectorielle quantitative
- Pas de séries temporelles
- Pas de données géopolitiques

Le système **ne peut pas** produire de comparaisons chiffrées fiables sans source de données structurées en amont.

### 13.7 Embedding vector inutilisé

La colonne `reports.embedding` (vector 1536) est créée avec un index IVFFlat coûteux mais **jamais alimentée ni requêtée** dans le code. Coût en stockage et en maintenance d'index pour rien.

### 13.8 Pas de cache ni de state management frontend

- Chaque page client refait un `fetch` complet à chaque visite
- Pas de SWR, React Query ou cache partagé
- Navigation entre onglets opportunités = rechargement complet
- Pas de préchargement ni d'optimistic updates

### 13.9 Configuration hard-codée

- Plans tarifaires : en dur dans le seed SQL + copie en dur dans la page `/forfait`
- Sous-agents du collector : liste fixe dans le code
- Taxonomie signaux et secteurs : fichiers TypeScript (modification = redéploiement)
- Pays : liste statique dans `lib/countries.ts`
- Prompts LLM : en dur dans le code, pas de versioning

### 13.10 Traçabilité insuffisante

- `console.log` partout, pas de logging structuré
- Pas d'audit trail pour les actions admin
- Pas de versioning des prompts LLM
- Pas de stockage des réponses LLM brutes
- `pipeline_runs` existe mais pas d'interface de consultation
- Pas de corrélation de requêtes (request ID)

### 13.11 Gestion des erreurs fragile

- Parsing JSON des réponses LLM avec fallback minimal
- Pas de circuit breaker pour les services externes
- Pas de healthcheck automatique
- Erreurs silencieuses dans plusieurs endroits (catch vide)
- Pas de dead letter queue pour les échecs de pipeline

### 13.12 Monolithe couplé

- Toute la logique dans un seul déploiement Next.js
- Les "agents" ne sont pas des services indépendants mais des fonctions appelées séquentiellement dans une requête HTTP
- L'ajout d'un nouveau type d'agent ou de source nécessite de modifier le monolithe
- Pas de séparation compute / API / workers

### 13.13 Tests quasi inexistants

- Un seul fichier de tests : `lib/opportunities/__tests__/sector-search.test.ts` (22 tests)
- Pas de framework de test (Jest, Vitest) dans les dépendances
- Exécution manuelle via `npx tsx`
- Aucun test pour les agents, rapports, scoring, API routes

### 13.14 Inconsistance auth / résolution de compte

- La plupart des routes utilisent `profiles.account_id` pour résoudre le compte
- L'API `/api/marche` utilise `accounts.user_id` (champ qui n'existe pas dans le schéma 001) — *(hypothèse : bug potentiel ou ajouté dans une migration non documentée)*
- L'API `/api/admin/promo-codes` GET ne vérifie pas le rôle superadmin, contrairement au POST

---

## 14. Fichiers critiques

### Frontend

| Fichier | Rôle | Importance |
|---------|------|------------|
| `app/(dashboard)/layout.tsx` | Shell principal, auth, profil, plan | Comprendre le contexte utilisateur |
| `app/(dashboard)/opportunities/OpportunitiesClient.tsx` | Module opportunités complet | Interface principale opportunités |
| `app/(dashboard)/opportunities/OpportunityDetail.tsx` | Drawer détail + actions | UX opportunités |
| `app/(dashboard)/opportunities/SectorSearchPanel.tsx` | Recherche sectorielle | Nouveau parcours |
| `app/(dashboard)/veilles/[id]/reports/[reportId]/page.tsx` | Rendu rapports | Comprendre l'affichage des rapports |
| `app/(dashboard)/veilles/new/page.tsx` | Création veille multi-étapes | Parcours création |
| `components/dashboard/Sidebar.tsx` | Navigation principale | Structure de l'app |

### Backend — Agents et rapports

| Fichier | Rôle | Importance |
|---------|------|------------|
| `app/api/agents/scrape/route.ts` | Route pivot : collecte + rapports 2-5 | Point d'entrée principal du pipeline |
| `lib/agents/collector-engine.ts` | Moteur collecte 5 sous-agents | Cœur de la collecte |
| `lib/agents/report-generator.ts` | Agent 2 : rapport de veille | Premier rapport |
| `lib/agents/report-challengers.ts` | Challengers + enrichissement | Qualité rapports |
| `lib/agents/market-analyst.ts` | Agent 3 : analyse marché | Rapport marché |
| `lib/agents/strategy-advisor.ts` | Agent 4 : stratégie | Recommandations |
| `lib/agents/prediction-engine.ts` | Agent 5 : prédictions | Rapport prédictif |

### Backend — Opportunités

| Fichier | Rôle | Importance |
|---------|------|------------|
| `lib/opportunities/pipeline.ts` | Orchestrateur pipeline veille | Flux principal opportunités |
| `lib/opportunities/sector-search-pipeline.ts` | Orchestrateur pipeline sectoriel | Recherche par secteur |
| `lib/opportunities/agents/qualification-agent.ts` | Scoring + trigger + preuves | Qualité des opportunités |
| `lib/opportunities/agents/discovery-agent.ts` | Découverte URLs | Première étape pipeline |
| `lib/opportunities/scoring.ts` | Scoring legacy | Comprendre les deux systèmes |
| `lib/opportunities/trigger-engine.ts` | Trigger engine legacy | Comprendre les deux systèmes |
| `lib/opportunities/signals-taxonomy.ts` | Taxonomie des signaux | Référentiel métier |
| `lib/opportunities/sector-config.ts` | Config par verticale | Référentiel sectoriel |
| `lib/opportunities/sector-search-taxonomy.ts` | Templates recherche | Intelligence sectorielle |

### Backend — Services IA

| Fichier | Rôle | Importance |
|---------|------|------------|
| `lib/ai/gemini.ts` | Wrapper Google Gemini | Cœur IA |
| `lib/ai/perplexity.ts` | Wrapper Perplexity | Recherche web |
| `lib/opportunities/services/sonar-service.ts` | Service Sonar discovery | Pipeline discovery |
| `lib/opportunities/services/firecrawl-service.ts` | Service Firecrawl scraping | Pipeline fetch |
| `lib/modules/mirofish-connector.ts` | Connecteur MiroFish | Simulation prédictive |

### Base de données

| Fichier | Rôle | Importance |
|---------|------|------------|
| `supabase/migrations/001_schema.sql` | Schéma fondateur (15 tables) | Structure de base |
| `supabase/migrations/012_lead_opportunities.sql` | Tables opportunités | Module opportunités |
| `supabase/migrations/014_opportunity_pipeline.sql` | Tables pipeline | Pipeline discovery-to-qualify |
| `supabase/migrations/014_015_combined.sql` | Migration combinée idempotente | Référence complète |

### Configuration

| Fichier | Rôle | Importance |
|---------|------|------------|
| `middleware.ts` | Auth, routing, protection admin | Sécurité |
| `next.config.mjs` | Config Next.js | Build/deploy |
| `.env.local` | 9 variables d'environnement | Secrets |
| `package.json` | 10 dépendances runtime | Stack |
| `lib/auth/ui-bypass.ts` | Mode preview | Dev workflow |

---

## 15. Résumé exécutif

### Synthèse

MarketLens est un **monolithe Next.js 14 (App Router)** avec Supabase comme unique backend, implémentant un SaaS de veille commerciale ciblant l'Afrique. L'application couvre un parcours fonctionnel complet : création de veilles → collecte automatique de signaux web (Perplexity Sonar, Firecrawl, Gemini) → chaîne de 5 rapports IA (synthèse → marché → stratégie → prédictions avec challengers) → détection d'opportunités commerciales qualifiées avec scoring et preuves → recherche sectorielle par pays. L'architecture repose sur des routes API Next.js comme pseudo-backend, des agents IA implémentés comme fonctions TypeScript séquentielles (pas de queue), et PostgreSQL via Supabase pour tout le stockage. L'interface utilise Tailwind CSS sans design system formel, avec un mélange de Server Components (SSR) et Client Components (fetch API). Le projet contient ~30 tables, ~36 routes API, 7 agents/modules IA et 2 pipelines de collecte distincts.

### Forces

- **Couverture fonctionnelle large** pour un MVP : veilles, rapports multi-niveaux, opportunités, assistant IA, recherche sectorielle, admin, gestion de plans
- **Pipeline de rapports bien chaînée** : 5 agents avec chaînage explicite et challengers pour enrichissement
- **Taxonomie signaux et secteurs** bien documentée et extensible sans refonte majeure
- **Qualification des opportunités** avec preuves structurées, confiance et display status — bonne base de crédibilité
- **Code TypeScript typé** avec interfaces explicites
- **Architecture pipeline opportunités** (discovery → fetch → extract → qualify) bien découpée en couches

### Fragilités

- **5+ routes API critiques sans authentification** — risque de consommation non autorisée de tokens IA
- **Deux systèmes de signaux (`signals` vs `extracted_signals`)** non connectés, créant des silos de données
- **Deux systèmes de scoring** avec des formules différentes pour la même fonctionnalité
- **Aucune queue ni worker** — risques de timeout et pas de retry
- **100% dépendant du texte LLM** pour les rapports — pas de données structurées ni quantitatives
- **Tests quasi inexistants** (1 fichier, 22 tests)
- **Pas de cache frontend** — rechargement complet à chaque navigation

### Ce qui semble prêt à être étendu

- **Taxonomie signaux/secteurs** : ajouter des types ou secteurs = modifier un fichier TS
- **Pipeline opportunités** (discovery → qualify) : architecture en couches, ajout de nouvelles étapes faisable
- **Agents rapports** : ajouter un Agent 6 suivrait le pattern existant
- **UI opportunités** : onglets, filtres, détail déjà structurés

### Ce qui devra probablement être refondu avant les évolutions futures

- **Unification des signaux** : fusionner ou connecter `signals` et `extracted_signals` avant d'ajouter des signaux géopolitiques/macroéconomiques
- **Scoring unique** : un seul engine de scoring au lieu de deux, extensible avec de nouveaux critères (géopolitique, macro)
- **Queue/worker** : indispensable avant de scaler les agents (BullMQ, Inngest, ou Supabase Edge Functions)
- **Sécurisation des routes API** : middleware auth systématique avant ouverture à plus d'utilisateurs
- **Données structurées** : intégrer des sources quantitatives (financières, macro, sectorielles) pour la fiabilité des rapports
- **Couche de preuves** : le module `opportunity_evidence` est un bon début mais les rapports n'ont pas d'équivalent — il faudra un système de traçabilité signal→affirmation
- **Design system** : extraire les composants partagés avant d'ajouter de nouvelles pages
- **Observabilité** : logging structuré, monitoring pipelines, alerting avant de complexifier l'architecture
