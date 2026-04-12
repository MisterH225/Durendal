// ============================================================================
// Persistence layer — writes normalized signals, markets, and snapshots
// to Supabase, plus signal_source_links for multi-source provenance.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedSignal, NormalizedMarket, MarketSnapshot } from './types'

/**
 * Insert a normalized signal into external_signals.
 * Returns the DB row id or null on conflict (provider_id + external_id duplicate).
 */
export async function persistSignal(
  db: SupabaseClient,
  signal: NormalizedSignal & { dedup_group_id?: string | null },
): Promise<string | null> {
  const { data, error } = await db
    .from('external_signals')
    .upsert({
      provider_id: signal.provider_id,
      external_id: signal.external_id,
      raw_item_id: signal.raw_item_id ?? null,
      title: signal.title,
      summary: signal.summary,
      body_excerpt: signal.body_excerpt,
      url: signal.url,
      image_url: signal.image_url,
      published_at: signal.published_at,
      ingested_at: new Date().toISOString(),
      language: signal.language,
      source_name: signal.source_name,
      source_domain: signal.source_domain,
      authors: signal.authors,
      geography: signal.geography,
      entity_tags: signal.entity_tags,
      category_tags: signal.category_tags,
      sentiment: signal.sentiment,
      signal_type: signal.signal_type,
      source_type: signal.source_type,
      trust_score: signal.trust_score,
      novelty_score: signal.novelty_score,
      relevance_score: signal.relevance_score,
      market_probability: signal.market_probability,
      market_volume: signal.market_volume,
      market_id: signal.market_id,
      event_link_status: signal.event_link_status ?? 'pending',
      dedup_group_id: signal.dedup_group_id ?? null,
      dedup_hash: signal.dedup_hash,
    }, { onConflict: 'provider_id,external_id', ignoreDuplicates: true })
    .select('id')
    .single()

  if (error && !error.message.includes('duplicate')) {
    console.error('[persist] signal insert error:', error.message)
  }
  return data?.id ?? null
}

/**
 * Add a source link (multi-source provenance).
 */
export async function addSourceLink(
  db: SupabaseClient,
  signalId: string,
  signal: NormalizedSignal,
  rawItemId?: string,
): Promise<void> {
  await db.from('signal_source_links').upsert({
    signal_id: signalId,
    provider_id: signal.provider_id,
    external_id: signal.external_id,
    url: signal.url,
    published_at: signal.published_at,
    trust_score: signal.trust_score,
    raw_item_id: rawItemId ?? null,
  }, { onConflict: 'signal_id,provider_id,external_id', ignoreDuplicates: true })
}

/**
 * Upsert a market into external_markets. Returns DB row id.
 */
export async function persistMarket(
  db: SupabaseClient,
  market: NormalizedMarket,
): Promise<string | null> {
  const { data, error } = await db
    .from('external_markets')
    .upsert({
      provider_id: market.provider_id,
      external_id: market.external_id,
      title: market.title,
      description: market.description,
      category: market.category,
      status: market.status,
      url: market.url,
      image_url: market.image_url,
      end_date: market.end_date,
      outcomes: market.outcomes,
      tags: market.tags,
      volume: market.volume,
      liquidity: market.liquidity,
      last_probability: market.last_probability,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_id,external_id' })
    .select('id')
    .single()

  if (error) console.error('[persist] market upsert error:', error.message)
  return data?.id ?? null
}

/**
 * Insert a market snapshot.
 */
export async function persistSnapshot(
  db: SupabaseClient,
  snap: MarketSnapshot,
): Promise<void> {
  const { error } = await db.from('external_market_snapshots').insert({
    market_id: snap.market_id,
    probability: snap.probability,
    volume_24h: snap.volume_24h,
    liquidity: snap.liquidity,
    outcomes_detail: snap.outcomes_detail,
    captured_at: snap.captured_at ?? new Date().toISOString(),
  })
  if (error) console.error('[persist] snapshot insert error:', error.message)
}

/**
 * Store a raw ingestion item for audit trail.
 */
export async function persistRawItem(
  db: SupabaseClient,
  runId: string,
  providerId: string,
  externalId: string | null,
  payload: unknown,
): Promise<string | null> {
  const { data, error } = await db
    .from('raw_ingestion_items')
    .upsert({
      run_id: runId,
      provider_id: providerId,
      external_id: externalId,
      raw_payload: payload,
    }, { onConflict: 'provider_id,external_id', ignoreDuplicates: true })
    .select('id')
    .single()

  if (error && !error.message.includes('duplicate')) {
    console.error('[persist] raw item error:', error.message)
  }
  return data?.id ?? null
}
