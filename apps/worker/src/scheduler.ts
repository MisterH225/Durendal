/**
 * scheduler.ts
 * Cron interne au worker — pas besoin de Vercel Cron ni cPanel externe.
 *
 * Tâches planifiées :
 *   - forecast:ai-trigger    → toutes les 6h  — déclenche les estimations IA
 *   - forecast:close-check   → toutes les 1h  — ferme les questions dont la close_date est passée
 *   - forecast:news-signal   → toutes les 1h  — génère des signaux d'actualité par canal (IA)
 *   - forecast:question-generator → toutes les 6h — événements + questions ouvertes (IA)
 */

import { createWorkerSupabase } from './supabase'
import { runNewsSignalJob } from './jobs/forecast/news-signal.job'
import { runQuestionGeneratorJob } from './jobs/forecast/question-generator.job'
import { runResolutionCheckJob } from './jobs/resolution/resolution-check.job'
import { runResolutionFinalizeJob } from './jobs/resolution/resolution-finalize.job'
import { runStreakUpdateJob } from './jobs/rewards/streak-update.job'
import { runLeaderboardSnapshotJob } from './jobs/rewards/leaderboard-snapshot.job'
import { runVeilleSignalCollectorJob } from './jobs/veille/veille-signal-collector.job'
import { runMaterialChangeJob } from './jobs/intel/material-change.job'
import { runRecalculationJob } from './jobs/intel/recalculation.job'
import { runIntelVeilleExportJob } from './jobs/intel/veille-export.job'
import { isIntelWorkflowEnabled } from '@/lib/forecast/workflow/feature-flag'

type Task = {
  name: string
  intervalMs: number
  lastRanAt: number
  fn: () => Promise<void>
}

// ─── Task: trigger AI forecasts for open questions ────────────────────────────

async function triggerAIForecasts() {
  const supabase = createWorkerSupabase()
  const now = new Date()

  const { data: questions, error } = await supabase
    .from('forecast_questions')
    .select('id, forecast_channels ( slug )')
    .eq('status', 'open')
    .gt('close_date', now.toISOString())
    .order('close_date', { ascending: true })
    .limit(50)

  if (error || !questions?.length) {
    console.log('[scheduler] forecast:ai-trigger — aucune question ouverte.')
    return
  }

  // Skip questions with a recent AI forecast (< 12h)
  const { data: recentForecasts } = await supabase
    .from('forecast_ai_forecasts')
    .select('question_id')
    .eq('is_current', true)
    .gt('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())

  const recentIds = new Set((recentForecasts ?? []).map((f: any) => f.question_id))
  const toProcess = questions.filter(q => !recentIds.has(q.id))

  if (!toProcess.length) {
    console.log('[scheduler] forecast:ai-trigger — toutes les questions ont un forecast IA récent.')
    return
  }

  // Queue AI forecast events, staggered by 2 minutes each
  const queueRows = toProcess.map((q, idx) => {
    const channelSlug = (q as any).forecast_channels?.slug ?? 'unknown'
    return {
      event_type:     'forecast.ai.forecast.requested',
      correlation_id: q.id,
      payload: {
        id:            crypto.randomUUID(),
        type:          'forecast.ai.forecast.requested',
        occurredAt:    now.toISOString(),
        correlationId: q.id,
        producer:      'worker',
        version:       1,
        payload: { questionId: q.id, channelSlug, requestedBy: 'scheduler', force: false },
      },
      status:       'pending',
      attempts:     0,
      max_attempts: 3,
      // Stagger: 2 min apart to respect Gemini rate limits
      available_at: new Date(now.getTime() + idx * 2 * 60 * 1000).toISOString(),
    }
  })

  const { error: insertErr } = await supabase.from('forecast_event_queue').insert(queueRows)
  if (insertErr) {
    console.error('[scheduler] Erreur queue AI forecasts :', insertErr.message)
    return
  }

  console.log(`[scheduler] forecast:ai-trigger — ${toProcess.length} questions mises en file.`)
}

// ─── Task: auto-close questions past their close_date ────────────────────────

async function closeExpiredQuestions() {
  const supabase = createWorkerSupabase()
  const now = new Date().toISOString()

  const { data: expired, error } = await supabase
    .from('forecast_questions')
    .select('id, title')
    .eq('status', 'open')
    .lt('close_date', now)

  if (error || !expired?.length) return

  for (const q of expired) {
    await supabase
      .from('forecast_questions')
      .update({ status: 'closed', updated_at: now })
      .eq('id', q.id)

    console.log(`[scheduler] forecast:close-check — fermé : "${q.title?.slice(0, 50)}"`)
  }
}

// ─── Safe wrappers for reward tasks (tables may not exist in production yet) ──

async function safeRunStreakUpdate() {
  try {
    await runStreakUpdateJob()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('relation') && msg.includes('does not exist')) {
      console.log('[scheduler] rewards:streak-update — tables reward non trouvées, skip.')
      return
    }
    throw e
  }
}

async function safeRunVeilleCollector() {
  try {
    await runVeilleSignalCollectorJob()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('relation') && msg.includes('does not exist')) {
      console.log('[scheduler] veille:signal-collector — tables veille non trouvées, skip.')
      return
    }
    throw e
  }
}

async function safeRunLeaderboardSnapshot() {
  try {
    await runLeaderboardSnapshotJob()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('relation') && msg.includes('does not exist')) {
      console.log('[scheduler] rewards:leaderboard-snapshot — tables reward non trouvées, skip.')
      return
    }
    throw e
  }
}

async function runIntelMaterialityScan() {
  if (!isIntelWorkflowEnabled()) {
    console.log('[scheduler] intel:materiality-scan — désactivé (INTEL_WORKFLOW_ENABLED).')
    return
  }
  const supabase = createWorkerSupabase()
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data: snapshots } = await supabase
    .from('intel_event_context_snapshots')
    .select('id, intel_event_id, created_at')
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!snapshots?.length) return

  for (const snap of snapshots) {
    const { data: existing } = await supabase
      .from('intel_recalculation_requests')
      .select('id')
      .eq('context_snapshot_id', snap.id)
      .maybeSingle()

    if (existing?.id) continue

    await runMaterialChangeJob({
      intelEventId: snap.intel_event_id,
      snapshotId: snap.id,
    })
  }
}

async function runIntelRecalculationQueue() {
  if (!isIntelWorkflowEnabled()) return
  const supabase = createWorkerSupabase()

  const { data: jobs } = await supabase
    .from('intel_recalculation_jobs')
    .select('id')
    .eq('status', 'pending')
    .lte('available_at', new Date().toISOString())
    .order('available_at', { ascending: true })
    .limit(10)

  if (!jobs?.length) return

  for (const job of jobs) {
    await runRecalculationJob(job.id)
  }
}

async function runIntelVeilleExportSafe() {
  if (!isIntelWorkflowEnabled()) return
  await runIntelVeilleExportJob()
}

// ─── Scheduler engine ─────────────────────────────────────────────────────────

const TASKS: Task[] = [
  {
    name:        'forecast:ai-trigger',
    intervalMs:  6 * 60 * 60 * 1000,   // every 6 hours
    lastRanAt:   0,
    fn:          triggerAIForecasts,
  },
  {
    name:        'forecast:close-check',
    intervalMs:  60 * 60 * 1000,        // every 1 hour
    lastRanAt:   0,
    fn:          closeExpiredQuestions,
  },
  {
    name:        'forecast:news-signal',
    intervalMs:  60 * 60 * 1000,        // every 1 hour
    lastRanAt:   0,
    fn:          runNewsSignalJob,
  },
  {
    name:        'forecast:question-generator',
    intervalMs:  6 * 60 * 60 * 1000,   // every 6 hours
    lastRanAt:   0,
    fn:          runQuestionGeneratorJob,
  },
  {
    name:        'resolution:check',
    intervalMs:  60 * 60 * 1000,        // every 1 hour
    lastRanAt:   0,
    fn:          runResolutionCheckJob,
  },
  {
    name:        'resolution:finalize',
    intervalMs:  60 * 60 * 1000,        // every 1 hour
    lastRanAt:   0,
    fn:          runResolutionFinalizeJob,
  },
  {
    name:        'veille:signal-collector',
    intervalMs:  60 * 60 * 1000,        // every 1 hour — internal logic checks per-watch frequency
    lastRanAt:   0,
    fn:          safeRunVeilleCollector,
  },
  {
    name:        'rewards:streak-update',
    intervalMs:  30 * 60 * 1000,        // every 30 minutes
    lastRanAt:   0,
    fn:          safeRunStreakUpdate,
  },
  {
    name:        'rewards:leaderboard-snapshot',
    intervalMs:  24 * 60 * 60 * 1000,   // once per day
    lastRanAt:   0,
    fn:          safeRunLeaderboardSnapshot,
  },
  {
    name:        'intel:materiality-scan',
    intervalMs:  15 * 60 * 1000,        // every 15 minutes
    lastRanAt:   0,
    fn:          runIntelMaterialityScan,
  },
  {
    name:        'intel:recalc-jobs',
    intervalMs:  2 * 60 * 1000,         // every 2 minutes
    lastRanAt:   0,
    fn:          runIntelRecalculationQueue,
  },
  {
    name:        'intel:veille-export',
    intervalMs:  10 * 60 * 1000,        // every 10 minutes
    lastRanAt:   0,
    fn:          runIntelVeilleExportSafe,
  },
]

const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000

export async function runSchedulerTick() {
  const now = Date.now()

  for (const task of TASKS) {
    if (now - task.lastRanAt >= task.intervalMs) {
      try {
        console.log(`[scheduler] >> ${task.name}`)
        const start = Date.now()
        await task.fn()
        task.lastRanAt = Date.now()
        const elapsed = ((Date.now() - start) / 1000).toFixed(1)
        console.log(`[scheduler] OK ${task.name} (${elapsed}s)`)
      } catch (e) {
        console.error(`[scheduler] FAIL ${task.name} :`, e instanceof Error ? e.message : e)
        task.lastRanAt = now - task.intervalMs + RETRY_AFTER_FAILURE_MS
      }
    }
  }
}
