import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdapter } from '@/lib/ingestion/adapters'
import { runIngestion } from '@/lib/ingestion/engine'
import type { ProviderId, FlowType } from '@/lib/ingestion/types'

export const dynamic = 'force-dynamic'

const VALID_PROVIDERS: ProviderId[] = ['newsdata', 'finlight', 'gdelt', 'polymarket', 'dome']
const VALID_FLOWS: FlowType[] = ['news_general', 'news_financial', 'event_discovery', 'market_snapshot', 'backfill']

/**
 * POST /api/admin/ingestion/trigger
 * Manually trigger an ingestion run for a specific provider + flow.
 * Body: { provider_id, flow_type, keywords?, max_items? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { provider_id, flow_type, keywords, max_items } = body as {
    provider_id?: ProviderId
    flow_type?: FlowType
    keywords?: string[]
    max_items?: number
  }

  if (!provider_id || !VALID_PROVIDERS.includes(provider_id)) {
    return NextResponse.json({ error: `Invalid provider_id. Valid: ${VALID_PROVIDERS.join(', ')}` }, { status: 400 })
  }
  if (!flow_type || !VALID_FLOWS.includes(flow_type)) {
    return NextResponse.json({ error: `Invalid flow_type. Valid: ${VALID_FLOWS.join(', ')}` }, { status: 400 })
  }

  const adapter = getAdapter(provider_id)
  const healthy = await adapter.healthCheck()
  if (!healthy) {
    return NextResponse.json({ error: `Provider ${provider_id} is not healthy (missing API key or unreachable).` }, { status: 503 })
  }

  const db = createAdminClient()
  const { runId, stats } = await runIngestion(db, adapter, {
    flow_type,
    keywords,
    max_items: max_items ?? 50,
  })

  return NextResponse.json({ ok: true, run_id: runId, stats })
}
