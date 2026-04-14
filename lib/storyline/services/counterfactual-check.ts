import type {
  CounterfactualCheckInput,
  CounterfactualCheckResult,
  CounterfactualRelationLabel,
  CounterfactualScores,
  CounterfactualExplanation,
  CompetingCauseCandidate,
  TemporalSubtype,
} from '@/lib/graph/types'

// ── Weights for composite score ─────────────────────────────────────────────
const W_TEMPORAL        = 0.15
const W_MECHANISM       = 0.25
const W_COUNTERFACTUAL  = 0.30
const W_EVIDENCE        = 0.15
const W_ALT_PENALTY     = 0.15  // subtracted

// ── Thresholds ──────────────────────────────────────────────────────────────
const TRIGGER_THRESHOLD        = 0.75
const LIKELY_CAUSE_THRESHOLD   = 0.55
const CONTRIBUTES_TO_THRESHOLD = 0.35
const CONTEXT_CEILING          = 0.35
const RESPONSE_PATTERN_MIN     = 0.6
const SPILLOVER_PATTERN_MIN    = 0.6

// ── Mechanism keyword families ──────────────────────────────────────────────
const MECHANISM_KEYWORDS = [
  ['sanction', 'embargo', 'restriction', 'ban', 'tariff', 'tax'],
  ['attack', 'strike', 'bomb', 'invasion', 'offensive', 'military'],
  ['policy', 'decision', 'decree', 'law', 'regulation', 'mandate'],
  ['announce', 'declare', 'statement', 'threaten', 'ultimatum'],
  ['supply', 'shortage', 'disruption', 'blockade', 'pipeline'],
  ['election', 'vote', 'coup', 'resign', 'appoint'],
  ['rate', 'inflation', 'devaluation', 'default', 'bailout'],
  ['treaty', 'agreement', 'ceasefire', 'negotiation', 'deal'],
]

const RESPONSE_KEYWORDS = [
  'response', 'retaliation', 'counter', 'reaction', 'condemn',
  'retaliate', 'reciprocal', 'retort', 'answer', 'reply',
  'en réponse', 'riposte', 'représailles', 'réaction',
]

const SPILLOVER_KEYWORDS = [
  'spillover', 'contagion', 'spread', 'ripple', 'knock-on',
  'cascade', 'aftershock', 'fallout', 'neighboring', 'regional',
  'retombée', 'propagation', 'contamination', 'voisin',
]

// ═══════════════════════════════════════════════════════════════════════════
// CounterfactualCheckService
// ═══════════════════════════════════════════════════════════════════════════

export class CounterfactualCheckService {

  evaluate(input: CounterfactualCheckInput): CounterfactualCheckResult {
    const bullets: string[] = []
    const downgrades: string[] = []

    const temporalSupport        = this.scoreTemporalSupport(input, bullets)
    const mechanismPlausibility  = this.scoreMechanismPlausibility(input, bullets)
    const counterfactualDep      = this.scoreCounterfactualDependence(input, bullets)
    const evidenceSupport        = this.scoreEvidenceSupport(input, bullets)
    const altPenalty             = this.scoreAlternativeCausePenalty(input, bullets)
    const responsePatternScore   = this.scoreResponsePattern(input, bullets)
    const spilloverPatternScore  = this.scoreSpilloverPattern(input, bullets)

    const composite =
      W_TEMPORAL       * temporalSupport +
      W_MECHANISM      * mechanismPlausibility +
      W_COUNTERFACTUAL * counterfactualDep +
      W_EVIDENCE       * evidenceSupport -
      W_ALT_PENALTY    * altPenalty

    const scores: CounterfactualScores = {
      temporalSupport,
      mechanismPlausibility,
      counterfactualDependence: counterfactualDep,
      evidenceSupport,
      alternativeCausePenalty: altPenalty,
      responsePatternScore,
      spilloverPatternScore,
      composite,
    }

    const originalLabel = `${input.llmRelationCategory}/${input.llmRelationSubtype}`

    const finalLabel = this.classify(scores, input, downgrades)
    const wasDowngraded = this.isDowngrade(originalLabel, finalLabel)

    if (wasDowngraded) {
      downgrades.push(
        `Rétrogradé de "${originalLabel}" à "${finalLabel}" — score composite ${composite.toFixed(2)}`,
      )
    }

    const finalRationale = this.buildRationale(finalLabel, scores, input)
    const confidence = this.computeConfidence(scores, finalLabel)

    return {
      finalLabel,
      scores,
      confidence,
      explanation: { bullets, downgrades, finalRationale },
      wasDowngraded,
      originalLabel,
    }
  }

  // ── Scoring dimensions ──────────────────────────────────────────────────

  private scoreTemporalSupport(
    input: CounterfactualCheckInput,
    bullets: string[],
  ): number {
    if (!input.candidateDate || !input.anchorDate) {
      bullets.push('Dates manquantes — support temporel faible')
      return 0.2
    }

    const candMs = new Date(input.candidateDate).getTime()
    const anchorMs = new Date(input.anchorDate).getTime()
    const diffDays = (anchorMs - candMs) / 86_400_000

    if (diffDays < 0) {
      bullets.push('Le candidat est postérieur à l\'ancre — pas un précurseur')
      return 0
    }

    let score: number
    if (diffDays <= 3) {
      score = 0.95
      bullets.push(`Précurseur immédiat (${Math.round(diffDays)}j avant) — forte proximité temporelle`)
    } else if (diffDays <= 14) {
      score = 0.80
      bullets.push(`Événement récent (${Math.round(diffDays)}j avant) — bonne proximité temporelle`)
    } else if (diffDays <= 90) {
      score = 0.55
      bullets.push(`Événement de moyen terme (${Math.round(diffDays)}j avant) — proximité temporelle modérée`)
    } else if (diffDays <= 365) {
      score = 0.30
      bullets.push(`Événement de long terme (${Math.round(diffDays)}j avant) — proximité temporelle faible`)
    } else {
      score = 0.15
      bullets.push(`Événement historique (${Math.round(diffDays / 365)}+ ans avant) — proximité temporelle très faible`)
    }

    const proximity = input.temporalRelation
    if (proximity === 'immediate_precursor') score = Math.max(score, 0.85)
    if (proximity === 'long_term_precursor') score = Math.min(score, 0.40)

    return score
  }

  private scoreMechanismPlausibility(
    input: CounterfactualCheckInput,
    bullets: string[],
  ): number {
    const evidence = `${input.llmCausalEvidence} ${input.llmExplanation}`.toLowerCase()
    if (!evidence || evidence.trim().length < 10) {
      bullets.push('Aucune preuve de mécanisme causal fournie')
      return 0
    }

    let score = 0

    const matchedFamilies: string[] = []
    for (const family of MECHANISM_KEYWORDS) {
      const matched = family.filter(kw => evidence.includes(kw))
      if (matched.length > 0) {
        matchedFamilies.push(matched[0])
        score += 0.15
      }
    }

    if (matchedFamilies.length > 0) {
      bullets.push(`Mécanismes identifiés: ${matchedFamilies.join(', ')}`)
    }

    const hasArrow = evidence.includes('->') || evidence.includes('→') ||
      evidence.includes('entraîne') || evidence.includes('provoque') ||
      evidence.includes('caused') || evidence.includes('led to') ||
      evidence.includes('resulting') || evidence.includes('a conduit') ||
      evidence.includes('déclenché')
    if (hasArrow) {
      score += 0.25
      bullets.push('Langage causal explicite détecté dans la preuve')
    }

    const hasConditional = evidence.includes('if') || evidence.includes('si') ||
      evidence.includes('without') || evidence.includes('sans') ||
      evidence.includes('because') || evidence.includes('parce que') ||
      evidence.includes('car') || evidence.includes('therefore')
    if (hasConditional) {
      score += 0.10
    }

    if (input.llmCausalConfidence >= 0.7) score += 0.15
    else if (input.llmCausalConfidence >= 0.4) score += 0.08

    return Math.min(1, score)
  }

  private scoreCounterfactualDependence(
    input: CounterfactualCheckInput,
    bullets: string[],
  ): number {
    // "If C had not happened, would E still likely have happened?"
    let score = 0

    const entityOverlap = this.computeEntityOverlap(
      input.candidateEntities,
      input.anchorEntities,
    )
    if (entityOverlap > 0.5) {
      score += 0.30
      bullets.push(`Fort recouvrement d'entités (${Math.round(entityOverlap * 100)}%) — dépendance contrefactuelle probable`)
    } else if (entityOverlap > 0.2) {
      score += 0.15
      bullets.push(`Recouvrement d'entités partiel (${Math.round(entityOverlap * 100)}%)`)
    } else {
      bullets.push(`Recouvrement d'entités faible (${Math.round(entityOverlap * 100)}%) — l'effet pourrait survenir sans ce candidat`)
    }

    const evidence = `${input.llmCausalEvidence} ${input.llmExplanation}`.toLowerCase()
    const necessitySignals = [
      'only', 'sole', 'uniquely', 'necessary', 'required', 'prerequisite',
      'seul', 'unique', 'nécessaire', 'indispensable', 'condition préalable',
    ]
    const hasNecessity = necessitySignals.some(s => evidence.includes(s))
    if (hasNecessity) {
      score += 0.25
      bullets.push('Signaux de nécessité détectés dans la preuve')
    }

    const sufficiencySignals = [
      'many factors', 'several causes', 'among others', 'also contributed',
      'plusieurs facteurs', 'entre autres', 'a également contribué',
    ]
    const hasSufficiency = sufficiencySignals.some(s => evidence.includes(s))
    if (hasSufficiency) {
      score -= 0.15
      bullets.push('Signaux de causalité partagée — dépendance réduite')
    }

    if (input.temporalRelation === 'immediate_precursor') score += 0.20
    else if (input.temporalRelation === 'before') score += 0.10
    else if (input.temporalRelation === 'long_term_precursor') score += 0.05

    if (input.llmCausalConfidence >= 0.7) score += 0.15

    return Math.max(0, Math.min(1, score))
  }

  private scoreEvidenceSupport(
    input: CounterfactualCheckInput,
    bullets: string[],
  ): number {
    let score = 0

    const evidenceLength = (input.llmCausalEvidence ?? '').length
    if (evidenceLength > 200) {
      score += 0.40
      bullets.push('Preuve causale détaillée fournie')
    } else if (evidenceLength > 50) {
      score += 0.25
    } else if (evidenceLength > 0) {
      score += 0.10
    } else {
      bullets.push('Aucune preuve causale — support de preuve nul')
      return 0
    }

    const explanationLength = (input.llmExplanation ?? '').length
    if (explanationLength > 100) score += 0.20

    if (input.llmRelationCategory === 'causal') score += 0.20
    if (input.llmCausalConfidence >= 0.6) score += 0.15

    return Math.min(1, score)
  }

  private scoreAlternativeCausePenalty(
    input: CounterfactualCheckInput,
    bullets: string[],
  ): number {
    const competitors = input.competingCauses
    if (!competitors || competitors.length === 0) return 0

    let penalty = 0

    const strongerCompetitors = competitors.filter(
      c => c.causalConfidence > input.llmCausalConfidence &&
           c.mechanismPlausibility > 0.4,
    )

    if (strongerCompetitors.length > 0) {
      penalty += 0.40
      bullets.push(
        `${strongerCompetitors.length} cause(s) alternative(s) plus forte(s) : ${strongerCompetitors.map(c => c.title.slice(0, 40)).join(', ')}`,
      )
    }

    const equalCompetitors = competitors.filter(
      c => Math.abs(c.causalConfidence - input.llmCausalConfidence) < 0.15 &&
           c.mechanismPlausibility > 0.3,
    )
    if (equalCompetitors.length > 0) {
      penalty += 0.15 * equalCompetitors.length
    }

    const immediateCompetitors = competitors.filter(
      c => c.temporalRelation === 'immediate_precursor' &&
           input.temporalRelation !== 'immediate_precursor',
    )
    if (immediateCompetitors.length > 0) {
      penalty += 0.20
      bullets.push('Un concurrent est un précurseur immédiat — ce candidat est moins proximal')
    }

    return Math.min(1, penalty)
  }

  private scoreResponsePattern(
    input: CounterfactualCheckInput,
    bullets: string[],
  ): number {
    const text = `${input.llmCausalEvidence} ${input.llmExplanation} ${input.candidateSummary}`.toLowerCase()
    let score = 0

    const matched = RESPONSE_KEYWORDS.filter(kw => text.includes(kw))
    if (matched.length > 0) {
      score += 0.30 + Math.min(0.40, matched.length * 0.10)
      bullets.push(`Pattern de réponse/réaction détecté: ${matched.slice(0, 3).join(', ')}`)
    }

    if (input.llmRelationCategory === 'corollary') {
      score += 0.30
    }

    if (input.llmRelationSubtype === 'response_to' ||
        input.llmRelationSubtype === 'retaliation_to' ||
        input.llmRelationSubtype === 'policy_reaction_to') {
      score += 0.20
    }

    return Math.min(1, score)
  }

  private scoreSpilloverPattern(
    input: CounterfactualCheckInput,
    bullets: string[],
  ): number {
    const text = `${input.llmCausalEvidence} ${input.llmExplanation} ${input.candidateSummary}`.toLowerCase()
    let score = 0

    const matched = SPILLOVER_KEYWORDS.filter(kw => text.includes(kw))
    if (matched.length > 0) {
      score += 0.30 + Math.min(0.40, matched.length * 0.10)
      bullets.push(`Pattern de retombée/contagion détecté: ${matched.slice(0, 3).join(', ')}`)
    }

    const anchorRegions = new Set<string>()
    const candRegions = new Set(input.candidateRegions ?? [])
    for (const e of input.anchorEntities) anchorRegions.add(e.toLowerCase())

    let regionDiverges = false
    if (candRegions.size > 0 && anchorRegions.size > 0) {
      let overlap = 0
      candRegions.forEach(r => { if (anchorRegions.has(r.toLowerCase())) overlap++ })
      if (overlap === 0) {
        regionDiverges = true
        score += 0.25
        bullets.push('Régions distinctes entre candidat et ancre — indicateur de retombée')
      }
    }

    if (input.llmRelationSubtype === 'spillover_from' ||
        input.llmRelationSubtype === 'market_reaction_to') {
      score += 0.20
    }

    return Math.min(1, score)
  }

  // ── Classification ────────────────────────────────────────────────────

  private classify(
    scores: CounterfactualScores,
    input: CounterfactualCheckInput,
    downgrades: string[],
  ): CounterfactualRelationLabel {
    // Response and spillover patterns take priority
    if (scores.responsePatternScore >= RESPONSE_PATTERN_MIN) {
      if (input.llmRelationCategory === 'causal') {
        downgrades.push('Reclassifié de causal à response_to — pattern de réaction dominant')
      }
      return 'response_to'
    }

    if (scores.spilloverPatternScore >= SPILLOVER_PATTERN_MIN) {
      if (input.llmRelationCategory === 'causal') {
        downgrades.push('Reclassifié de causal à spillover_from — pattern de retombée dominant')
      }
      return 'spillover_from'
    }

    // No temporal support = cannot be causal
    if (scores.temporalSupport === 0) {
      downgrades.push('Support temporel nul — ne peut pas être une cause')
      return 'preceded_by'
    }

    // High composite = genuine causality
    if (scores.composite >= TRIGGER_THRESHOLD &&
        input.temporalRelation === 'immediate_precursor' &&
        scores.mechanismPlausibility >= 0.5) {
      return 'triggers'
    }

    if (scores.composite >= LIKELY_CAUSE_THRESHOLD &&
        scores.mechanismPlausibility >= 0.4 &&
        scores.counterfactualDependence >= 0.3) {
      return 'likely_cause'
    }

    if (scores.composite >= CONTRIBUTES_TO_THRESHOLD &&
        scores.mechanismPlausibility >= 0.2) {
      return 'contributes_to'
    }

    // Below causal thresholds → downgrade to context
    if (input.llmRelationCategory === 'causal') {
      downgrades.push(
        `Score composite (${scores.composite.toFixed(2)}) sous le seuil causal (${CONTRIBUTES_TO_THRESHOLD}) — rétrogradé en contexte`,
      )
    }

    if (input.temporalRelation === 'long_term_precursor' ||
        scores.temporalSupport <= 0.30) {
      return 'long_term_precursor'
    }

    if (scores.composite <= 0.15) {
      return 'preceded_by'
    }

    return 'background_context'
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private isDowngrade(original: string, final: CounterfactualRelationLabel): boolean {
    const CAUSAL_LABELS = new Set(['causal/causes', 'causal/triggers', 'causal/contributes_to', 'causal/enables'])
    const NON_CAUSAL_FINALS = new Set<CounterfactualRelationLabel>([
      'preceded_by', 'background_context', 'long_term_precursor', 'response_to', 'spillover_from',
    ])
    return CAUSAL_LABELS.has(original) && NON_CAUSAL_FINALS.has(final)
  }

  private computeEntityOverlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0
    const setA = new Set(a.map(e => e.toLowerCase()))
    let overlap = 0
    for (const e of b) {
      if (setA.has(e.toLowerCase())) overlap++
    }
    return overlap / Math.max(setA.size, b.length)
  }

  private computeConfidence(
    scores: CounterfactualScores,
    label: CounterfactualRelationLabel,
  ): number {
    const CAUSAL = new Set<CounterfactualRelationLabel>(['triggers', 'likely_cause', 'contributes_to'])

    if (CAUSAL.has(label)) {
      return Math.min(0.95, scores.composite * 1.1)
    }

    if (label === 'response_to') return Math.min(0.90, scores.responsePatternScore)
    if (label === 'spillover_from') return Math.min(0.90, scores.spilloverPatternScore)

    // Non-causal labels: confidence in the non-causal classification
    return Math.min(0.95, 0.5 + (1 - scores.composite) * 0.45)
  }

  private buildRationale(
    label: CounterfactualRelationLabel,
    scores: CounterfactualScores,
    input: CounterfactualCheckInput,
  ): string {
    const RATIONALE: Record<CounterfactualRelationLabel, string> = {
      preceded_by: `"${input.candidateTitle.slice(0, 50)}" précède l'ancre mais aucun mécanisme causal identifié.`,
      background_context: `"${input.candidateTitle.slice(0, 50)}" fournit un contexte utile mais n'est pas un facteur causal direct.`,
      long_term_precursor: `"${input.candidateTitle.slice(0, 50)}" est un précurseur historique qui a contribué aux conditions de fond, sans causalité directe.`,
      contributes_to: `"${input.candidateTitle.slice(0, 50)}" contribue partiellement à l'effet via un mécanisme identifié (score: ${scores.composite.toFixed(2)}).`,
      likely_cause: `"${input.candidateTitle.slice(0, 50)}" est une cause probable avec un mécanisme plausible et une dépendance contrefactuelle significative.`,
      triggers: `"${input.candidateTitle.slice(0, 50)}" est le déclencheur immédiat de l'effet — précurseur proximal avec mécanisme direct.`,
      response_to: `"${input.candidateTitle.slice(0, 50)}" est une réaction/réponse à l'ancre, pas une cause.`,
      spillover_from: `"${input.candidateTitle.slice(0, 50)}" est une retombée dans un domaine/région adjacent.`,
    }
    return RATIONALE[label]
  }
}

// ── Batch helper for the pipeline ───────────────────────────────────────────

export function runCounterfactualChecks(
  anchor: {
    title: string
    summary: string
    date: string
    entities: string[]
  },
  entries: Array<{
    candidateTitle: string
    candidateSummary: string
    candidateDate?: string
    candidateEntities: string[]
    candidateRegions: string[]
    candidateSectors: string[]
    temporalRelation: TemporalSubtype
    llmRelationCategory: 'causal' | 'contextual' | 'corollary'
    llmRelationSubtype: string
    llmCausalConfidence: number
    llmCausalEvidence: string
    llmExplanation: string
  }>,
): CounterfactualCheckResult[] {
  const service = new CounterfactualCheckService()

  // Build competing causes list from all causal entries
  const causalEntries = entries.filter(e => e.llmRelationCategory === 'causal')
  const competingMap = new Map<number, CompetingCauseCandidate[]>()

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.llmRelationCategory !== 'causal') {
      competingMap.set(i, [])
      continue
    }
    const others: CompetingCauseCandidate[] = causalEntries
      .filter(c => c !== entry)
      .map(c => ({
        title: c.candidateTitle,
        entities: c.candidateEntities,
        causalConfidence: c.llmCausalConfidence,
        causalEvidence: c.llmCausalEvidence,
        temporalRelation: c.temporalRelation,
        mechanismPlausibility: c.llmCausalConfidence * 0.8,
      }))
    competingMap.set(i, others)
  }

  return entries.map((entry, i) => {
    const input: CounterfactualCheckInput = {
      anchorTitle: anchor.title,
      anchorSummary: anchor.summary,
      anchorDate: anchor.date,
      anchorEntities: anchor.entities,
      candidateTitle: entry.candidateTitle,
      candidateSummary: entry.candidateSummary,
      candidateDate: entry.candidateDate,
      candidateEntities: entry.candidateEntities,
      candidateRegions: entry.candidateRegions,
      candidateSectors: entry.candidateSectors,
      temporalRelation: entry.temporalRelation,
      llmRelationCategory: entry.llmRelationCategory,
      llmRelationSubtype: entry.llmRelationSubtype,
      llmCausalConfidence: entry.llmCausalConfidence,
      llmCausalEvidence: entry.llmCausalEvidence,
      llmExplanation: entry.llmExplanation,
      competingCauses: competingMap.get(i) ?? [],
    }
    return service.evaluate(input)
  })
}

/** Map a CounterfactualRelationLabel back to the assembler's relation model */
export function mapCounterfactualToRelation(
  label: CounterfactualRelationLabel,
): { category: 'temporal' | 'causal' | 'contextual' | 'corollary'; subtype: string; isTrunk: boolean } {
  switch (label) {
    case 'preceded_by':
      return { category: 'temporal', subtype: 'before', isTrunk: false }
    case 'background_context':
      return { category: 'contextual', subtype: 'background_context', isTrunk: false }
    case 'long_term_precursor':
      return { category: 'temporal', subtype: 'long_term_precursor', isTrunk: false }
    case 'contributes_to':
      return { category: 'causal', subtype: 'contributes_to', isTrunk: true }
    case 'likely_cause':
      return { category: 'causal', subtype: 'causes', isTrunk: true }
    case 'triggers':
      return { category: 'causal', subtype: 'triggers', isTrunk: true }
    case 'response_to':
      return { category: 'corollary', subtype: 'response_to', isTrunk: false }
    case 'spillover_from':
      return { category: 'corollary', subtype: 'spillover_from', isTrunk: false }
    default:
      return { category: 'contextual', subtype: 'background_context', isTrunk: false }
  }
}
