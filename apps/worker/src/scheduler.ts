/**
 * scheduler.ts
 * Cron interne au worker — pas besoin de Vercel Cron ni cPanel externe.
 *
 * Tâches planifiées :
 *   - forecast:ai-trigger    → toutes les 6h  — déclenche les estimations IA
 *   - forecast:close-check   → toutes les 1h  — ferme les questions dont la close_date est passée
 *   - forecast:news-signal   → toutes les 2h  — génère des signaux d'actualité par canal (IA)
 *   - forecast:question-generator → toutes les 6h — événements + questions ouvertes (IA)
 */

import { createWorkerSupabase } from './supabase'
import { runNewsSignalJob } from './jobs/forecast/news-signal.job'
import { runQuestionGeneratorJob } from './jobs/forecast/question-generator.job'

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
    intervalMs:  2 * 60 * 60 * 1000,   // every 2 hours
    lastRanAt:   0,
    fn:          runNewsSignalJob,
  },
  {
    name:        'forecast:question-generator',
    intervalMs:  6 * 60 * 60 * 1000,   // every 6 hours
    lastRanAt:   0,
    fn:          runQuestionGeneratorJob,
  },
]

export async function runSchedulerTick() {
  const now = Date.now()

  for (const task of TASKS) {
    if (now - task.lastRanAt >= task.intervalMs) {
      task.lastRanAt = now
      try {
        await task.fn()
      } catch (e) {
        console.error(`[scheduler] Erreur tâche ${task.name} :`, e)
      }
    }
  }
}
