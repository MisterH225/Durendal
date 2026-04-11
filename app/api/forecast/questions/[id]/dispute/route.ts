import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/resolution/engine'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })
  }

  const body = await req.json()
  const { reason, evidence_url } = body as { reason: string; evidence_url?: string }

  if (!reason || reason.trim().length < 50) {
    return NextResponse.json(
      { error: 'La raison de la contestation doit contenir au moins 50 caractères.' },
      { status: 400 },
    )
  }

  const db = createAdminClient()

  // Verify question exists and is in a resolved state with open dispute window
  const { data: question } = await db
    .from('forecast_questions')
    .select('id, status, dispute_window_ends')
    .eq('id', params.id)
    .single()

  if (!question) {
    return NextResponse.json({ error: 'Question non trouvée' }, { status: 404 })
  }

  if (!['resolved_yes', 'resolved_no'].includes(question.status)) {
    return NextResponse.json({ error: 'Cette question ne peut pas être contestée dans son état actuel.' }, { status: 400 })
  }

  if (question.dispute_window_ends) {
    const windowEnd = new Date(question.dispute_window_ends)
    if (new Date() > windowEnd) {
      return NextResponse.json({ error: 'La fenêtre de contestation est expirée.' }, { status: 400 })
    }
  }

  // Verify user has forecast on this question
  const { data: userForecast } = await db
    .from('forecast_user_forecasts')
    .select('id')
    .eq('question_id', params.id)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!userForecast) {
    return NextResponse.json(
      { error: 'Seuls les utilisateurs ayant soumis une prévision peuvent contester la résolution.' },
      { status: 403 },
    )
  }

  // Check for existing dispute by this user
  const { data: existingDispute } = await db
    .from('resolution_disputes')
    .select('id')
    .eq('question_id', params.id)
    .eq('filed_by', user.id)
    .in('status', ['open', 'under_review'])
    .maybeSingle()

  if (existingDispute) {
    return NextResponse.json({ error: 'Vous avez déjà une contestation en cours pour cette question.' }, { status: 409 })
  }

  // Find the latest resolution job
  const { data: job } = await db
    .from('resolution_jobs')
    .select('id')
    .eq('question_id', params.id)
    .in('status', ['approved', 'finalized'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Create dispute
  const { data: dispute, error: insertErr } = await db
    .from('resolution_disputes')
    .insert({
      question_id: params.id,
      job_id: job?.id ?? null,
      filed_by: user.id,
      reason: reason.trim(),
      evidence_url: evidence_url?.trim() || null,
      status: 'open',
    })
    .select('id')
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Update question status to disputed
  await db.from('forecast_questions').update({
    status: 'disputed',
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  // Update job status if exists
  if (job) {
    await db.from('resolution_jobs').update({
      status: 'disputed',
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)
  }

  await logAudit(db, params.id, 'disputed', {
    jobId: job?.id ?? null,
    actorType: 'user',
    actorId: user.id,
    details: { disputeId: dispute.id, reason: reason.slice(0, 200) },
  })

  return NextResponse.json({ ok: true, disputeId: dispute.id })
}
