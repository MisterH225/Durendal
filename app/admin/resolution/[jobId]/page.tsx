import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ReviewClient from './ReviewClient'

export default async function ResolutionJobPage({ params }: { params: { jobId: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') redirect('/dashboard')

  const { data: job } = await db
    .from('resolution_jobs')
    .select(`
      *,
      forecast_questions (id, title, slug, description, status, resolution_criteria, resolution_source, resolution_url, close_date, resolution_class, resolution_mode, question_type, channel_id, forecast_count, blended_probability),
      resolution_profiles (*),
      resolution_proposals (*),
      resolution_evidence (*)
    `)
    .eq('id', params.jobId)
    .single()

  if (!job) redirect('/admin/resolution')

  const { data: auditLog } = await db
    .from('resolution_audit_log')
    .select('*')
    .eq('question_id', (job as any).forecast_questions?.id ?? job.question_id)
    .order('created_at', { ascending: false })
    .limit(30)

  const { data: disputes } = await db
    .from('resolution_disputes')
    .select('*')
    .eq('question_id', (job as any).forecast_questions?.id ?? job.question_id)
    .order('created_at', { ascending: false })

  return (
    <ReviewClient
      job={job}
      auditLog={auditLog ?? []}
      disputes={disputes ?? []}
    />
  )
}
