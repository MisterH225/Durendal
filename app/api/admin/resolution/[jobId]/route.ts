import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyResolution, logAudit } from '@/lib/resolution/engine'
import { publishForecastEvent } from '@/lib/forecast/queue/publisher'

async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'superadmin' ? user : null
}

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const db = createAdminClient()

  const { data: job, error } = await db
    .from('resolution_jobs')
    .select(`
      *,
      forecast_questions (id, title, slug, description, status, resolution_criteria, resolution_source, resolution_url, close_date, resolution_class, resolution_mode, question_type, channel_id, forecast_count),
      resolution_profiles (*),
      resolution_proposals (*),
      resolution_evidence (*)
    `)
    .eq('id', params.jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job non trouvé' }, { status: 404 })
  }

  // Also load disputes for this question
  const { data: disputes } = await db
    .from('resolution_disputes')
    .select('*')
    .eq('question_id', (job as any).forecast_questions?.id ?? job.question_id)
    .order('created_at', { ascending: false })

  // Audit log
  const { data: auditLog } = await db
    .from('resolution_audit_log')
    .select('*')
    .eq('question_id', (job as any).forecast_questions?.id ?? job.question_id)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ job, disputes: disputes ?? [], auditLog: auditLog ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { action, notes, outcome } = body as {
    action: 'approve' | 'reject' | 'annul' | 'cancel' | 'escalate'
    notes?: string
    outcome?: string
  }

  if (!action) {
    return NextResponse.json({ error: 'action requise' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: job } = await db
    .from('resolution_jobs')
    .select('*, resolution_proposals(*)')
    .eq('id', params.jobId)
    .single()

  if (!job) return NextResponse.json({ error: 'Job non trouvé' }, { status: 404 })

  const proposals = (job as any).resolution_proposals ?? []
  const pendingProposal = proposals.find((p: any) => p.status === 'pending')

  switch (action) {
    case 'approve': {
      const resolveOutcome = outcome ?? pendingProposal?.proposed_outcome
      if (!resolveOutcome || !['resolved_yes', 'resolved_no'].includes(resolveOutcome)) {
        return NextResponse.json({ error: 'outcome invalide pour approbation' }, { status: 400 })
      }

      // Update proposal
      if (pendingProposal) {
        await db.from('resolution_proposals').update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes ?? null,
        }).eq('id', pendingProposal.id)
      }

      // Apply resolution
      await applyResolution(db, params.jobId, job.question_id, resolveOutcome, {
        resolvedBy: user.id,
        confidence: pendingProposal?.confidence ?? null,
        confidenceLabel: job.confidence_label,
        notes,
      })

      return NextResponse.json({ ok: true, action: 'approved', outcome: resolveOutcome })
    }

    case 'reject': {
      if (pendingProposal) {
        await db.from('resolution_proposals').update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes ?? null,
        }).eq('id', pendingProposal.id)
      }

      await db.from('resolution_jobs').update({
        status: 'rejected',
        resolved_by: user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', params.jobId)

      // Move question to needs_review for manual resolution
      await db.from('forecast_questions').update({
        status: 'needs_review',
        updated_at: new Date().toISOString(),
      }).eq('id', job.question_id)

      await logAudit(db, job.question_id, 'admin_rejected', {
        jobId: params.jobId,
        actorType: 'admin',
        actorId: user.id,
        details: { notes },
      })

      return NextResponse.json({ ok: true, action: 'rejected' })
    }

    case 'annul': {
      await db.from('resolution_jobs').update({
        status: 'annulled',
        resolved_by: user.id,
        proposed_outcome: 'annulled',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', params.jobId)

      await db.from('forecast_questions').update({
        status: 'annulled',
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        resolution_notes: notes ?? 'Question annulée par admin',
        updated_at: new Date().toISOString(),
      }).eq('id', job.question_id)

      if (pendingProposal) {
        await db.from('resolution_proposals').update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: 'Annulé: ' + (notes ?? ''),
        }).eq('id', pendingProposal.id)
      }

      await logAudit(db, job.question_id, 'admin_annulled', {
        jobId: params.jobId,
        actorType: 'admin',
        actorId: user.id,
        details: { notes },
      })

      return NextResponse.json({ ok: true, action: 'annulled' })
    }

    case 'cancel': {
      await db.from('resolution_jobs').update({
        status: 'cancelled',
        resolved_by: user.id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', params.jobId)

      await db.from('forecast_questions').update({
        status: 'cancelled',
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        resolution_notes: notes ?? 'Question annulée',
        updated_at: new Date().toISOString(),
      }).eq('id', job.question_id)

      await logAudit(db, job.question_id, 'admin_cancelled', {
        jobId: params.jobId,
        actorType: 'admin',
        actorId: user.id,
        details: { notes },
      })

      return NextResponse.json({ ok: true, action: 'cancelled' })
    }

    case 'escalate': {
      if (pendingProposal) {
        await db.from('resolution_proposals').update({
          status: 'escalated',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes ?? null,
        }).eq('id', pendingProposal.id)
      }

      await db.from('resolution_jobs').update({
        status: 'disputed',
        updated_at: new Date().toISOString(),
      }).eq('id', params.jobId)

      await db.from('forecast_questions').update({
        status: 'disputed',
        updated_at: new Date().toISOString(),
      }).eq('id', job.question_id)

      await logAudit(db, job.question_id, 'escalated', {
        jobId: params.jobId,
        actorType: 'admin',
        actorId: user.id,
        details: { notes, reason: 'admin_escalation' },
      })

      return NextResponse.json({ ok: true, action: 'escalated' })
    }

    default:
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  }
}
