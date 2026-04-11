import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/resolution/engine'

async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'superadmin' ? user : null
}

export async function GET() {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const db = createAdminClient()
  const { data: disputes, error } = await db
    .from('resolution_disputes')
    .select(`
      *,
      forecast_questions (id, title, slug, status, resolution_criteria),
      profiles:filed_by (id, full_name, email)
    `)
    .in('status', ['open', 'under_review'])
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ disputes: disputes ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { disputeId, action, notes } = body as {
    disputeId: string
    action: 'uphold' | 'reject'
    notes?: string
  }

  if (!disputeId || !action) {
    return NextResponse.json({ error: 'disputeId et action requis' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: dispute } = await db
    .from('resolution_disputes')
    .select('*')
    .eq('id', disputeId)
    .single()

  if (!dispute) return NextResponse.json({ error: 'Dispute non trouvée' }, { status: 404 })

  const now = new Date().toISOString()

  if (action === 'uphold') {
    // Dispute upheld: annul or reverse the question resolution
    await db.from('resolution_disputes').update({
      status: 'upheld',
      reviewed_by: user.id,
      reviewed_at: now,
      resolution_notes: notes ?? null,
    }).eq('id', disputeId)

    // Annul the question
    await db.from('forecast_questions').update({
      status: 'annulled',
      resolution_notes: `Dispute acceptée: ${notes ?? 'résolution contestée'}`,
      updated_at: now,
    }).eq('id', dispute.question_id)

    // Update job if exists
    if (dispute.job_id) {
      await db.from('resolution_jobs').update({
        status: 'annulled',
        updated_at: now,
      }).eq('id', dispute.job_id)
    }

    await logAudit(db, dispute.question_id, 'dispute_resolved', {
      jobId: dispute.job_id,
      actorType: 'admin',
      actorId: user.id,
      details: { disputeId, action: 'upheld', notes },
    })

    return NextResponse.json({ ok: true, action: 'upheld' })
  }

  if (action === 'reject') {
    await db.from('resolution_disputes').update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: now,
      resolution_notes: notes ?? null,
    }).eq('id', disputeId)

    await logAudit(db, dispute.question_id, 'dispute_resolved', {
      jobId: dispute.job_id,
      actorType: 'admin',
      actorId: user.id,
      details: { disputeId, action: 'rejected', notes },
    })

    return NextResponse.json({ ok: true, action: 'rejected' })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
}
