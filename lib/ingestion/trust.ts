// ============================================================================
// Source trust scoring engine.
//
// Trust score = weighted combination of:
// - Provider-level baseline (from external_source_providers.default_trust)
// - Domain-level trust (from source_trust_profiles, if exists)
// - Freshness (exponential decay from published_at)
// - Source type weight (wire > article > blog > social)
// - Sentiment confidence penalty (extreme sentiment = slight penalty)
//
// Range: [0, 1]. Used downstream for:
// - Event linking confidence
// - Material change detection thresholds
// - Probability update trigger prioritization
// - Analyst review ordering
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedSignal, ProviderId } from './types'

const SOURCE_TYPE_WEIGHTS: Record<string, number> = {
  wire: 0.85,
  government: 0.80,
  article: 0.65,
  market_data: 0.75,
  prediction_market: 0.70,
  event_detection: 0.50,
  blog: 0.40,
  social: 0.25,
}

const PROVIDER_BASE_TRUST: Record<ProviderId, number> = {
  newsdata: 0.55,
  finlight: 0.65,
  gdelt: 0.45,
  polymarket: 0.70,
  dome: 0.60,
}

export function computeTrustScore(signal: NormalizedSignal, domainTrust: number | null): number {
  const providerBase = PROVIDER_BASE_TRUST[signal.provider_id] ?? 0.5
  const typeWeight = SOURCE_TYPE_WEIGHTS[signal.source_type] ?? 0.5
  const domain = domainTrust ?? providerBase

  const freshness = computeFreshness(signal.published_at)

  const sentimentPenalty = signal.sentiment != null
    ? Math.abs(signal.sentiment) > 0.8 ? 0.05 : 0
    : 0

  const raw = (
    providerBase * 0.25 +
    domain * 0.30 +
    typeWeight * 0.20 +
    freshness * 0.25
  ) - sentimentPenalty

  return Math.max(0, Math.min(1, raw))
}

function computeFreshness(publishedAt: string | null): number {
  if (!publishedAt) return 0.3
  const ageMs = Date.now() - new Date(publishedAt).getTime()
  const ageHours = ageMs / (1000 * 60 * 60)
  if (ageHours < 1) return 1.0
  if (ageHours < 6) return 0.9
  if (ageHours < 24) return 0.7
  if (ageHours < 72) return 0.5
  if (ageHours < 168) return 0.3
  return 0.1
}

/**
 * Look up domain-level trust from source_trust_profiles.
 * Returns null if no profile exists for this domain.
 */
export async function getDomainTrust(
  db: SupabaseClient,
  providerId: ProviderId,
  domain: string | null,
): Promise<number | null> {
  if (!domain) return null

  const { data } = await db
    .from('source_trust_profiles')
    .select('trust_score')
    .eq('provider_id', providerId)
    .eq('source_domain', domain)
    .maybeSingle()

  return data?.trust_score ?? null
}

/**
 * Upsert a source trust profile, incrementing total_ingested.
 */
export async function touchSourceProfile(
  db: SupabaseClient,
  signal: NormalizedSignal,
): Promise<void> {
  if (!signal.source_domain) return

  const { data: existing } = await db
    .from('source_trust_profiles')
    .select('id, total_ingested')
    .eq('provider_id', signal.provider_id)
    .eq('source_domain', signal.source_domain)
    .maybeSingle()

  if (existing) {
    await db
      .from('source_trust_profiles')
      .update({
        total_ingested: (existing.total_ingested ?? 0) + 1,
        last_seen_at: new Date().toISOString(),
        source_name: signal.source_name ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await db.from('source_trust_profiles').insert({
      provider_id: signal.provider_id,
      source_domain: signal.source_domain,
      source_name: signal.source_name,
      trust_score: signal.trust_score,
      language: signal.language,
      geography_focus: signal.geography,
      category_focus: signal.category_tags,
      total_ingested: 1,
      last_seen_at: new Date().toISOString(),
    })
  }
}
