import type { ResolutionEvidence, ResolutionProfile, EvidenceConfidence } from './types'
import { computeOverallConfidence, checkSourceAgreement } from './confidence'

export interface GeneratedProposal {
  proposed_outcome: string
  confidence: number
  confidence_label: EvidenceConfidence
  rationale: string
  evidence_summary: string
  source_agreement: boolean
  fallback_checked: boolean
}

export function generateProposal(
  evidenceItems: ResolutionEvidence[],
  profile: ResolutionProfile,
): GeneratedProposal {
  const sourceAgreement = checkSourceAgreement(evidenceItems)
  const { score: confidence, label: confidenceLabel } = computeOverallConfidence(evidenceItems)

  // Count evidence supporting each outcome
  const outcomeVotes: Record<string, { count: number; weightedScore: number }> = {}
  for (const e of evidenceItems) {
    if (!e.supports_outcome) continue
    if (!outcomeVotes[e.supports_outcome]) {
      outcomeVotes[e.supports_outcome] = { count: 0, weightedScore: 0 }
    }
    outcomeVotes[e.supports_outcome].count++

    const confWeight: Record<string, number> = {
      very_high: 1.0, high: 0.85, medium: 0.6, low: 0.35, very_low: 0.15,
    }
    const trustWeight: Record<string, number> = {
      authoritative: 1.0, reliable: 0.8, indicative: 0.5, unverified: 0.2,
    }
    outcomeVotes[e.supports_outcome].weightedScore +=
      (confWeight[e.confidence] ?? 0.3) * (trustWeight[e.source_trust] ?? 0.2)
  }

  // Determine proposed outcome
  let proposedOutcome = 'unclear'
  let bestScore = 0

  for (const [outcome, stats] of Object.entries(outcomeVotes)) {
    if (stats.weightedScore > bestScore) {
      bestScore = stats.weightedScore
      proposedOutcome = outcome
    }
  }

  // If no evidence supports any outcome, mark unclear
  if (proposedOutcome === 'unclear' || bestScore === 0) {
    return {
      proposed_outcome: 'needs_review',
      confidence: 0,
      confidence_label: 'very_low',
      rationale: 'Pas assez de preuves pour proposer une résolution automatique.',
      evidence_summary: buildEvidenceSummary(evidenceItems),
      source_agreement: sourceAgreement,
      fallback_checked: !!profile.fallback_source_url,
    }
  }

  // Build rationale from AI analysis evidence
  const aiAnalysis = evidenceItems.find(e => e.title?.includes('AI Resolution Analysis'))
  const rationale = aiAnalysis?.extracted_text ?? buildRationale(evidenceItems, proposedOutcome)

  return {
    proposed_outcome: proposedOutcome,
    confidence,
    confidence_label: confidenceLabel,
    rationale,
    evidence_summary: buildEvidenceSummary(evidenceItems),
    source_agreement: sourceAgreement,
    fallback_checked: !!profile.fallback_source_url,
  }
}

function buildEvidenceSummary(items: ResolutionEvidence[]): string {
  const meaningful = items.filter(e => e.extracted_text && e.title)
  if (!meaningful.length) return 'Aucune preuve exploitable trouvée.'

  return meaningful
    .slice(0, 5)
    .map(e => `[${e.source_trust}] ${e.title}: ${e.extracted_text?.slice(0, 150)}`)
    .join('\n\n')
}

function buildRationale(items: ResolutionEvidence[], outcome: string): string {
  const supporting = items.filter(e => e.supports_outcome === outcome)
  const outLabel = outcome === 'resolved_yes' ? 'OUI' : outcome === 'resolved_no' ? 'NON' : outcome
  if (!supporting.length) {
    return `Résolution proposée : ${outLabel}, basée sur l'analyse globale des sources.`
  }
  return `Résolution proposée : ${outLabel}. ${supporting.length} source(s) convergente(s) : ` +
    supporting.slice(0, 3).map(e => e.title ?? 'source inconnue').join(', ') + '.'
}
