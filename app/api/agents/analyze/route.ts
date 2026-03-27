export const maxDuration = 300

/**
 * POST /api/agents/analyze
 *
 * Déclenche manuellement l'Agent 3 (marché) et/ou l'Agent 4 (stratégie)
 * à partir d'un rapport concurrentiel existant (Agent 2).
 *
 * Body : { watchId, reportId, agents?: [3, 4] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }         from '@/lib/supabase/server'
import { createAdminClient }    from '@/lib/supabase/admin'
import { generateMarketAnalysis }   from '@/lib/agents/market-analyst'
import { generateStrategyReport }   from '@/lib/agents/strategy-advisor'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { watchId, reportId, agents } = await req.json()
  if (!watchId || !reportId) {
    return NextResponse.json({ error: 'watchId et reportId requis' }, { status: 400 })
  }

  const agentsToRun: number[] = agents ?? [3, 4]
  const db = createAdminClient()

  const { data: watch } = await db
    .from('watches')
    .select('*, watch_companies(companies(id, name, website, linkedin_url, country))')
    .eq('id', watchId)
    .single()

  if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

  const logs: string[] = []
  const log = (msg: string) => { console.log(msg); logs.push(msg) }

  let marketReportId: string | null = null
  let strategyReportId: string | null = null

  if (agentsToRun.includes(3)) {
    const result = await generateMarketAnalysis(db, watchId, watch, reportId, log)
    marketReportId = result.reportId
  }

  if (agentsToRun.includes(4)) {
    const result = await generateStrategyReport(
      db, watchId, watch, reportId, marketReportId, log,
    )
    strategyReportId = result.reportId
  }

  return NextResponse.json({
    success: true,
    market_report_id:   marketReportId,
    strategy_report_id: strategyReportId,
    logs,
  })
}
