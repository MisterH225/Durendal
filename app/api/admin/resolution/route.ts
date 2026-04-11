import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'superadmin' ? user : null
}

export async function GET(req: NextRequest) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const db = createAdminClient()
  const tab = req.nextUrl.searchParams.get('tab') ?? 'pending'

  let statusFilter: string[]
  switch (tab) {
    case 'pending':
      statusFilter = ['proposal_pending']
      break
    case 'needs_review':
      statusFilter = ['pending', 'source_fetching', 'evidence_ready']
      break
    case 'disputed':
      statusFilter = ['disputed']
      break
    case 'recent':
      statusFilter = ['approved', 'finalized', 'annulled', 'cancelled']
      break
    case 'failed':
      statusFilter = ['failed']
      break
    default:
      statusFilter = ['proposal_pending']
  }

  const { data: jobs, error } = await db
    .from('resolution_jobs')
    .select(`
      *,
      forecast_questions!inner (id, title, slug, status, resolution_criteria, resolution_source, close_date, resolution_class, resolution_mode, question_type, channel_id),
      resolution_profiles (id, resolution_class, resolution_mode, outcome_type, auto_resolve_eligible),
      resolution_proposals (id, proposed_outcome, confidence, rationale, evidence_summary, source_agreement, status, created_at)
    `)
    .in('status', statusFilter)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Count by tab
  const { data: counts } = await db.rpc('resolution_queue_counts').maybeSingle()

  // Fallback manual counts if RPC not available
  let tabCounts = counts
  if (!tabCounts) {
    const countQuery = async (statuses: string[]) => {
      const { count } = await db
        .from('resolution_jobs')
        .select('id', { count: 'exact', head: true })
        .in('status', statuses)
      return count ?? 0
    }
    tabCounts = {
      pending: await countQuery(['proposal_pending']),
      needs_review: await countQuery(['pending', 'source_fetching', 'evidence_ready']),
      disputed: await countQuery(['disputed']),
      failed: await countQuery(['failed']),
    }
  }

  return NextResponse.json({ jobs: jobs ?? [], counts: tabCounts })
}
