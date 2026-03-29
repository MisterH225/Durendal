/**
 * GET  /api/opportunities/:id — Détail d'une opportunité
 * PATCH /api/opportunities/:id — Mise à jour statut
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: opp, error } = await supabase
      .from('lead_opportunities')
      .select(`
        *,
        companies!inner(id, name, sector, country, website, logo_url, employee_range, company_type, linkedin_url, description),
        watches:primary_watch_id(id, name, sectors, countries),
        contact_candidates(id, full_name, job_title, seniority, department, email, phone, linkedin_url, is_decision_maker, confidence_score),
        opportunity_feedback(id, feedback_type, comment, created_at, user_id),
        opportunity_activity(id, type, payload, created_at, actor_user_id)
      `)
      .eq('id', params.id)
      .single()

    if (error || !opp) {
      return NextResponse.json({ error: 'Opportunité introuvable' }, { status: 404 })
    }

    // Charger les preuves structurées (pipeline v2)
    const { data: evidence } = await supabase
      .from('opportunity_evidence')
      .select('*')
      .eq('opportunity_id', params.id)
      .order('rank', { ascending: true })
      .limit(10)

    // Charger les signaux extraits liés
    const { data: extractedSignals } = await supabase
      .from('extracted_signals')
      .select('id, signal_type, signal_subtype, signal_label, signal_summary, confidence_score, source_url, source_name, source_domain, detected_at, event_date, extracted_facts')
      .eq('company_id', opp.company_id)
      .eq('watch_id', opp.primary_watch_id)
      .order('detected_at', { ascending: false })
      .limit(30)

    // Legacy signals (backward compat)
    const { data: signals } = await supabase
      .from('account_signals')
      .select(`
        signal_weight, match_reason, created_at,
        signals!inner(id, title, url, signal_type, raw_content, collected_at, relevance_score, confidence_score, source_name)
      `)
      .eq('company_id', opp.company_id)
      .order('created_at', { ascending: false })
      .limit(30)

    return NextResponse.json({
      opportunity: opp,
      evidence: evidence || [],
      extractedSignals: extractedSignals || [],
      signals: signals || [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await req.json()
    const allowedFields = ['status', 'tags', 'recommended_angle']
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

    for (const key of allowedFields) {
      if (body[key] !== undefined) updateData[key] = body[key]
    }

    const { error } = await supabase
      .from('lead_opportunities')
      .update(updateData)
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log activité
    if (body.status) {
      await supabase.from('opportunity_activity').insert({
        opportunity_id: params.id,
        type: 'status_change',
        payload: { from: body._previousStatus, to: body.status },
        actor_user_id: user.id,
      })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
