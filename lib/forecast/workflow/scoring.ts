/**
 * Material change scoring (0–100). Deterministic, tunable, testable.
 * No network calls — pure function for unit tests and workers.
 */

export type MaterialityFactors = {
  /** 1–5 from intel_source_profiles.trust_tier or default */
  sourceTrustTier: number
  /** 0–1 novelty vs previous snapshot (embedding distance or heuristic) */
  novelty: number
  /** 0–1 contradiction score vs structured_facts */
  contradiction: number
  /** true if a new key entity appeared */
  newKeyEntity: boolean
  /** previous severity 1–5 */
  prevSeverity: number
  /** current severity 1–5 */
  nextSeverity: number
  /** true if primary region changed */
  regionChanged: boolean
  /** true if sector set changed */
  sectorChanged: boolean
  /** days diff on timeline anchor; 0 if unknown */
  timelineDeltaDays: number | null
  /** 0–1 model confidence in the signal */
  signalConfidence: number
  /** 0–1 duplicate / near-duplicate penalty (1 = full duplicate) */
  duplicatePenalty: number
  /** optional high-impact keyword hits */
  highImpactKeywordHits: number
}

const WEIGHTS = {
  novelty: 25,
  contradiction: 30,
  newEntity: 18,
  severity: 22,
  region: 12,
  sector: 12,
  timeline: 18,
  trust: 12,
  signalConfidence: 10,
  duplicate: 40,
  keywords: 5,
} as const

const THRESHOLDS = {
  /** Below: no auto recalculation */
  suppress: 40,
  /** Between suppress and recalc: review or deferred batch */
  reviewBand: 65,
} as const

function trustMultiplier(tier: number): number {
  const t = Math.min(5, Math.max(1, tier))
  return 0.5 + (t - 1) * 0.125
}

function severityDeltaPoints(prev: number, next: number): number {
  const d = Math.abs(next - prev)
  return Math.min(40, d * 12)
}

function timelinePoints(deltaDays: number | null): number {
  if (deltaDays == null || !Number.isFinite(deltaDays)) return 0
  const ad = Math.abs(deltaDays)
  if (ad >= 30) return 28
  if (ad >= 14) return 18
  if (ad >= 7) return 10
  if (ad >= 1) return 5
  return 0
}

export function computeMaterialityScore(f: MaterialityFactors): {
  score: number
  parts: Record<string, number>
  decision: 'suppress' | 'review' | 'recalculate'
} {
  const parts: Record<string, number> = {}

  parts.novelty = WEIGHTS.novelty * Math.min(1, Math.max(0, f.novelty))
  parts.contradiction = WEIGHTS.contradiction * Math.min(1, Math.max(0, f.contradiction))
  parts.newEntity = f.newKeyEntity ? WEIGHTS.newEntity : 0
  parts.severity = severityDeltaPoints(f.prevSeverity, f.nextSeverity)
  parts.region = f.regionChanged ? WEIGHTS.region : 0
  parts.sector = f.sectorChanged ? WEIGHTS.sector : 0
  parts.timeline = timelinePoints(f.timelineDeltaDays)
  parts.trust = WEIGHTS.trust * (trustMultiplier(f.sourceTrustTier) - 1)
  parts.signalConfidence = WEIGHTS.signalConfidence * Math.min(1, Math.max(0, f.signalConfidence))
  parts.duplicate = -WEIGHTS.duplicate * Math.min(1, Math.max(0, f.duplicatePenalty))
  parts.keywords = Math.min(15, f.highImpactKeywordHits * WEIGHTS.keywords)

  const raw = Object.values(parts).reduce((a, b) => a + b, 0)
  const score = Math.max(0, Math.min(100, Math.round(raw)))

  let decision: 'suppress' | 'review' | 'recalculate'
  if (score < THRESHOLDS.suppress) decision = 'suppress'
  else if (score < THRESHOLDS.reviewBand) decision = 'review'
  else decision = 'recalculate'

  return { score, parts, decision }
}

export const MATERIALITY_THRESHOLDS = THRESHOLDS
