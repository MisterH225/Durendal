// Flow: Prediction market snapshot (Polymarket + Dome)

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdapter } from '../adapters'
import { runIngestion, type EngineOptions } from '../engine'
import type { ProviderId } from '../types'

const MARKET_PROVIDERS: ProviderId[] = ['polymarket', 'dome']

export async function runMarketSnapshotFlow(db: SupabaseClient): Promise<void> {
  const opts: EngineOptions = {
    flow_type: 'market_snapshot',
    max_items: 50,
  }

  for (const providerId of MARKET_PROVIDERS) {
    const adapter = getAdapter(providerId)
    const healthy = await adapter.healthCheck()
    if (!healthy) {
      console.log(`[flow:market-snapshot] ${providerId} unavailable — skipping`)
      continue
    }

    try {
      const { stats } = await runIngestion(db, adapter, opts)
      console.log(`[flow:market-snapshot] ${providerId} done:`, JSON.stringify(stats))
    } catch (e) {
      console.error(`[flow:market-snapshot] ${providerId} failed:`, e instanceof Error ? e.message : e)
    }
  }
}
