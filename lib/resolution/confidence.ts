import type { EvidenceConfidence, SourceTrust, ResolutionEvidence } from './types'
import {
  AUTO_RESOLVE_CONFIDENCE_THRESHOLD,
  SOURCE_FRESHNESS_AUTO_HOURS,
  TRUSTED_SOURCE_TYPES,
} from './types'

const TRUST_WEIGHTS: Record<SourceTrust, number> = {
  authoritative: 1.0,
  reliable: 0.8,
  indicative: 0.5,
  unverified: 0.2,
}

const CONFIDENCE_WEIGHTS: Record<EvidenceConfidence, number> = {
  very_high: 1.0,
  high: 0.85,
  medium: 0.6,
  low: 0.35,
  very_low: 0.15,
}

export function computeOverallConfidence(evidenceItems: ResolutionEvidence[]): {
  score: number
  label: EvidenceConfidence
} {
  if (!evidenceItems.length) return { score: 0, label: 'very_low' }

  let weightedSum = 0
  let totalWeight = 0

  for (const e of evidenceItems) {
    const trustW = TRUST_WEIGHTS[e.source_trust] ?? 0.2
    const confW = CONFIDENCE_WEIGHTS[e.confidence] ?? 0.3
    const combined = trustW * confW
    weightedSum += combined
    totalWeight += 1
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0
  const label = scoreToLabel(score)
  return { score: Math.round(score * 1000) / 1000, label }
}

function scoreToLabel(score: number): EvidenceConfidence {
  if (score >= 0.85) return 'very_high'
  if (score >= 0.7) return 'high'
  if (score >= 0.5) return 'medium'
  if (score >= 0.3) return 'low'
  return 'very_low'
}

export function checkSourceAgreement(evidenceItems: ResolutionEvidence[]): boolean {
  const outcomes = new Set(
    evidenceItems
      .filter(e => e.supports_outcome)
      .map(e => e.supports_outcome),
  )
  return outcomes.size <= 1
}

export function canAutoResolve(opts: {
  resolutionClass: string
  autoResolveEligible: boolean
  confidence: number
  sourceAgreement: boolean
  evidenceItems: ResolutionEvidence[]
  proposedOutcome: string
}): { allowed: boolean; reason?: string } {
  if (opts.resolutionClass !== 'A') {
    return { allowed: false, reason: 'resolution_class is not A' }
  }
  if (!opts.autoResolveEligible) {
    return { allowed: false, reason: 'auto_resolve_eligible is false on profile' }
  }
  if (opts.confidence < AUTO_RESOLVE_CONFIDENCE_THRESHOLD) {
    return { allowed: false, reason: `confidence ${opts.confidence} < threshold ${AUTO_RESOLVE_CONFIDENCE_THRESHOLD}` }
  }
  if (!opts.sourceAgreement) {
    return { allowed: false, reason: 'sources disagree on outcome' }
  }
  if (opts.proposedOutcome === 'annulled') {
    return { allowed: false, reason: 'annulment always requires admin' }
  }

  const hasStale = opts.evidenceItems.some(e => e.is_stale)
  if (hasStale) {
    return { allowed: false, reason: 'stale evidence detected' }
  }

  const freshness = SOURCE_FRESHNESS_AUTO_HOURS * 60 * 60 * 1000
  const now = Date.now()
  const hasTooOld = opts.evidenceItems.some(e => {
    const fetchedMs = new Date(e.fetched_at).getTime()
    return (now - fetchedMs) > freshness
  })
  if (hasTooOld) {
    return { allowed: false, reason: `evidence older than ${SOURCE_FRESHNESS_AUTO_HOURS}h` }
  }

  const allTrusted = opts.evidenceItems.every(e =>
    TRUSTED_SOURCE_TYPES.includes(e.source_trust),
  )
  if (!allTrusted) {
    return { allowed: false, reason: 'not all evidence from trusted sources' }
  }

  return { allowed: true }
}
