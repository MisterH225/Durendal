// Flow: Event discovery via GDELT (broad monitoring, trend/event detection)

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdapter } from '../adapters'
import { runIngestion, type EngineOptions } from '../engine'

export async function runEventDiscoveryFlow(db: SupabaseClient): Promise<void> {
  const adapter = getAdapter('gdelt')
  const healthy = await adapter.healthCheck()
  if (!healthy) {
    console.warn('[flow:event-discovery] GDELT unhealthy — skipping')
    return
  }

  const opts: EngineOptions = {
    flow_type: 'event_discovery',
    keywords: ['geopolitics', 'conflict', 'election', 'sanctions', 'trade war', 'crisis'],
    max_items: 75,
  }

  try {
    const { stats } = await runIngestion(db, adapter, opts)
    console.log('[flow:event-discovery] done:', JSON.stringify(stats))
  } catch (e) {
    console.error('[flow:event-discovery] failed:', e instanceof Error ? e.message : e)
  }
}
