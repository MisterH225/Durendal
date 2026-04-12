# Master Architecture Review & Consolidation Plan

**Date**: April 12, 2026  
**Scope**: Full codebase audit of the MarketLens probabilistic intelligence platform  
**Method**: Source code inspection of all 453+ tracked files, 45 migrations, 88 API routes, 22 worker jobs, 6 adapter implementations

---

## 1. Executive Architecture Summary

### What the platform currently is

A **Next.js 14 monorepo** with a co-located PM2 worker, backed by **Supabase/Postgres**, using **Gemini** and **Perplexity** as AI engines. It serves two products from one codebase:

1. **Forecast Platform** — public/semi-public probabilistic forecasting with AI + crowd + external market probabilities, resolution engine, rewards/gamification, and a signal reader with AI analysis.
2. **Veille Concurrentielle** — competitive intelligence product with watches, signal collection, multi-agent analysis pipeline, reports, and opportunities.

### Major subsystems already present

| Subsystem | Status | Location |
|-----------|--------|----------|
| Multi-source ingestion (6 providers) | **Operational** | `lib/ingestion/` |
| Forecast question generation (Gemini + dedup) | **Operational** | `lib/forecast/question-generator.ts` |
| AI/crowd/blended probability engine | **Operational** | Worker jobs + `forecast_event_queue` |
| Resolution engine (proposals, evidence, disputes) | **Operational** | `lib/resolution/` + worker jobs |
| Rewards & gamification (XP, badges, tiers, streaks, leaderboards) | **Operational** | `lib/rewards/` + worker jobs |
| Intel workflow (materiality, recalculation, outbox) | **Partially operational** | `lib/forecast/workflow/` + intel jobs |
| Veille signal collection + agents | **Operational** | `lib/agents/` + veille jobs |
| Opportunities pipeline | **Operational** | `lib/opportunities/` |
| Admin tooling (forecast, resolution, intel, ingestion) | **Operational** | `app/admin/` + API routes |
| Event-driven queue (Postgres-based) | **Operational** (forecast events only) | `forecast_event_queue` table |

### Architectural style

**Modular monolith** with a Postgres-backed event queue. Domain logic is organized by feature (`lib/forecast/`, `lib/ingestion/`, `lib/agents/`, etc.) with a single worker process consuming a unified queue. No microservices, no external message broker.

### Alignment with target vision

**Already aligned:**
- Event-driven workflow via `forecast_event_queue` + typed events in `packages/contracts`
- Multi-source ingestion with adapter pattern
- Signal deduplication and source trust scoring
- Materiality detection + recalculation requests
- Resolution workflow with evidence, proposals, disputes
- Reward system with anti-gaming (Brier scoring, streaks)
- Structured domain types in `lib/forecast/workflow/types.ts`
- Service interfaces defined in `lib/forecast/workflow/interfaces.ts`

**Not aligned:**
- Two parallel signal systems (`signals` table for veille vs `external_signals` for ingestion vs `forecast_signal_feed` for forecast) that don't converge
- Intel workflow types defined in 3 places (`workflow/types.ts`, `workflow/payloads.ts`, `packages/contracts/intel-workflow.ts`)
- Ingestion events (`signal.ready_for_enrichment`) are emitted but **never consumed** — dead letters marked `done`
- No unified "Event" object — `forecast_events`, `intel_events`, and ingestion `event_link_candidates` are separate concepts
- No evidence/document layer beyond `source_documents` storage bucket and `resolution_evidence`
- Question generator creates events from Gemini output, not from ingested signals

---

## 2. Current-State System Map

### Module structure (observed)

```
lib/
  ai/              — Gemini + Perplexity clients (2 files)
  agents/          — 9 veille agents (collector, analyzer, report, strategy, prediction...)
  auth/            — email domain + UI bypass (2 files)
  forecast/
    workflow/      — Intel domain model, scoring, outbox, flows doc (14 files)
    queue/         — forecast event publisher (1 file)
    question-generator.ts — event/question auto-creation with semantic dedup
    mock-articles.ts — UI analysis types + demo data
    locale.ts
  ingestion/
    adapters/      — newsdata, finlight, gdelt, polymarket, dome, perplexity (7 files)
    flows/         — news-general, news-financial, event-discovery, market-snapshot (5 files)
    engine.ts, dedup.ts, trust.ts, persist.ts, events.ts, observability.ts, types.ts, utils.ts
  opportunities/   — commercial pipeline (25 files + tests)
  resolution/      — engine, proposal generator, source fetcher, confidence (5 files)
  rewards/         — badges, streaks, scoring, pro-grants, types (5 files)
  i18n/, supabase/, geo/, modules/
  article-extractor.ts, countries.ts

apps/worker/src/
  bootstrap.ts     — main loop (scheduler tick + queue consume)
  scheduler.ts     — 15 scheduled tasks
  queue/
    consumer.ts    — forecast_event_queue processor
    topics.ts      — FORECAST_TOPICS + INTEL_TOPICS
  jobs/
    forecast/      — ai-forecast, blended-recompute, news-signal, question-generator, resolution-scoring
    resolution/    — check, finalize, proposal, source
    rewards/       — process, streak, leaderboard
    veille/        — signal-collector
    intel/         — material-change, recalculation, veille-export
    ingestion/     — orchestrator

packages/contracts/src/
  commands.ts      — SubmitForecast, RequestAIForecast, ResolveQuestion
  events.ts        — ForecastEventType union + EventEnvelope + payloads
  intel-workflow.ts — IntelWorkflowEventName union
```

### Database tables by domain (45 migrations, ~70 tables)

| Domain | Tables | Key relationships |
|--------|--------|-------------------|
| **Core** | `plans`, `accounts`, `profiles`, `chat_messages`, `alerts`, `promo_codes`, `referrals` | `profiles` → `accounts` → `plans` |
| **Veille** | `watches`, `companies`, `watch_companies`, `sources`, `signals`, `reports`, `recommendations`, `agent_jobs` | `signals` → `watches` → `accounts` |
| **Opportunities** | `lead_opportunities`, `contact_candidates`, `opportunity_evidence`, `extracted_signals`, `discovered_sources`, `fetched_pages`, `pipeline_runs`, `opportunity_searches` | `lead_opportunities` → `accounts` |
| **Forecast** | `forecast_channels`, `forecast_events`, `forecast_questions`, `forecast_user_forecasts`, `forecast_ai_forecasts`, `forecast_probability_history`, `forecast_signal_feed`, `forecast_event_queue`, `forecast_brier_scores`, `forecast_leaderboard`, `forecast_question_comments`, `forecast_question_outcomes`, `forecast_user_outcome_votes`, `forecast_region_weights`, `forecast_event_merge_log` | `questions` → `events` → `channels` |
| **Resolution** | `resolution_profiles`, `resolution_jobs`, `resolution_evidence`, `resolution_proposals`, `resolution_disputes`, `resolution_audit_log` | `resolution_*` → `forecast_questions` |
| **Rewards** | `badge_definitions`, `tier_definitions`, `user_badges`, `user_reward_profiles`, `reward_points_ledger`, `streak_states`, `tier_memberships`, `feature_unlocks`, `leaderboard_snapshots`, `reward_notifications` | `user_*` → `profiles` |
| **Intel** | `intel_entities`, `intel_events`, `intel_event_states`, `intel_event_context_snapshots`, `intel_event_signal_links`, `intel_question_event_links`, `intel_signal_entity_links`, `intel_recalculation_requests`, `intel_recalculation_jobs`, `intel_probability_change_log`, `intel_analyst_review_tasks`, `intel_veille_exports`, `intel_source_profiles`, `intel_workflow_events`, `intel_workflow_failures`, `intel_question_recalc_cooldown` | `intel_events` ↔ `forecast_questions` via links |
| **Ingestion** | `external_source_providers`, `source_trust_profiles`, `source_ingestion_runs`, `raw_ingestion_items`, `external_signals`, `signal_source_links`, `signal_dedup_groups`, `event_link_candidates`, `external_markets`, `external_market_snapshots`, `external_market_question_links`, `ingestion_failures`, `provider_rate_limit_state` | `external_signals` → `providers`; `market_question_links` → `forecast_questions` |

### Fragmentation observed (FACT)

Three separate "signal" tables:
- `signals` — veille competitive intelligence signals (linked to `watches`)
- `external_signals` — ingestion layer normalized signals (linked to `providers`)
- `forecast_signal_feed` — forecast news signals (linked to `channels`/`questions`)

Three separate "event" concepts:
- `forecast_events` — editorial grouping for forecast questions
- `intel_events` — intelligence events with states/context
- Ingestion `event_link_candidates` — proposed links, never consumed

Two definitions of `IntelWorkflowEventName`:
- `packages/contracts/src/intel-workflow.ts`
- `lib/forecast/workflow/payloads.ts`

---

## 3. Architecture Gap Analysis

| Dimension | Status | Details |
|-----------|--------|---------|
| **Ontology / domain model** | **Partially present** | Strong types in `workflow/types.ts` and `ingestion/types.ts`, but fragmented across modules. No single canonical `Signal` or `Event` type. |
| **Event-driven workflow** | **Partially present** | `forecast_event_queue` works for forecast events. Intel uses poll-based `intel_recalculation_jobs`. Ingestion emits events that are **never consumed**. No unified event bus. |
| **Ingestion & normalization** | **Present** | 6 adapters, dedup, trust scoring, persistence. Gap: signals go into `external_signals` but never flow to `forecast_events` or `intel_events` automatically. |
| **Evidence / document layer** | **Missing** | Only `resolution_evidence` (resolution-specific) and `source_documents` storage bucket. No claim extraction, PDF parsing, or structured evidence objects. |
| **Forecasting / probability engine** | **Present** | AI probability (Gemini), crowd (median), blended (weighted), history, Brier scoring all operational. Gap: external market probability from ingestion isn't automatically linked to questions. |
| **Resolution engine** | **Present** | Full pipeline: check → source fetch → proposal → disputes → finalize → scoring. Operational. |
| **Reward / leaderboard engine** | **Present** | XP, badges, tiers, streaks, leaderboard snapshots, Pro grants. Fully operational. |
| **Admin / review tooling** | **Present** | Forecast admin, resolution admin, intel analyst queue, ingestion status API. Gap: no ingestion admin UI page (API only). |
| **Observability / auditability** | **Partially present** | `intel_workflow_events` as outbox/audit log. `resolution_audit_log`. `ingestion_failures`. `forecast_event_merge_log`. Structured JSON logging in ingestion. Gap: no unified metrics or dashboard. |
| **Veille integration** | **Partially present** | `intel_veille_exports` table exists but export job is a stub (marks `done`, no artifact). Signal-to-veille flow is not wired. |

---

## 4. Core Domain Model Recommendation

### Mapping existing concepts to target ontology

| Target Object | Current Implementation | Source of Truth | Mutable? |
|---------------|----------------------|-----------------|----------|
| **Signal** | `signals` (veille), `external_signals` (ingestion), `forecast_signal_feed` (forecast) | Should converge: `external_signals` as canonical store, with `signal_type` discriminator | Append-only (immutable once persisted) |
| **Event** | `forecast_events` (editorial) + `intel_events` (intelligence) | Keep separate: `forecast_events` = editorial grouping, `intel_events` = intelligence tracking. Link via `intel_question_event_links`. | `forecast_events`: mutable status. `intel_events`: append-only states via `intel_event_states`. |
| **EventState** | `intel_event_states` | `intel_event_states` | Append-only |
| **Entity** | `intel_entities` | `intel_entities` | Mutable |
| **Document** | `source_documents` (storage only) | **Missing** — needs `documents` table | Append-only |
| **Claim** | **Not implemented** | Defer to Phase 7 | Append-only |
| **Question** | `forecast_questions` | `forecast_questions` | Mutable (status, probabilities) |
| **Forecast** | `forecast_user_forecasts` + `forecast_ai_forecasts` | Both tables | Append-only (versioned via `is_current`) |
| **ProbabilityState** | `forecast_probability_history` + `intel_probability_change_log` | Both tables (different granularity) | Append-only |
| **Resolution** | `resolution_jobs` + `resolution_proposals` + `resolution_disputes` | `resolution_jobs` | Mutable (status transitions) |
| **Alert** | `alerts` (veille) + `reward_notifications` (gamification) | Both tables | Mutable (seen flag) |
| **Reward** | `reward_points_ledger` + `user_badges` + `streak_states` | `user_reward_profiles` as projection | Append-only (ledger), mutable (profile) |
| **VeilleExport** | `intel_veille_exports` | `intel_veille_exports` | Mutable (status) |
| **Source** | `sources` (veille) + `external_source_providers` (ingestion) + `source_trust_profiles` + `intel_source_profiles` | Fragmented — consolidate trust into `source_trust_profiles` | Mutable |
| **Market** | `external_markets` + `external_market_snapshots` | `external_markets` | Mutable (status, last_probability) |

### Key recommendation

Do NOT merge `forecast_events` and `intel_events`. They serve different purposes:
- `forecast_events` = editorial container for questions (created by question-generator or admin)
- `intel_events` = intelligence tracking object with states, context snapshots, signal links

Instead, strengthen the link between them via `intel_question_event_links` and ensure the ingestion layer feeds into `intel_events` (not directly into `forecast_events`).

---

## 5. Canonical Architecture Blueprint

### Layer map

| Layer | Purpose | Current Status | Verdict |
|-------|---------|----------------|---------|
| **Ingestion Adapters** | Fetch from external sources | 6 adapters operational | **KEEP** |
| **Normalization** | `NormalizedSignal` / `NormalizedMarket` | Present in `lib/ingestion/types.ts` | **KEEP** |
| **Signal Store** | Persist + dedup + trust | `external_signals` + dedup groups | **KEEP, extend** — add flow to `intel_events` |
| **Event Intelligence** | Link signals to events, detect material changes | `intel_events` + materiality + recalc | **REFACTOR** — wire ingestion consumer |
| **Event-Driven Workflow** | Queue + consumers + outbox | `forecast_event_queue` + `intel_workflow_events` | **KEEP, extend** — add missing consumer handlers |
| **Probability Engine** | AI + crowd + market + blended | Worker jobs fully operational | **KEEP** |
| **Evidence Layer** | Documents, claims, evidence links | Only `resolution_evidence` | **BUILD LATER** (Phase 7) |
| **Governance** | Resolution, admin review, analyst tasks, audit | Present across resolution + intel | **KEEP with minor cleanup** |
| **Rewards** | XP, badges, tiers, streaks, leaderboards | Fully operational | **KEEP** |
| **UI / Read Models** | Next.js pages, forecast reader, admin | Extensive | **KEEP** |
| **Export** | Veille export to downstream products | Stub only | **BUILD** (Phase 5) |

---

## 6. Event-Driven Workflow Plan

### Current mechanism

- **Queue**: `forecast_event_queue` table in Postgres (poll-based, `consumer.ts`)
- **Producer**: `publishForecastEvent()` in `lib/forecast/queue/publisher.ts`
- **Consumer**: `apps/worker/src/queue/consumer.ts` — switch on `event_type`
- **Outbox**: `intel_workflow_events` for audit/observability

### Critical gap: ingestion events are dead

`lib/ingestion/events.ts` emits `ingestion.signal.ready_for_enrichment` and `ingestion.market.move.detected` into `forecast_event_queue`, but the consumer's switch statement has no handlers for them — they hit `default` and are marked `done`.

### Recommended changes

1. **Add consumer handlers** for ingestion events in `consumer.ts`:
   - `ingestion.signal.ready_for_enrichment` → trigger signal-to-event linking + enrichment
   - `ingestion.market.move.detected` → trigger market-question link check + probability update

2. **Keep Postgres queue** — it works, it's simple, startup-appropriate. No Kafka/Redis needed yet.

3. **Add intel event types** to the consumer — currently intel uses poll-based `intel_recalculation_jobs`. This works but should migrate to queue-driven in Phase 3.

### What must remain synchronous for now

- User forecast submission → blended recompute (already async via queue, correct)
- Article extraction in `analyze-signal` route (must complete before AI analysis)
- Question resolution finalization (multi-step but each step is queue-driven, correct)

---

## 7. Multi-Source Ingestion Consolidation

### Current state

| Provider | Adapter | Status | Flow(s) |
|----------|---------|--------|---------|
| NewsData.io | `newsdata.ts` | Operational | news-general, news-financial |
| Finlight | `finlight.ts` | Operational | news-financial |
| GDELT | `gdelt.ts` | Operational | news-general, event-discovery |
| Polymarket | `polymarket.ts` | Operational | market-snapshot |
| Dome | `dome.ts` | **Stub** | market-snapshot |
| Perplexity | `perplexity.ts` | Operational | news-general, news-financial |

### What works well

- Generic `SourceAdapter` interface with `healthCheck`, `fetch`, `normalizeSignal`, `dedupKeys`
- `runIngestion` engine orchestrates fetch → normalize → dedup → persist → emit
- `signal_dedup_groups` with multi-layer matching (URL, title hash, provider+external_id)
- `source_trust_profiles` per domain
- Raw payloads preserved in `raw_ingestion_items`

### What's missing

1. **Enrichment consumer** — signals are queued for enrichment but nothing processes them
2. **Signal-to-event linking** — `event_link_candidates` table exists but no code writes to it
3. **Market-to-question linking** — `external_market_question_links` table exists but no automated matching

### Provider coupling

Well-isolated. Each adapter is self-contained. The `ProviderId` union type in `types.ts` is the only coupling point. No provider-specific logic leaks into the engine or flows.

---

## 8. Probability Engine Architecture

### Current implementation (operational)

| Component | Location | Status |
|-----------|----------|--------|
| AI probability | `ai-forecast.job.ts` → Gemini + search → `forecast_ai_forecasts` | **Working** |
| Crowd probability | `blended-recompute.job.ts` → median of `forecast_user_forecasts` | **Working** |
| External market probability | `external_market_snapshots` + `external_market_question_links` | **Schema exists, not wired to blended** |
| Blended probability | `blended-recompute.job.ts` → weighted average | **Working** (AI + crowd only) |
| History | `forecast_probability_history` | **Working** |
| Recalculation | `intel_recalculation_requests` + `intel_recalculation_jobs` | **Working** (poll-based) |
| Material change detection | `material-change.job.ts` + `scoring.ts` | **Working** (simplified factors) |

### Gap: external market probability not in blend

The ingestion layer persists market snapshots in `external_market_snapshots` and the linking table `external_market_question_links` exists, but `blended-recompute.job.ts` only uses AI + crowd. Adding market probability to the blend requires:

1. Query `external_market_question_links` for the question
2. Get latest `external_market_snapshots.probability`
3. Add as third input to the blended formula

This is a Phase 4 task — straightforward, low risk.

---

## 9. Evidence and Document Layer

### Current state

- `source_documents` Supabase storage bucket (upload only, migration 010)
- `resolution_evidence` table (URLs + snippets, resolution-specific)
- `article-extractor.ts` extracts article body from URLs
- AI analysis in `analyze-signal` route produces structured implications

### Recommended evolution path (Phase 7)

1. Add `documents` table (title, type, url, content_text, metadata, source_id)
2. Add `claims` table (document_id, claim_text, confidence, entity_links)
3. Add `evidence_links` table (claim_id, question_id or event_id, relevance)
4. Extend `article-extractor.ts` to handle PDFs (via external service)
5. Use existing `source_trust_profiles` for document trust

**Defer**: claim extraction, hybrid retrieval, embedding-based search — these are Phase 7+.

---

## 10. Governance and Review Layer

### Current state (mostly operational)

| Component | Status | Location |
|-----------|--------|----------|
| Resolution proposals | **Working** | `resolution_proposals` + worker jobs |
| Resolution disputes | **Working** | `resolution_disputes` + admin UI |
| Resolution audit log | **Working** | `resolution_audit_log` |
| Analyst review tasks | **Working** | `intel_analyst_review_tasks` + admin UI |
| Source quality governance | **Partial** | `source_trust_profiles` (ingestion) + `intel_source_profiles` (intel) — duplicated |
| Manual overrides | **Working** | Admin API routes for resolve, edit, status change |
| Event merge tracking | **Working** | `forecast_event_merge_log` |

### Recommendation

- **MERGE** `source_trust_profiles` (ingestion) and `intel_source_profiles` (intel) into one table — they track the same concept (source domain trust)
- **KEEP** everything else

---

## 11. Rewards and Leaderboard Layer

### Current state: FULLY OPERATIONAL

Subsystems:
- XP ledger (`reward_points_ledger`) with action-based points and multipliers
- Badges (28 definitions seeded, `user_badges`)
- Tiers (bronze → elite, `tier_memberships`)
- Streaks (5 types, grace periods, `streak_states`)
- Leaderboard snapshots (weekly, monthly, quarterly, `leaderboard_snapshots`)
- Pro day grants (tier-based + leaderboard-based)
- Notifications (`reward_notifications`)

### Recommendation: KEEP AS IS

This is a self-contained, well-designed subsystem. It should remain its own domain (`lib/rewards/`). No refactoring needed.

---

## 12. Data Architecture

### Current schema health

**Well-structured**: Proper FK constraints, CHECK constraints, indexes, RLS policies throughout. Append-only patterns used for history tables. Idempotency keys on workflow events.

**Issues**:
- Duplicate migration files (`014_opportunity_pipeline.sql` + `014_015_combined.sql`)
- Some tables have RLS enabled but no policies (`account_signals`)
- `forecast_user_forecasts.user_id` has no FK to `profiles` or `auth.users`
- Three separate signal stores (architectural, not schema issue)

### What can be added incrementally

- `documents` table (Phase 7)
- `claims` + `evidence_links` (Phase 7)
- New columns on `external_signals` for enrichment results
- Market probability column on blended recompute

### What requires migration

- Merging `intel_source_profiles` into `source_trust_profiles` (data migration)
- Adding `market_probability` to `forecast_questions` blended inputs (schema + code)

---

## 13. Refactor Strategy

| Area | Verdict | Rationale |
|------|---------|-----------|
| `lib/ingestion/` (adapters, engine, dedup, trust) | **KEEP** | Clean architecture, well-isolated |
| `lib/forecast/question-generator.ts` | **KEEP** | Recently improved with semantic dedup |
| `lib/forecast/workflow/` (types, scoring, outbox) | **KEEP with minor cleanup** | Good domain model, some doc-only files (`flows.ts`) |
| `lib/resolution/` | **KEEP** | Complete pipeline |
| `lib/rewards/` | **KEEP** | Self-contained, well-typed |
| `lib/agents/` (collector, analyzer, etc.) | **KEEP** | Operational, tightly scoped |
| `lib/ai/` (gemini, perplexity) | **KEEP** | Clean clients |
| `lib/opportunities/` | **KEEP** | Has tests, documented |
| `apps/worker/src/queue/consumer.ts` | **REFACTOR** | Add missing ingestion + intel event handlers |
| `apps/worker/src/jobs/intel/material-change.job.ts` | **REFACTOR** | Hardcoded materiality factors should use `scoring.ts` properly |
| `packages/contracts/` | **REFACTOR** | Merge `intel-workflow.ts` event names with `lib/forecast/workflow/payloads.ts` — single source of truth |
| `lib/forecast/workflow/payloads.ts` | **MERGE** into `packages/contracts/` | Eliminate duplication |
| `lib/forecast/workflow/database-rows.ts` | **EXTRACT** | Generate from Supabase types when available |
| `lib/forecast/workflow/flows.ts` | **DEFER** | Documentation file, not executable — move to `docs/` or delete |
| `lib/forecast/workflow/interfaces.ts` | **KEEP** | Good port definitions for future DI |
| Signal convergence (3 tables) | **DEFER** | Too risky to merge now; instead, build bridges (enrichment consumer) |
| Source trust consolidation | **MERGE** | `intel_source_profiles` → `source_trust_profiles` |
| `intel_veille_exports` job | **REBUILD later** | Current stub needs actual export logic |
| `app/api/forecast/analyze-signal/route.ts` | **KEEP** | Recently enriched with event-driven context |
| Dashboard redirect pages | **KEEP with minor cleanup** | They work, low priority |

---

## 14. Technical Debt and Risks

| Issue | Severity | Impact |
|-------|----------|--------|
| **Ingestion events silently dropped** | HIGH | `ingestion.signal.ready_for_enrichment` is marked `done` without processing — signals never flow to events |
| **Three signal stores** | MEDIUM | Fragmentation makes it impossible to query "all signals about topic X" across veille + ingestion + forecast |
| **Duplicate IntelWorkflowEventName** | MEDIUM | `packages/contracts/` and `lib/forecast/workflow/payloads.ts` can drift |
| **Duplicate source trust tables** | LOW | `intel_source_profiles` and `source_trust_profiles` track same concept |
| **No generated Supabase types** | MEDIUM | `any` casts throughout API routes and pages; `database-rows.ts` is manually maintained |
| **`next.config.mjs` ignores TS/ESLint errors** | MEDIUM | Build passes with unknown type errors |
| **Material change job uses hardcoded factors** | LOW | `scoring.ts` exists but job bypasses some of its logic |
| **No tests for ingestion, worker jobs, or API routes** | HIGH | Only `lib/opportunities/` and `lib/forecast/workflow/` have tests |
| **Veille export is a no-op stub** | LOW | `intel_veille_exports` rows are created but never produce artifacts |
| **`forecast_user_forecasts.user_id` has no FK** | LOW | Logical key only; could cause orphaned rows |

---

## 15. Recommended Target Module Structure

```
lib/
  domain/                    # (NEW) Canonical types, shared across all modules
    signal.ts                # Unified signal types + mappers from legacy tables
    event.ts                 # Event, EventState types
    question.ts              # Question + probability types
    market.ts                # Market + snapshot types
    entity.ts                # Entity types
  ingestion/                 # KEEP as-is
    adapters/
    flows/
    engine.ts, dedup.ts, trust.ts, persist.ts, events.ts, ...
  forecast/                  # KEEP, reorganize slightly
    question-generator.ts
    queue/publisher.ts
    locale.ts
  intel/                     # EXTRACT from forecast/workflow/ (rename)
    types.ts                 # From workflow/types.ts
    scoring.ts
    outbox.ts
    observability.ts
    idempotency.ts
    feature-flag.ts
  resolution/                # KEEP
  rewards/                   # KEEP
  agents/                    # KEEP
  ai/                        # KEEP
  opportunities/             # KEEP
  evidence/                  # (FUTURE) Documents, claims, evidence links
  supabase/                  # KEEP
  i18n/, auth/, geo/         # KEEP

apps/worker/src/
  jobs/
    forecast/                # KEEP
    resolution/              # KEEP
    rewards/                 # KEEP
    veille/                  # KEEP
    intel/                   # KEEP
    ingestion/               # KEEP + add enrichment consumer job
  queue/
    consumer.ts              # REFACTOR — add ingestion + intel handlers
    topics.ts                # Consolidate all event types

packages/contracts/src/      # Single source of truth for event names + envelopes
  events.ts                  # ALL event types (forecast + intel + ingestion)
  commands.ts
  index.ts
```

---

## 16. Migration Plan

### Phase 0: Audit and naming cleanup (1-2 days)

- **Goal**: Eliminate duplication, fix naming
- **Changes**: 
  - Move `IntelWorkflowEventName` from `payloads.ts` → `packages/contracts/intel-workflow.ts` (single source)
  - Move `flows.ts` (doc-only) to `docs/intel-workflow/flows.md`
  - Add missing FK on `forecast_user_forecasts.user_id`
- **Risk**: None
- **Success**: Zero duplicate type definitions

### Phase 1: Wire ingestion to intelligence (3-5 days)

- **Goal**: Ingested signals flow to events and trigger recalculation
- **Changes**:
  - Add `ingestion.signal.ready_for_enrichment` handler in `consumer.ts`
  - Implement signal-to-event linking logic (write to `event_link_candidates`, auto-link high-confidence matches to `intel_event_signal_links`)
  - Add `ingestion.market.move.detected` handler — check `external_market_question_links`, trigger blended recompute if linked
- **Risk**: Medium — new async flow needs monitoring
- **Backward compat**: Fully backward compatible (new handlers, no breaking changes)
- **Success**: Ingested signals automatically link to intel events; market moves trigger probability updates

### Phase 2: External market probability in blend (2-3 days)

- **Goal**: Three-way probability blend (AI + crowd + market)
- **Changes**:
  - Modify `blended-recompute.job.ts` to query `external_market_question_links` + latest snapshot
  - Add `market_probability` field to `forecast_questions` (migration)
  - Adjust blended formula weights
- **Risk**: Low
- **Success**: Questions linked to Polymarket show market probability in the blend

### Phase 3: Intel workflow on queue (2-3 days)

- **Goal**: Migrate intel recalculation from poll-based to queue-driven
- **Changes**:
  - Add intel event types to `consumer.ts` switch
  - Emit recalculation events via `forecast_event_queue` instead of polling `intel_recalculation_jobs`
  - Keep poll as fallback during transition
- **Risk**: Low (fallback exists)
- **Success**: Recalculation latency drops from 2-minute poll to near-instant

### Phase 4: Source trust consolidation (1 day)

- **Goal**: Single source trust table
- **Changes**:
  - Migrate `intel_source_profiles` data into `source_trust_profiles`
  - Update intel code to use `source_trust_profiles`
  - Drop `intel_source_profiles`
- **Risk**: Low
- **Success**: One trust score per source domain

### Phase 5: Veille export (3-5 days)

- **Goal**: Operational veille export producing artifacts
- **Changes**:
  - Implement `veille-export.job.ts` properly (generate report, store artifact)
  - Wire to downstream Veille product
- **Risk**: Medium (new feature)
- **Success**: `intel_veille_exports` rows have `artifact_url` populated

### Phase 6: Canonical domain types (2-3 days)

- **Goal**: Shared type system across modules
- **Changes**:
  - Create `lib/domain/` with canonical signal, event, question types
  - Add mappers from legacy table shapes
  - Gradually replace `any` casts in API routes
- **Risk**: Low (additive)
- **Success**: Type-safe API routes, fewer `any` casts

### Phase 7: Evidence and document layer (5-7 days, LATER)

- **Goal**: Structured evidence beyond articles
- **Changes**: New tables (`documents`, `claims`, `evidence_links`), PDF extraction, claim extraction via LLM
- **Risk**: Medium
- **Success**: Questions have structured evidence attached from multiple document types

---

## 17. MVP vs Later

### MVP / Immediate (Phases 0-2)

- Fix ingestion consumer dead-letter gap
- Wire signal-to-event linking
- Add market probability to blend
- Clean up type duplication

### Next Milestone (Phases 3-5)

- Queue-driven intel recalculation
- Source trust consolidation
- Veille export implementation

### Later Advanced Architecture (Phases 6-7)

- Canonical domain types
- Evidence/document layer
- Claim extraction
- Embedding-based signal-event matching

---

## 18. Implementation Tasks (Priority Order)

| # | Title | Purpose | Subsystem | Complexity | Dependencies |
|---|-------|---------|-----------|------------|--------------|
| 1 | Add `ingestion.signal.ready_for_enrichment` handler in consumer | Wire ingested signals to downstream processing | Worker/Queue | Medium | None |
| 2 | Implement signal-to-event linking service | Auto-link signals to `intel_events` via LLM matching | Intel | High | Task 1 |
| 3 | Add `ingestion.market.move.detected` handler | Trigger blended recompute on market moves | Worker/Queue | Low | None |
| 4 | Add market probability to blended-recompute job | Three-way blend (AI + crowd + market) | Forecast | Medium | Task 3 |
| 5 | Add `market_probability` column to `forecast_questions` | Store market probability alongside AI/crowd | Migration | Low | Task 4 |
| 6 | Deduplicate `IntelWorkflowEventName` definitions | Single source in `packages/contracts/` | Contracts | Low | None |
| 7 | Move `flows.ts` to `docs/` | Clean up lib, it's documentation not code | Cleanup | Trivial | None |
| 8 | Add FK on `forecast_user_forecasts.user_id` | Data integrity | Migration | Low | None |
| 9 | Add ingestion admin UI page | Visibility into provider health, runs, failures | Admin UI | Medium | None |
| 10 | Merge `intel_source_profiles` into `source_trust_profiles` | Single source trust system | Migration + Intel | Medium | None |
| 11 | Implement `event_link_candidates` writer in enrichment | Populate the existing empty table | Intel/Ingestion | Medium | Task 2 |
| 12 | Add admin UI for `event_link_candidates` review | Human-in-the-loop for signal-event links | Admin UI | Medium | Task 11 |
| 13 | Wire intel recalculation to `forecast_event_queue` | Queue-driven instead of poll-based | Worker | Medium | None |
| 14 | Implement veille export job properly | Generate export artifacts | Intel/Veille | High | None |
| 15 | Generate Supabase types from schema | Replace manual `database-rows.ts` and `any` casts | Tooling | Medium | None |
| 16 | Add tests for `consumer.ts` handler dispatch | Prevent silent event dropping | Testing | Medium | None |
| 17 | Add tests for ingestion engine + adapters | Regression safety | Testing | Medium | None |
| 18 | Fix materiality job to use `scoring.ts` factors properly | Use the scoring library instead of hardcoded values | Intel | Low | None |
| 19 | Add monitoring for queue depth and processing latency | Observability | Infra | Medium | None |
| 20 | Create `lib/domain/signal.ts` canonical type | Unified signal representation | Domain | Medium | None |
| 21 | Create `lib/domain/event.ts` canonical type | Unified event representation | Domain | Medium | None |
| 22 | Add signal-event linking confidence threshold config | Tunable matching without code changes | Intel | Low | Task 2 |
| 23 | Add `external_signals` → `forecast_signal_feed` bridge | Show ingested signals in forecast reader | Ingestion/Forecast | Medium | Task 1 |
| 24 | Add ingestion run history UI in admin | Track provider health over time | Admin UI | Medium | Task 9 |
| 25 | Implement `documents` table and basic ingestion | Foundation for evidence layer | Evidence | High | None |
| 26 | Add PDF extraction service | Extend article-extractor | Evidence | High | Task 25 |
| 27 | Add claim extraction via LLM | Extract claims from documents | Evidence | High | Task 25 |
| 28 | Add `evidence_links` connecting claims to questions | Structured evidence for forecasts | Evidence | Medium | Task 27 |
| 29 | Enable TypeScript strict build checks | Fix accumulated type errors | Tooling | High | Task 15 |
| 30 | Add end-to-end integration test for signal→event→recalc flow | Validate the core workflow | Testing | High | Tasks 1, 2 |

---

## 19. Output Scaffolding

### Domain type suggestions

```typescript
// lib/domain/signal.ts
export type SignalOrigin = 'ingestion' | 'veille' | 'forecast_news' | 'manual'
export interface CanonicalSignal {
  id: string
  origin: SignalOrigin
  title: string
  summary: string | null
  url: string | null
  published_at: string | null
  provider_id: string | null
  source_domain: string | null
  trust_score: number
  sentiment: number | null
  signal_type: string
  // Source table reference for queries
  _source_table: 'external_signals' | 'signals' | 'forecast_signal_feed'
  _source_id: string
}
```

### Service boundary suggestions

| Service | Input | Output | Owner |
|---------|-------|--------|-------|
| `SignalEnrichmentService` | `external_signals.id` | Entity tags, geography, category enrichment | `lib/ingestion/` |
| `SignalEventLinker` | `external_signals.id` | `event_link_candidates` row | `lib/intel/` (new) |
| `MaterialChangeDetector` | `intel_event_id` + snapshot | Recalculation request or suppress | `lib/intel/` |
| `BlendedRecomputer` | `question_id` | Updated blended probability | `apps/worker/` |

### Queue event suggestions (additions to existing)

```typescript
// Add to packages/contracts/src/events.ts
export type IngestionEventType =
  | 'ingestion.signal.ready_for_enrichment'
  | 'ingestion.market.move.detected'
  | 'ingestion.signal.linked_to_event'
  | 'ingestion.event_link.needs_review'

export type IntelEventType =
  | 'intel.materiality.detected'
  | 'intel.recalculation.requested'
  | 'intel.recalculation.completed'
  | 'intel.veille_export.requested'
```

### Naming conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| DB columns | `snake_case` | `blended_probability` |
| TypeScript domain types | `PascalCase` | `NormalizedSignal` |
| TypeScript fields | `camelCase` (domain) / `snake_case` (DB row types) | `trustScore` vs `trust_score` |
| Event names | `domain.entity.action.past_tense` | `forecast.blended.recompute.requested` |
| API routes | `kebab-case` | `/api/admin/ingestion/trigger` |
| Migration files | `NNN_description.sql` | `045_market_probability.sql` |

### Module ownership

| Module | Primary owner concern | Should NOT contain |
|--------|----------------------|-------------------|
| `lib/ingestion/` | External data acquisition + normalization | Forecast logic, UI concerns |
| `lib/forecast/` | Question lifecycle, generation, scoring | Ingestion details, veille logic |
| `lib/intel/` (proposed) | Event intelligence, materiality, recalculation | Direct DB writes to `forecast_*` tables |
| `lib/resolution/` | Resolution lifecycle | Reward logic |
| `lib/rewards/` | Gamification | Resolution details |
| `lib/agents/` | Veille multi-agent pipeline | Forecast probability |
| `packages/contracts/` | Event names, envelopes, commands | Implementation details |
