/**
 * POST /api/agents/predict
 * Lance le moteur de prédictions (Agent 5) à la demande pour une veille donnée.
 * Cherche automatiquement les rapports parents (Agents 2, 3, 4).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { generatePredictions }       from '@/lib/agents/prediction-engine'

export async function POST(req: NextRequest) {
  try {
    const supabase    = createClient()
    const { watchId } = await req.json()

    if (!watchId) {
      return NextResponse.json({ error: 'watchId requis' }, { status: 400 })
    }

    const { data: watch } = await supabase
      .from('watches')
      .select('*, watch_companies(companies(name))')
      .eq('id', watchId)
      .single()

    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    const { data: latestReport } = await supabase
      .from('reports')
      .select('id')
      .eq('watch_id', watchId)
      .eq('agent_used', 2)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!latestReport) {
      return NextResponse.json({ error: 'Aucun rapport Agent 2 trouvé — lancez d\'abord une collecte' }, { status: 400 })
    }

    const { data: marketReport } = await supabase
      .from('reports')
      .select('id')
      .eq('watch_id', watchId)
      .eq('type', 'market')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data: strategyReport } = await supabase
      .from('reports')
      .select('id')
      .eq('watch_id', watchId)
      .eq('type', 'strategy')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 5, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    const result = await generatePredictions(
      supabase,
      watchId,
      watch,
      latestReport.id,
      marketReport?.id ?? null,
      strategyReport?.id ?? null,
      console.log,
    )

    await supabase.from('agent_jobs').update({
      status:       'done',
      completed_at: new Date().toISOString(),
      result_id:    result.reportId,
      metadata:     { used_mirofish: result.usedMiroFish },
    }).eq('id', job?.id)

    if (result.skipped) {
      return NextResponse.json({ message: `Prédictions ignorées : ${result.reason}`, skipped: true })
    }

    return NextResponse.json({
      success:      true,
      reportId:     result.reportId,
      usedMiroFish: result.usedMiroFish,
      insights:     1,
    })
  } catch (error: any) {
    console.error('[Agent5] Erreur:', error)
    return NextResponse.json({ error: String(error?.message ?? error) }, { status: 500 })
  }
}
