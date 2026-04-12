# Intel workflow — implementation artifacts

See `supabase/migrations/035_intel_workflow_architecture.sql` for the schema.

## First 25 engineering tasks (order)

1. **Merge migration 035** on staging and validate FKs against `signals`, `forecast_questions`, `watches`.
2. **Add RLS policies** for `intel_*` tables (service role + admin read); document in security notes.
3. **Wire `lib/forecast/workflow/types.ts`** to generated Supabase types (optional) or keep manual.
4. **Extend `packages/contracts`** with `IntelWorkflowEventName` re-export from `payloads.ts` if you want a single `publishForecastEvent` entry point.
5. **Implement `computeMaterialityScore` unit tests** (`lib/forecast/workflow/scoring.test.ts`) with golden cases.
6. **Idempotency helper**: `buildRecalcIdempotencyKey(eventId, snapshotId, questionIds[])`.
7. **Outbox writer**: insert into `intel_workflow_events` + optional mirror to `forecast_event_queue`.
8. **Worker stub**: `MaterialChangeJob` polls `intel_event_context_snapshots` tail or consumes queue topic `EVENT_MATERIALITY`.
9. **RecalculationScheduler**: insert `intel_recalculation_requests` + fan-out `intel_recalculation_jobs` per question.
10. **Advisory lock**: `intel_advisory_lock(question_id)` wrapper for `question_id` during blend.
11. **ForecastEngineWorker** adapter: consume job → call existing Gemini forecast route → write `forecast_ai_forecasts` + update `forecast_questions` probabilities.
12. **Write `intel_probability_change_log`** on every successful blend with `recalculation_request_id`.
13. **Projection view**: `projection_intel_question_summary` — voir `supabase/migrations/039_intel_projection_question_summary.sql`.
14. **Admin API**: POST `/api/admin/intel/recalculate` — `app/api/admin/intel/recalculate/route.ts`.
15. **Admin API**: PATCH `/api/admin/intel/event-signal-links` — `app/api/admin/intel/event-signal-links/route.ts`.
16. **Rate limit**: store `last_recalc_at` per `question_id` in Redis or a small table `intel_question_recalc_cooldown`.
17. **Analyst queue UI**: list `intel_analyst_review_tasks` filtered by status.
18. **DLQ consumer**: move failed jobs to `intel_workflow_failures` after `max_attempts`.
19. **Correlation ID**: propagate from `signal.ingested` through all `intel_workflow_events` rows.
20. **Veille export** worker: read `intel_veille_exports`, write artifact, update status.
21. **Feature flag**: `INTEL_WORKFLOW_ENABLED` to run new path alongside legacy.
22. **Backfill script**: create `intel_events` from existing `forecast_events` where mapping makes sense (one-time).
23. **Load test**: enqueue 100 recalc jobs, verify no duplicate probability rows for same idempotency key.
24. **Documentation**: runbook for ops (dead-letter replay, manual recalc).
25. **Metrics**: emit counters (see Observability below).

## Observability / logging

- **Structured fields** on every worker log: `correlation_id`, `intel_event_id`, `question_id`, `request_id`, `job_id`, `event_name`, `duration_ms`, `outcome` (`ok|skipped|failed`).
- **Metrics** (Prometheus-style names or Supabase logs): `intel_recalc_jobs_total{status}`, `intel_materiality_score_bucket`, `intel_queue_lag_seconds`, `intel_duplicate_suppressed_total`.
- **Traces**: one span per `RecalculationRequest` → child spans per `question` job.
- **Alerts**: DLQ depth > N; job failure rate > 5% / 15 min; same `question_id` recalc > 3 in 15 min (loop detection).
- **Audit**: every probability change must log `intel_probability_change_log` + `intel_workflow_events` with `intel.forecast.blended.updated`.
- **PII**: never log full `raw_content` of signals in application logs; log `signal_id` + hash only.
