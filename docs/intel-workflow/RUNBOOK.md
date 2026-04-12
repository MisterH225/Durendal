# Runbook — workflow Intel (event-driven)

## Variables d’environnement

| Variable | Rôle |
|----------|------|
| `INTEL_WORKFLOW_ENABLED` | `0` / `false` / `off` désactive les tâches scheduler intel (matérialité, jobs recalc, export). Défaut : activé. |
| `INTEL_LOAD_TEST_*` | Voir `scripts/intel-recalc-load-test.ts` (staging uniquement). |

## Composants

- **Scheduler** (`apps/worker/src/scheduler.ts`) : scan snapshots, file `intel_recalculation_jobs`, export veille intel.
- **Recalcul** (`apps/worker/src/jobs/intel/recalculation.job.ts`) : Gemini + blend + `intel_probability_change_log`.
- **Queue forecast** (`forecast_event_queue`) : en cas d’échec répété, ligne copiée dans `intel_workflow_failures` (`ref_table = forecast_event_queue`).
- **Jobs intel** : échecs retryables → backoff ; max tentatives → `dead` + `intel_workflow_failures`.

## Opérations courantes

### Forcer un recalcul (superadmin)

`POST /api/admin/intel/recalculate` avec `questionIds`, optionnel `bypassCooldown: true`.

### Corriger un lien signal ↔ événement

`PATCH /api/admin/intel/event-signal-links` — `action: link|unlink`.

### File analyste

UI : `/admin/intel/analyst`. API : `PATCH /api/admin/intel/analyst-tasks/[id]`.

### Rejouer / investiguer les échecs

1. Table `intel_workflow_failures` (ordre `created_at` desc).
2. Jobs `intel_recalculation_jobs` en `dead` ou `failed`.
3. Logs worker : lignes JSON `scope=intel_workflow` (`logIntelMetric`).

### Backfill intel ← forecast_events

```bash
npx tsx scripts/backfill-intel-from-forecast-events.ts
```

### Test de charge (staging)

```bash
set INTEL_LOAD_TEST_QUESTION_IDS=uuid1,uuid2
set INTEL_LOAD_TEST_N=50
npx tsx scripts/intel-recalc-load-test.ts
```

## Migrations requises (ordre indicatif)

- `035_intel_workflow_architecture.sql`
- `036_intel_workflow_rls.sql`
- `037_intel_recalc_cooldown.sql`
- `038_intel_advisory_lock.sql`
- `039_intel_projection_question_summary.sql`
- `040_intel_recalc_correlation.sql`

## Santé

- Vérifier que le worker tourne (PM2) et consomme la queue forecast.
- Surveiller le volume de lignes `intel_workflow_failures` et `intel_recalculation_jobs` en `dead`.
