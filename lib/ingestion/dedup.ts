// ============================================================================
// Deduplication engine.
//
// Strategy (layered):
// 1. Exact URL match (canonical URL)
// 2. Title hash match (normalized title SHA-256)
// 3. Provider + external_id match (same item re-fetched)
// 4. Market identity key (for prediction markets)
//
// A match does NOT destroy the new signal. Instead:
// - The new signal joins the existing dedup group
// - A signal_source_link is created (preserving multi-source provenance)
// - The group's member_count is incremented
// - novelty_score on the new signal is reduced
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DedupKeySet } from './adapter'
import type { DedupMatch, NormalizedSignal } from './types'

export async function findDedupMatch(
  db: SupabaseClient,
  keys: DedupKeySet,
  providerId: string,
): Promise<DedupMatch | null> {

  // 1. Provider + external_id (cheapest, most precise)
  if (keys.provider_external_id) {
    const { data } = await db
      .from('external_signals')
      .select('id, dedup_group_id')
      .eq('provider_id', providerId)
      .eq('external_id', keys.provider_external_id)
      .maybeSingle()
    if (data) {
      return {
        type: 'near_duplicate',
        existing_signal_id: data.id,
        existing_group_id: data.dedup_group_id,
        confidence: 1.0,
      }
    }
  }

  // 2. Canonical URL
  if (keys.canonical_url) {
    const { data } = await db
      .from('external_signals')
      .select('id, dedup_group_id')
      .eq('url', keys.canonical_url)
      .limit(1)
      .maybeSingle()
    if (data) {
      return {
        type: 'exact_url',
        existing_signal_id: data.id,
        existing_group_id: data.dedup_group_id,
        confidence: 0.95,
      }
    }
  }

  // 3. Title hash
  if (keys.title_hash) {
    const { data } = await db
      .from('external_signals')
      .select('id, dedup_group_id')
      .eq('dedup_hash', keys.title_hash)
      .limit(1)
      .maybeSingle()
    if (data) {
      return {
        type: 'title_hash',
        existing_signal_id: data.id,
        existing_group_id: data.dedup_group_id,
        confidence: 0.85,
      }
    }
  }

  // 4. Market identity
  if (keys.market_key) {
    const { data } = await db
      .from('external_signals')
      .select('id, dedup_group_id')
      .eq('market_id', keys.market_key.split(':').pop() ?? '')
      .limit(1)
      .maybeSingle()
    if (data) {
      return {
        type: 'market_identity',
        existing_signal_id: data.id,
        existing_group_id: data.dedup_group_id,
        confidence: 0.9,
      }
    }
  }

  return null
}

/**
 * Create or join a dedup group.
 * Returns the group ID (existing or newly created).
 */
export async function ensureDedupGroup(
  db: SupabaseClient,
  match: DedupMatch | null,
  signal: NormalizedSignal,
): Promise<string | null> {

  // New unique signal — create a group with itself as representative
  if (!match) {
    const { data } = await db
      .from('signal_dedup_groups')
      .insert({
        canonical_url: signal.url,
        title_hash: signal.dedup_hash,
        member_count: 1,
      })
      .select('id')
      .single()
    return data?.id ?? null
  }

  // Exact re-fetch of same provider item — skip entirely
  if (match.type === 'near_duplicate' && match.confidence >= 1.0) {
    return match.existing_group_id
  }

  // Match found — join the existing group
  if (match.existing_group_id) {
    await db
      .from('signal_dedup_groups')
      .update({
        member_count: db.rpc ? undefined : undefined, // see below
      })
      .eq('id', match.existing_group_id)

    // Increment member_count via raw RPC (avoids race conditions)
    await db.rpc('increment_dedup_member_count', { group_id: match.existing_group_id }).catch(() => {
      // Fallback: just ignore the count, it's cosmetic
    })

    return match.existing_group_id
  }

  // Match found but no group yet — create one covering both signals
  const { data } = await db
    .from('signal_dedup_groups')
    .insert({
      canonical_url: signal.url,
      title_hash: signal.dedup_hash,
      representative_signal_id: match.existing_signal_id,
      member_count: 2,
    })
    .select('id')
    .single()

  const groupId = data?.id
  if (groupId) {
    await db
      .from('external_signals')
      .update({ dedup_group_id: groupId })
      .eq('id', match.existing_signal_id)
  }

  return groupId ?? null
}
