import { createWorkerSupabase } from '../../supabase'
import { runAIForecastJob } from '../forecast/ai-forecast.job'
import { runBlendedRecomputeJob } from '../forecast/blended-recompute.job'
import { appendIntelWorkflowEvent } from '@/lib/forecast/workflow/outbox'
import { logIntelMetric } from '@/lib/forecast/workflow/observability'
import type { UUID } from '@/lib/forecast/workflow/types'

const COOLDOWN_MINUTES = 30

async function finalizeIntelRecalculationRequest(supabase: ReturnType<typeof createWorkerSupabase>, requestId: string) {
  const { data: remaining } = await supabase
    .from('intel_recalculation_jobs')
    .select('status')
    .eq('request_id', requestId)

  const hasPending = (remaining ?? []).some(r => r.status === 'pending' || r.status === 'running')
  if (hasPending) return

  const hasDeadOrFailed = (remaining ?? []).some(
    r => r.status === 'failed' || r.status === 'dead',
  )
  await supabase
    .from('intel_recalculation_requests')
    .update({
      status: hasDeadOrFailed ? 'failed' : 'succeeded',
      processed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
}

async function recordIntelJobFailure(
  supabase: ReturnType<typeof createWorkerSupabase>,
  job: {
    id: string
    request_id: string
    question_id: string
    attempts: number
    max_attempts: number
  },
  message: string,
  opts: { retryable: boolean },
) {
  const attempts = (job.attempts ?? 0) + 1
  const max = job.max_attempts ?? 5
  const now = new Date().toISOString()
  const shortMsg = message.slice(0, 160)

  if (!opts.retryable) {
    await supabase
      .from('intel_recalculation_jobs')
      .update({
        status: 'failed',
        attempts,
        last_error: shortMsg,
        updated_at: now,
      })
      .eq('id', job.id)

    await supabase.from('intel_workflow_failures').insert({
      ref_table: 'intel_recalculation_jobs',
      ref_id: job.id,
      error_code: 'non_retryable',
      error_message: message.slice(0, 500),
      payload: { request_id: job.request_id, question_id: job.question_id, attempts },
    })
    await finalizeIntelRecalculationRequest(supabase, job.request_id)
    return
  }

  if (attempts >= max) {
    await supabase
      .from('intel_recalculation_jobs')
      .update({
        status: 'dead',
        attempts,
        last_error: shortMsg,
        updated_at: now,
      })
      .eq('id', job.id)

    await supabase.from('intel_workflow_failures').insert({
      ref_table: 'intel_recalculation_jobs',
      ref_id: job.id,
      error_code: 'max_attempts',
      error_message: message.slice(0, 500),
      payload: { request_id: job.request_id, question_id: job.question_id, attempts },
    })
    await finalizeIntelRecalculationRequest(supabase, job.request_id)
    return
  }

  const backoff = Math.min(60_000 * attempts, 600_000)
  await supabase
    .from('intel_recalculation_jobs')
    .update({
      status: 'pending',
      attempts,
      last_error: shortMsg,
      available_at: new Date(Date.now() + backoff).toISOString(),
      updated_at: now,
    })
    .eq('id', job.id)
}

/**
 * Recalculation worker : IA + blend + log causal + audit.
 */
export async function runRecalculationJob(jobId: UUID) {
  const t0 = Date.now()
  const supabase = createWorkerSupabase()

  const { data: job, error: jobErr } = await supabase
    .from('intel_recalculation_jobs')
    .select('id, request_id, question_id, status, attempts, max_attempts')
    .eq('id', jobId)
    .single()

  if (jobErr || !job) {
    logIntelMetric({ name: 'intel.recalc.job', jobId, outcome: 'skipped', extra: { reason: 'missing' } })
    return { status: 'missing' } as const
  }
  if (job.status !== 'pending') {
    logIntelMetric({ name: 'intel.recalc.job', jobId, outcome: 'skipped', extra: { status: job.status } })
    return { status: 'skipped' } as const
  }

  const now = new Date().toISOString()

  await supabase.from('intel_recalculation_jobs').update({
    status: 'running',
    updated_at: now,
  }).eq('id', jobId)

  await supabase
    .from('intel_recalculation_requests')
    .update({ status: 'processing' })
    .eq('id', job.request_id)
    .eq('status', 'pending')

  try {
    await supabase.rpc('intel_advisory_lock', { question_id: job.question_id })
  } catch {
    /* migration optionnelle */
  }

  const { data: request } = await supabase
    .from('intel_recalculation_requests')
    .select('id, context_snapshot_id, trigger_signal_ids, reason, correlation_id')
    .eq('id', job.request_id)
    .maybeSingle()

  const correlationId = (request?.correlation_id ?? job.request_id) as UUID

  const { data: cooldown } = await supabase
    .from('intel_question_recalc_cooldown')
    .select('last_recalc_at')
    .eq('question_id', job.question_id)
    .maybeSingle()

  if (cooldown?.last_recalc_at) {
    const last = new Date(cooldown.last_recalc_at).getTime()
    const elapsedMin = (Date.now() - last) / 60000
    if (elapsedMin < COOLDOWN_MINUTES) {
      await supabase.from('intel_recalculation_jobs').update({
        status: 'failed',
        last_error: `cooldown_${Math.round(elapsedMin)}m`,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId)

      await supabase
        .from('intel_recalculation_requests')
        .update({
          status: 'skipped',
          skip_reason: `cooldown_${Math.round(elapsedMin)}m`,
          processed_at: new Date().toISOString(),
        })
        .eq('id', job.request_id)

      await finalizeIntelRecalculationRequest(supabase, job.request_id)
      logIntelMetric({
        name: 'intel.recalc.job',
        jobId,
        requestId: job.request_id,
        questionId: job.question_id,
        correlationId,
        outcome: 'skipped',
        durationMs: Date.now() - t0,
        extra: { reason: 'cooldown' },
      })
      return { status: 'cooldown' } as const
    }
  }

  const { data: question } = await supabase
    .from('forecast_questions')
    .select('id, status, channel_id, forecast_channels ( slug )')
    .eq('id', job.question_id)
    .single()

  if (!question) {
    await recordIntelJobFailure(
      supabase,
      { ...job, attempts: job.attempts ?? 0, max_attempts: job.max_attempts ?? 5 },
      'question_not_found',
      { retryable: false },
    )
    logIntelMetric({
      name: 'intel.recalc.job',
      jobId,
      requestId: job.request_id,
      correlationId,
      outcome: 'failed',
      durationMs: Date.now() - t0,
    })
    return { status: 'failed' } as const
  }

  if (['resolved_yes', 'resolved_no', 'annulled', 'closed'].includes(question.status)) {
    await supabase.from('intel_recalculation_jobs').update({
      status: 'failed',
      last_error: 'question_closed',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId)

    await supabase
      .from('intel_recalculation_requests')
      .update({
        status: 'skipped',
        skip_reason: 'question_closed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', job.request_id)

    await finalizeIntelRecalculationRequest(supabase, job.request_id)
    logIntelMetric({
      name: 'intel.recalc.job',
      jobId,
      requestId: job.request_id,
      correlationId,
      outcome: 'skipped',
      durationMs: Date.now() - t0,
      extra: { reason: 'closed' },
    })
    return { status: 'closed' } as const
  }

  const channelSlug = (question as any).forecast_channels?.slug ?? 'regional-business-events'

  const { data: prevProb } = await supabase
    .from('forecast_questions')
    .select('ai_probability, crowd_probability, blended_probability')
    .eq('id', job.question_id)
    .maybeSingle()

  try {
    await runAIForecastJob({
      questionId: job.question_id,
      channelSlug,
      requestedBy: 'on_update',
      force: false,
    })
    await runBlendedRecomputeJob({ questionId: job.question_id, reason: 'ai_forecast' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await recordIntelJobFailure(
      supabase,
      {
        id: job.id,
        request_id: job.request_id,
        question_id: job.question_id,
        attempts: job.attempts ?? 0,
        max_attempts: job.max_attempts ?? 5,
      },
      msg,
      { retryable: true },
    )
    logIntelMetric({
      name: 'intel.recalc.job',
      jobId,
      requestId: job.request_id,
      questionId: job.question_id,
      correlationId,
      outcome: 'retry',
      durationMs: Date.now() - t0,
      extra: { error: msg.slice(0, 80) },
    })
    return { status: 'retry' } as const
  }

  await supabase.from('intel_question_recalc_cooldown').upsert({
    question_id: job.question_id,
    last_recalc_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  await supabase.from('intel_recalculation_jobs').update({
    status: 'done',
    updated_at: new Date().toISOString(),
  }).eq('id', jobId)

  const { data: nextProb } = await supabase
    .from('forecast_questions')
    .select('ai_probability, crowd_probability, blended_probability')
    .eq('id', job.question_id)
    .maybeSingle()

  await supabase.from('intel_probability_change_log').insert({
    question_id: job.question_id,
    recalculation_request_id: job.request_id,
    context_snapshot_id: request?.context_snapshot_id ?? null,
    trigger_signal_ids: request?.trigger_signal_ids ?? [],
    ai_prev: prevProb?.ai_probability ?? null,
    ai_new: nextProb?.ai_probability ?? null,
    crowd_prev: prevProb?.crowd_probability ?? null,
    crowd_new: nextProb?.crowd_probability ?? null,
    blended_prev: prevProb?.blended_probability ?? null,
    blended_new: nextProb?.blended_probability ?? null,
    change_reason: request?.reason ?? 'intel_recalculation',
    blend_formula_version: 'v1',
  })

  const aiP = nextProb?.ai_probability ?? null
  const blendedP = nextProb?.blended_probability ?? null
  const crowdP = nextProb?.crowd_probability ?? null

  await appendIntelWorkflowEvent({
    type: 'intel.forecast.ai.updated',
    correlationId,
    payload: {
      questionId: job.question_id as UUID,
      requestId: job.request_id as UUID,
      aiProbability: typeof aiP === 'number' ? aiP : 0,
      model: 'gemini-2.5-flash',
      confidence: 'medium',
    },
    idempotencyKey: `${job.request_id}:${job.question_id}:ai`,
    producer: 'worker',
  })

  await appendIntelWorkflowEvent({
    type: 'intel.forecast.blended.updated',
    correlationId,
    payload: {
      questionId: job.question_id as UUID,
      requestId: job.request_id as UUID,
      blendedProbability: typeof blendedP === 'number' ? blendedP : 0,
      crowdProbability: crowdP,
      aiProbability: typeof aiP === 'number' ? aiP : 0,
    },
    idempotencyKey: `${job.request_id}:${job.question_id}:blended`,
    producer: 'worker',
  })

  await finalizeIntelRecalculationRequest(supabase, job.request_id)

  logIntelMetric({
    name: 'intel.recalc.job',
    jobId,
    requestId: job.request_id,
    questionId: job.question_id,
    correlationId,
    outcome: 'ok',
    durationMs: Date.now() - t0,
  })

  return { status: 'done' } as const
}
