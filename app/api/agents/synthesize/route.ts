/**
 * POST /api/agents/synthesize
 * Génère un rapport de synthèse à la demande (peut être appelé manuellement).
 * Utilise generateWatchReport() partagé depuis lib/agents/report-generator.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { generateWatchReport }       from '@/lib/agents/report-generator'

export async function POST(req: NextRequest) {
  try {
    const supabase    = createClient()
    const { watchId } = await req.json()

    const { data: watch } = await supabase
      .from('watches')
      .select('*, watch_companies(companies(name))')
      .eq('id', watchId)
      .single()

    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 2, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    const result = await generateWatchReport(
      supabase, watchId, watch, false, console.log
    )

    await supabase.from('agent_jobs').update({
      status:      result.skipped ? 'done' : 'done',
      completed_at: new Date().toISOString(),
      result_id:   result.reportId,
    }).eq('id', job?.id)

    if (result.skipped) {
      return NextResponse.json({
        message: `Rapport ignoré : ${result.reason}`,
        skipped: true,
      })
    }

    return NextResponse.json({
      success:  true,
      reportId: result.reportId,
      insights: result.insights,
      sources:  result.sources,
    })
  } catch (error: any) {
    console.error('[Agent2] Erreur:', error)
    return NextResponse.json({ error: String(error?.message ?? error) }, { status: 500 })
  }
}
