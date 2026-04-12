// ============================================================================
// Core ingestion engine — orchestrates fetch → normalize → dedupe → persist → emit
// for any provider adapter. Used by all flow types.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SourceAdapter, FetchParams } from './adapter'
import type { FlowType, IngestionRunStats, NormalizedSignal, ProviderId } from './types'
import { findDedupMatch, ensureDedupGroup } from './dedup'
import { computeTrustScore, getDomainTrust, touchSourceProfile } from './trust'
import { persistSignal, persistRawItem, addSourceLink, persistMarket, persistSnapshot } from './persist'
import { emitIngestionEvent, queueSignalForEnrichment, queueMarketMoveSignal } from './events'
import { runCorrelationId } from './utils'

export interface EngineOptions {
  flow_type: FlowType
  keywords?: string[]
  categories?: string[]
  languages?: string[]
  countries?: string[]
  max_items?: number
  since?: string
}

interface RunContext {
  db: SupabaseClient
  adapter: SourceAdapter
  runId: string
  correlationId: string
  stats: IngestionRunStats
}

/**
 * Execute a full ingestion cycle for one provider + flow type.
 */
export async function runIngestion(
  db: SupabaseClient,
  adapter: SourceAdapter,
  opts: EngineOptions,
): Promise<{ runId: string; stats: IngestionRunStats }> {

  const correlationId = runCorrelationId(adapter.providerId, opts.flow_type)

  // Create run record
  const { data: runRow } = await db
    .from('source_ingestion_runs')
    .insert({
      provider_id: adapter.providerId,
      flow_type: opts.flow_type,
      status: 'running',
    })
    .select('id')
    .single()

  const runId = runRow?.id ?? crypto.randomUUID()
  const stats: IngestionRunStats = {
    items_fetched: 0,
    items_normalized: 0,
    items_deduped: 0,
    items_persisted: 0,
    errors: [],
  }

  const ctx: RunContext = { db, adapter, runId, correlationId, stats }

  await emitIngestionEvent(db, 'ingestion.run.started', adapter.providerId, correlationId, {
    run_id: runId, flow_type: opts.flow_type,
  })

  // Load cursor from last successful run for this provider + flow
  const cursor = await loadLastCursor(db, adapter.providerId, opts.flow_type)

  const fetchParams: FetchParams = {
    flow_type: opts.flow_type,
    cursor,
    keywords: opts.keywords,
    categories: opts.categories,
    languages: opts.languages,
    countries: opts.countries,
    max_items: opts.max_items ?? 50,
    since: opts.since,
  }

  try {
    const result = await adapter.fetch(fetchParams)
    stats.items_fetched = result.items.length

    // Process each item
    for (const rawItem of result.items) {
      try {
        await processItem(ctx, rawItem, opts.flow_type)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        stats.errors.push({ code: 'item_processing', message: msg })
      }
    }

    // Save cursor for next run
    await db
      .from('source_ingestion_runs')
      .update({
        status: stats.errors.length > 0 ? 'partial' : 'completed',
        completed_at: new Date().toISOString(),
        items_fetched: stats.items_fetched,
        items_normalized: stats.items_normalized,
        items_deduped: stats.items_deduped,
        items_persisted: stats.items_persisted,
        errors: stats.errors.slice(0, 20),
        cursor_state: result.cursor_state,
        duration_ms: Date.now() - new Date(runRow?.created_at ?? Date.now()).getTime(),
      })
      .eq('id', runId)

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    stats.errors.push({ code: 'fetch_failed', message: msg })

    await db
      .from('source_ingestion_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString(), errors: stats.errors })
      .eq('id', runId)

    await db.from('ingestion_failures').insert({
      provider_id: adapter.providerId,
      run_id: runId,
      error_code: 'fetch_failed',
      error_message: msg,
      retryable: !msg.includes('401') && !msg.includes('403'),
    }).catch(() => {})
  }

  await emitIngestionEvent(db, 'ingestion.run.completed', adapter.providerId, correlationId, {
    run_id: runId,
    ...stats,
  })

  return { runId, stats }
}

async function processItem(ctx: RunContext, rawItem: unknown, flowType: FlowType): Promise<void> {
  const { db, adapter, runId, correlationId, stats } = ctx

  // Store raw payload
  const extId = (rawItem as any)?.id ?? (rawItem as any)?.article_id ?? null
  const rawItemId = await persistRawItem(db, runId, adapter.providerId, extId, rawItem)

  // Normalize
  const signal = adapter.normalizeSignal(rawItem)
  if (!signal) return
  if (rawItemId) signal.raw_item_id = rawItemId
  stats.items_normalized++

  // Trust scoring
  const domainTrust = await getDomainTrust(db, signal.provider_id, signal.source_domain)
  signal.trust_score = computeTrustScore(signal, domainTrust)

  // Dedup
  const dedupKeys = adapter.dedupKeys(signal)
  const match = await findDedupMatch(db, dedupKeys, signal.provider_id)

  if (match && match.confidence >= 1.0) {
    // Exact re-fetch — just add source link
    stats.items_deduped++
    if (match.existing_signal_id) {
      await addSourceLink(db, match.existing_signal_id, signal, rawItemId ?? undefined)
    }
    await emitIngestionEvent(db, 'signal.dedupe.matched', adapter.providerId, correlationId, {
      existing_signal_id: match.existing_signal_id, match_type: match.type,
    })
    return
  }

  // Partial dedup — still persist but link to group
  const groupId = await ensureDedupGroup(db, match, signal)
  if (match) {
    stats.items_deduped++
    signal.novelty_score = Math.max(0, (signal.novelty_score ?? 0.5) - 0.3)
  }

  // Persist signal
  const signalWithGroup = { ...signal, dedup_group_id: groupId }
  const signalId = await persistSignal(db, signalWithGroup)
  if (!signalId) return

  stats.items_persisted++
  await addSourceLink(db, signalId, signal, rawItemId ?? undefined)
  await touchSourceProfile(db, signal)

  await emitIngestionEvent(db, 'signal.persisted', adapter.providerId, correlationId, {
    signal_id: signalId, signal_type: signal.signal_type,
  })

  // For market adapters: also persist market + snapshot
  if (adapter.capabilities.supports_markets && adapter.normalizeMarket) {
    const market = adapter.normalizeMarket(rawItem)
    if (market) {
      const marketId = await persistMarket(db, market)
      if (marketId && adapter.extractSnapshot) {
        const snap = adapter.extractSnapshot(rawItem, marketId)
        if (snap) {
          // Detect movement
          const { data: prevSnap } = await db
            .from('external_market_snapshots')
            .select('probability')
            .eq('market_id', marketId)
            .order('captured_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          await persistSnapshot(db, snap)
          await queueMarketMoveSignal(db, marketId, prevSnap?.probability ?? null, snap.probability, correlationId)

          await emitIngestionEvent(db, 'market.snapshot.updated', adapter.providerId, correlationId, {
            market_id: marketId, probability: snap.probability,
          })
        }
      }
    }
  }

  // Queue for enrichment
  await queueSignalForEnrichment(db, signalId, correlationId)
  await emitIngestionEvent(db, 'signal.ready_for_enrichment', adapter.providerId, correlationId, {
    signal_id: signalId,
  })
}

async function loadLastCursor(
  db: SupabaseClient,
  providerId: ProviderId,
  flowType: FlowType,
): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from('source_ingestion_runs')
    .select('cursor_state')
    .eq('provider_id', providerId)
    .eq('flow_type', flowType)
    .in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data?.cursor_state as Record<string, unknown>) ?? null
}
