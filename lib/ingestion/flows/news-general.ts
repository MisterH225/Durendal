// Flow: General news ingestion (NewsData + GDELT)

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdapter } from '../adapters'
import { runIngestion, type EngineOptions } from '../engine'
import type { ProviderId } from '../types'

const NEWS_PROVIDERS: ProviderId[] = ['newsdata', 'gdelt', 'perplexity']

export async function runNewsGeneralFlow(db: SupabaseClient): Promise<void> {
  const opts: EngineOptions = {
    flow_type: 'news_general',
    languages: ['en', 'fr'],
    max_items: 50,
  }

  for (const providerId of NEWS_PROVIDERS) {
    const adapter = getAdapter(providerId)
    const healthy = await adapter.healthCheck()
    if (!healthy) {
      console.warn(`[flow:news-general] ${providerId} unhealthy — skipping`)
      continue
    }

    try {
      const { stats } = await runIngestion(db, adapter, opts)
      console.log(`[flow:news-general] ${providerId} done:`, JSON.stringify(stats))
    } catch (e) {
      console.error(`[flow:news-general] ${providerId} failed:`, e instanceof Error ? e.message : e)
    }
  }
}
