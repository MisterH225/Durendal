import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/ingestion/status
 * Returns provider status, recent runs, and aggregate stats.
 */
export async function GET() {
  const db = createAdminClient()

  const [
    { data: providers },
    { data: recentRuns },
    { data: signalCounts },
    { data: failures },
  ] = await Promise.all([
    db.from('external_source_providers').select('*').order('id'),
    db.from('source_ingestion_runs')
      .select('id, provider_id, flow_type, status, items_fetched, items_normalized, items_deduped, items_persisted, duration_ms, started_at, completed_at')
      .order('started_at', { ascending: false })
      .limit(30),
    db.from('external_signals')
      .select('provider_id')
      .limit(10000),
    db.from('ingestion_failures')
      .select('provider_id, error_code, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const countsByProvider: Record<string, number> = {}
  for (const s of signalCounts ?? []) {
    countsByProvider[s.provider_id] = (countsByProvider[s.provider_id] ?? 0) + 1
  }

  return NextResponse.json({
    providers,
    recent_runs: recentRuns,
    signal_counts: countsByProvider,
    recent_failures: failures,
  })
}
