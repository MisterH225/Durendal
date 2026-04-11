import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ResolutionQueueClient from './ResolutionQueueClient'

export default async function ResolutionPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') redirect('/dashboard')

  // Load initial data for the queue
  const { data: pendingJobs } = await db
    .from('resolution_jobs')
    .select(`
      *,
      forecast_questions!inner (id, title, slug, status, resolution_criteria, resolution_source, close_date, resolution_class, resolution_mode, question_type, channel_id, forecast_count),
      resolution_proposals (id, proposed_outcome, confidence, rationale, evidence_summary, source_agreement, status, created_at)
    `)
    .eq('status', 'proposal_pending')
    .order('created_at', { ascending: true })
    .limit(50)

  // Count needs_review questions (no job or failed jobs)
  const { count: needsReviewCount } = await db
    .from('forecast_questions')
    .select('id', { count: 'exact', head: true })
    .in('status', ['needs_review', 'closed'])

  const { count: disputedCount } = await db
    .from('resolution_disputes')
    .select('id', { count: 'exact', head: true })
    .in('status', ['open', 'under_review'])

  const { count: failedCount } = await db
    .from('resolution_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')

  return (
    <ResolutionQueueClient
      initialJobs={pendingJobs ?? []}
      counts={{
        pending: pendingJobs?.length ?? 0,
        needs_review: needsReviewCount ?? 0,
        disputed: disputedCount ?? 0,
        failed: failedCount ?? 0,
      }}
    />
  )
}
