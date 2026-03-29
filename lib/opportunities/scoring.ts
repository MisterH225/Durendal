/**
 * Moteur de scoring des opportunités commerciales.
 *
 * Score total =
 *   clamp(
 *     fitScore * 0.30 +
 *     intentScore * 0.30 +
 *     recencyScore * 0.15 +
 *     engagementScore * 0.10 +
 *     reachabilityScore * 0.15
 *     - noisePenalty,
 *     0, 100
 *   )
 */

import { getSignalConfig, type SignalTypeConfig } from './signals-taxonomy'
import { getSectorConfig, isSectorPrioritySignal } from './sector-config'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScoreReason {
  label: string
  points: number
  detail?: string
}

export interface SubScore {
  score: number
  reasons: ScoreReason[]
}

export interface ScoreBreakdown {
  fit: SubScore
  intent: SubScore
  recency: SubScore
  engagement: SubScore
  reachability: SubScore
  noisePenalty: SubScore
  final: number
}

export type HeatLevel = 'hot' | 'warm' | 'cold'

export interface SignalInput {
  id: string
  type: string
  subtype?: string
  detectedAt: string   // ISO date
  confidenceScore: number
  sourceReliability?: number
  title?: string
}

export interface ContactInput {
  hasEmail: boolean
  hasPhone: boolean
  hasLinkedin: boolean
  isDecisionMaker: boolean
}

export interface FitInput {
  sectorMatch: boolean
  subSectorMatch: boolean
  countryMatch: boolean
  sizeMatch: boolean
  companyTypeMatch: boolean
  keywordMatches: number  // 0-5
}

export interface ScoringInput {
  fit: FitInput
  signals: SignalInput[]
  contacts: ContactInput[]
  userSectors: string[]
  engagementLevel: 'none' | 'low' | 'medium' | 'high'
  companyDataCompleteness: number  // 0-1
}

// ── Constantes configurables ─────────────────────────────────────────────────

const WEIGHTS = {
  fit:           0.30,
  intent:        0.30,
  recency:       0.15,
  engagement:    0.10,
  reachability:  0.15,
} as const

const HEAT_THRESHOLDS = { hot: 75, warm: 50 } as const

// ── Fonctions utilitaires ────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function daysSince(dateStr: string): number {
  return Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

// ── Sous-scores ──────────────────────────────────────────────────────────────

export function computeFitScore(fit: FitInput): SubScore {
  const reasons: ScoreReason[] = []
  let score = 0

  if (fit.sectorMatch) {
    score += 25; reasons.push({ label: 'Secteur exact', points: 25 })
  }
  if (fit.subSectorMatch) {
    score += 10; reasons.push({ label: 'Sous-secteur pertinent', points: 10 })
  }
  if (fit.countryMatch) {
    score += 20; reasons.push({ label: 'Pays cible', points: 20 })
  }
  if (fit.sizeMatch) {
    score += 15; reasons.push({ label: 'Taille entreprise cible', points: 15 })
  }
  if (fit.companyTypeMatch) {
    score += 10; reasons.push({ label: 'Type d\'entreprise cible', points: 10 })
  }
  if (fit.keywordMatches > 0) {
    const pts = Math.min(20, fit.keywordMatches * 5)
    score += pts; reasons.push({ label: 'Mots-clés ICP', points: pts, detail: `${fit.keywordMatches} correspondance(s)` })
  }

  return { score: clamp(score, 0, 100), reasons }
}

export function computeIntentScore(signals: SignalInput[], userSectors: string[]): SubScore {
  const reasons: ScoreReason[] = []
  let score = 0

  if (signals.length === 0) return { score: 0, reasons: [{ label: 'Aucun signal détecté', points: 0 }] }

  const recentWindow = 30
  const recentSignals = signals.filter(s => daysSince(s.detectedAt) <= recentWindow)
  const uniqueTypes = new Set(recentSignals.map(s => s.type))

  for (const signal of signals) {
    const cfg = getSignalConfig(signal.type)
    const base = cfg?.baseScore ?? 10
    const isSectorPriority = userSectors.some(sec => isSectorPrioritySignal(sec, signal.type))
    const bonus = isSectorPriority ? Math.round(base * 0.2) : 0
    const pts = base + bonus

    score += pts
    reasons.push({
      label: cfg?.label ?? signal.type,
      points: pts,
      detail: isSectorPriority ? 'Signal prioritaire secteur (+20%)' : undefined,
    })
  }

  // Bonus convergence de signaux sur 30 jours
  if (uniqueTypes.size >= 4) {
    score += 22; reasons.push({ label: 'Convergence forte (4+ signaux distincts / 30j)', points: 22 })
  } else if (uniqueTypes.size >= 3) {
    score += 15; reasons.push({ label: 'Convergence moyenne (3 signaux distincts / 30j)', points: 15 })
  } else if (uniqueTypes.size >= 2) {
    score += 8; reasons.push({ label: 'Multi-signal (2 signaux distincts / 30j)', points: 8 })
  }

  return { score: clamp(score, 0, 100), reasons }
}

export function computeRecencyScore(signals: SignalInput[]): SubScore {
  const reasons: ScoreReason[] = []
  if (signals.length === 0) return { score: 10, reasons: [{ label: 'Aucun signal récent', points: 10 }] }

  const mostRecentDays = Math.min(...signals.map(s => daysSince(s.detectedAt)))
  let score: number

  if (mostRecentDays <= 7) {
    score = 100; reasons.push({ label: 'Signal très récent (< 7j)', points: 100 })
  } else if (mostRecentDays <= 30) {
    score = 75; reasons.push({ label: 'Signal récent (8-30j)', points: 75 })
  } else if (mostRecentDays <= 60) {
    score = 50; reasons.push({ label: 'Signal modéré (31-60j)', points: 50 })
  } else if (mostRecentDays <= 90) {
    score = 25; reasons.push({ label: 'Signal ancien (61-90j)', points: 25 })
  } else {
    score = 10; reasons.push({ label: 'Signal périmé (> 90j)', points: 10 })
  }

  return { score, reasons }
}

export function computeEngagementScore(level: 'none' | 'low' | 'medium' | 'high'): SubScore {
  const map: Record<typeof level, { score: number; label: string }> = {
    none:   { score: 20, label: 'Aucune interaction connue (défaut)' },
    low:    { score: 35, label: 'Signaux faibles d\'engagement' },
    medium: { score: 60, label: 'Engagement modéré' },
    high:   { score: 85, label: 'Engagement fort' },
  }
  const { score, label } = map[level]
  return { score, reasons: [{ label, points: score }] }
}

export function computeReachabilityScore(contacts: ContactInput[]): SubScore {
  const reasons: ScoreReason[] = []
  let score = 0

  if (contacts.length === 0) return { score: 0, reasons: [{ label: 'Aucun contact identifié', points: 0 }] }

  const hasDecisionMaker = contacts.some(c => c.isDecisionMaker)
  const hasEmail = contacts.some(c => c.hasEmail)
  const hasPhone = contacts.some(c => c.hasPhone)
  const hasLinkedin = contacts.some(c => c.hasLinkedin)
  const multiContact = contacts.length >= 2

  if (hasDecisionMaker) { score += 30; reasons.push({ label: 'Décideur identifié', points: 30 }) }
  if (hasEmail) { score += 25; reasons.push({ label: 'Email professionnel trouvé', points: 25 }) }
  if (hasLinkedin) { score += 15; reasons.push({ label: 'LinkedIn identifié', points: 15 }) }
  if (hasPhone) { score += 15; reasons.push({ label: 'Téléphone professionnel', points: 15 }) }
  if (multiContact) { score += 15; reasons.push({ label: '2+ contacts qualifiés', points: 15 }) }

  return { score: clamp(score, 0, 100), reasons }
}

export function computeNoisePenalty(
  signals: SignalInput[],
  companyDataCompleteness: number,
): SubScore {
  const reasons: ScoreReason[] = []
  let penalty = 0

  // Sources peu fiables
  const lowConfidence = signals.filter(s => s.confidenceScore < 0.3)
  if (lowConfidence.length > 0) {
    const pts = Math.min(15, lowConfidence.length * 5)
    penalty += pts; reasons.push({ label: 'Signaux à faible confiance', points: -pts, detail: `${lowConfidence.length} signal(s)` })
  }

  // Données entreprise incomplètes
  if (companyDataCompleteness < 0.4) {
    penalty += 10; reasons.push({ label: 'Données entreprise incomplètes', points: -10 })
  }

  // Signaux ambigus (type non reconnu)
  const unknown = signals.filter(s => !getSignalConfig(s.type))
  if (unknown.length > 0) {
    const pts = Math.min(10, unknown.length * 5)
    penalty += pts; reasons.push({ label: 'Signaux de type inconnu', points: -pts })
  }

  return { score: clamp(penalty, 0, 40), reasons }
}

// ── Score global ─────────────────────────────────────────────────────────────

export function computeFullScore(input: ScoringInput): ScoreBreakdown {
  const fit = computeFitScore(input.fit)
  const intent = computeIntentScore(input.signals, input.userSectors)
  const recency = computeRecencyScore(input.signals)
  const engagement = computeEngagementScore(input.engagementLevel)
  const reachability = computeReachabilityScore(input.contacts)
  const noisePenalty = computeNoisePenalty(input.signals, input.companyDataCompleteness)

  const raw =
    fit.score * WEIGHTS.fit +
    intent.score * WEIGHTS.intent +
    recency.score * WEIGHTS.recency +
    engagement.score * WEIGHTS.engagement +
    reachability.score * WEIGHTS.reachability -
    noisePenalty.score

  const final = Math.round(clamp(raw, 0, 100))

  return { fit, intent, recency, engagement, reachability, noisePenalty, final }
}

export function getHeatLevel(totalScore: number): HeatLevel {
  if (totalScore >= HEAT_THRESHOLDS.hot) return 'hot'
  if (totalScore >= HEAT_THRESHOLDS.warm) return 'warm'
  return 'cold'
}

export function computeConfidenceScore(signals: SignalInput[], companyDataCompleteness: number): number {
  if (signals.length === 0) return 10

  const avgConfidence = signals.reduce((sum, s) => sum + s.confidenceScore, 0) / signals.length
  const signalCountBonus = Math.min(20, signals.length * 5)

  return Math.round(clamp(avgConfidence * 60 + companyDataCompleteness * 20 + signalCountBonus, 0, 100))
}
