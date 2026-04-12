/**
 * Ingestion orchestrator job — called by the scheduler.
 * Runs all ingestion flows sequentially, with graceful degradation.
 */

import { createWorkerSupabase } from '../../supabase'
import {
  runNewsGeneralFlow,
  runNewsFinancialFlow,
  runEventDiscoveryFlow,
  runMarketSnapshotFlow,
} from '@/lib/ingestion/flows'

export async function runNewsIngestionJob(): Promise<void> {
  const db = createWorkerSupabase()
  console.log('[ingestion] Starting news-general flow...')
  await runNewsGeneralFlow(db)
  console.log('[ingestion] Starting news-financial flow...')
  await runNewsFinancialFlow(db)
}

export async function runEventDiscoveryJob(): Promise<void> {
  const db = createWorkerSupabase()
  console.log('[ingestion] Starting event-discovery flow...')
  await runEventDiscoveryFlow(db)
}

export async function runMarketSnapshotJob(): Promise<void> {
  const db = createWorkerSupabase()
  console.log('[ingestion] Starting market-snapshot flow...')
  await runMarketSnapshotFlow(db)
}
