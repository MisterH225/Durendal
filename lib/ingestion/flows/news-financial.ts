// Flow: Financial/geopolitical news ingestion (Finlight + NewsData business)

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdapter } from '../adapters'
import { runIngestion, type EngineOptions } from '../engine'
import type { ProviderId } from '../types'

const FIN_PROVIDERS: ProviderId[] = ['finlight', 'newsdata', 'perplexity']

export async function runNewsFinancialFlow(db: SupabaseClient): Promise<void> {
  const opts: EngineOptions = {
    flow_type: 'news_financial',
    categories: ['business', 'economy', 'politics'],
    languages: ['en', 'fr'],
    max_items: 50,
  }

  for (const providerId of FIN_PROVIDERS) {
    const adapter = getAdapter(providerId)
    const healthy = await adapter.healthCheck()
    if (!healthy) {
      console.warn(`[flow:news-financial] ${providerId} unhealthy — skipping`)
      continue
    }

    try {
      const { stats } = await runIngestion(db, adapter, opts)
      console.log(`[flow:news-financial] ${providerId} done:`, JSON.stringify(stats))
    } catch (e) {
      console.error(`[flow:news-financial] ${providerId} failed:`, e instanceof Error ? e.message : e)
    }
  }
}
