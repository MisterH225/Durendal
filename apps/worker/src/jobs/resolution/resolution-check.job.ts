/**
 * resolution-check.job.ts
 *
 * Scheduler task: scans for closed questions that are eligible for resolution
 * and creates resolution jobs for them.
 *
 * Runs periodically (every 1h via scheduler).
 * Only picks questions that:
 *   - status = 'closed'
 *   - have a resolution_profiles row
 *   - resolve_after <= now (or resolve_after is null)
 *   - no active resolution_jobs exist
 */

import { createWorkerSupabase } from '../../supabase'
import { publishForecastEvent } from '../../../../../lib/forecast/queue/publisher'

export async function runResolutionCheckJob(): Promise<void> {
  const supabase = createWorkerSupabase()
  const now = new Date().toISOString()

  // Find closed questions with resolution profiles that don't have active jobs
  const { data: closedQuestions, error } = await supabase
    .from('forecast_questions')
    .select(`
      id, title, resolution_class, resolution_mode,
      resolution_profiles!inner (id, resolve_after, resolution_class, resolution_mode)
    `)
    .eq('status', 'closed')
    .limit(20)

  if (error) {
    console.error('[resolution-check] Query error:', error.message)
    return
  }

  if (!closedQuestions?.length) {
    console.log('[resolution-check] No closed questions pending resolution.')
    return
  }

  let created = 0
  for (const q of closedQuestions) {
    const profile = (q as any).resolution_profiles
    if (!profile) continue

    // Check resolve_after
    if (profile.resolve_after && new Date(profile.resolve_after) > new Date()) {
      continue
    }

    // Check no active job exists
    const { data: existingJob } = await supabase
      .from('resolution_jobs')
      .select('id')
      .eq('question_id', q.id)
      .not('status', 'in', '("failed","cancelled")')
      .limit(1)
      .maybeSingle()

    if (existingJob) continue

    // Create job via queue event
    await publishForecastEvent({
      type: 'forecast.resolution.job.created' as any,
      correlationId: q.id,
      payload: {
        questionId: q.id,
        resolutionClass: profile.resolution_class,
        resolutionMode: profile.resolution_mode,
      },
      producer: 'worker',
    })

    created++
    console.log(`[resolution-check] Queued resolution for "${q.title?.slice(0, 50)}" (class ${profile.resolution_class})`)
  }

  if (created > 0) {
    console.log(`[resolution-check] ${created} resolution job(s) queued.`)
  }
}
