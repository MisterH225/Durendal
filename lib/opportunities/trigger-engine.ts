/**
 * Trigger Engine — Moteur de détermination du signal principal,
 * hypothèse business, preuves observées et contrôle qualité.
 *
 * Responsabilités :
 *  1. Sélectionner le primaryTrigger parmi les signaux d'une entreprise
 *  2. Générer une businessHypothesis contextualisée
 *  3. Construire un evidenceSummary structuré (2-5 preuves)
 *  4. Évaluer la qualité des preuves (sufficient / insufficient / weak)
 *  5. Décider du display_status (visible / hidden / draft)
 */

import {
  getSignalConfig,
  getSignalBusinessLabel,
  getSignalHypothesisTemplate,
  getSignalBadge,
  SIGNAL_TYPE_MAP,
} from './signals-taxonomy'
import { getSectorConfig } from './sector-config'

// ── Types ────────────────────────────────────────────────────────────────────

export interface RawSignal {
  id: string
  type: string
  subtype?: string | null
  title?: string | null
  detectedAt: string
  confidenceScore: number
  url?: string | null
  rawContent?: string | null
  sourceName?: string | null
}

export interface EvidenceItem {
  date: string
  evidenceType: string
  label: string
  sourceName: string | null
  sourceUrl: string | null
  shortExcerpt: string | null
  confidence: number
}

export type EvidenceStatus = 'sufficient' | 'insufficient' | 'weak'
export type DisplayStatus = 'visible' | 'hidden' | 'draft'

export interface TriggerResult {
  primaryTriggerType: string
  primaryTriggerLabel: string
  primaryTriggerSummary: string
  businessHypothesis: string
  opportunityReason: string
  triggerConfidence: number
  evidenceCount: number
  evidenceSummary: EvidenceItem[]
  evidenceStatus: EvidenceStatus
  displayStatus: DisplayStatus
  badge: string
}

// ── Score composite d'un signal (pour élection du primary trigger) ────────

function signalScore(s: RawSignal): number {
  const cfg = getSignalConfig(s.type)
  const baseScore = cfg?.baseScore ?? 5
  const categoryBonus = cfg?.category === 'high_intent' ? 15 : cfg?.category === 'medium_intent' ? 5 : 0

  const daysSince = Math.max(0, (Date.now() - new Date(s.detectedAt).getTime()) / 86_400_000)
  const decayDays = cfg?.decayDays ?? 30
  const recencyMultiplier = Math.max(0.2, 1 - (daysSince / (decayDays * 2)))

  const confidenceMultiplier = Math.max(0.3, s.confidenceScore)

  return (baseScore + categoryBonus) * recencyMultiplier * confidenceMultiplier
}

// ── Sélection du signal déclencheur principal ─────────────────────────────

export function determinePrimaryTrigger(signals: RawSignal[]): {
  signal: RawSignal
  score: number
} | null {
  if (signals.length === 0) return null

  const scored = signals.map(s => ({ signal: s, score: signalScore(s) }))
  scored.sort((a, b) => b.score - a.score)

  return scored[0]
}

// ── Génération du résumé du trigger ──────────────────────────────────────

function buildTriggerSummary(primary: RawSignal, allSignals: RawSignal[]): string {
  const sameType = allSignals.filter(s => s.type === primary.type)
  const cfg = getSignalConfig(primary.type)

  if (primary.title && primary.title.length > 10) {
    const countSuffix = sameType.length > 1
      ? ` (${sameType.length} signaux similaires détectés)`
      : ''
    return `${primary.title}${countSuffix}`
  }

  if (sameType.length > 1) {
    const windowDays = Math.round(
      (Date.now() - Math.min(...sameType.map(s => new Date(s.detectedAt).getTime()))) / 86_400_000
    )
    return `${sameType.length} ${cfg?.label?.toLowerCase() || 'signaux'} détectés en ${windowDays} jours`
  }

  const dateStr = new Date(primary.detectedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  return `${cfg?.label || 'Signal'} — détecté le ${dateStr}`
}

// ── Génération de l'hypothèse business ──────────────────────────────────

export function generateBusinessHypothesis(
  primaryType: string,
  sector: string | null,
  signalCount: number,
  hasConvergence: boolean,
): string {
  const template = getSignalHypothesisTemplate(primaryType)
  const sectorCfg = sector ? getSectorConfig(sector) : undefined

  let hypothesis = template

  if (hasConvergence && signalCount >= 3) {
    hypothesis += ' La convergence de plusieurs signaux distincts renforce cette hypothèse.'
  }

  if (sectorCfg) {
    const sectorAngle = sectorCfg.approachExamples[0]
    if (sectorAngle) {
      hypothesis += ` Dans le secteur ${sectorCfg.label}, cela peut se traduire par : ${sectorAngle.toLowerCase()}.`
    }
  }

  return hypothesis
}

// ── Construction de la raison d'opportunité ──────────────────────────────

export function buildOpportunityReason(
  primaryType: string,
  companyName: string,
  evidenceCount: number,
): string {
  const label = getSignalBusinessLabel(primaryType)
  if (evidenceCount >= 3) {
    return `${label} chez ${companyName}, soutenu par ${evidenceCount} preuves concordantes.`
  }
  if (evidenceCount >= 1) {
    return `${label} chez ${companyName}.`
  }
  return `Signal détecté pour ${companyName} — preuves insuffisantes.`
}

// ── Construction du résumé de preuves ────────────────────────────────────

export function buildEvidenceSummary(signals: RawSignal[], maxItems = 5): EvidenceItem[] {
  const sorted = [...signals].sort((a, b) =>
    new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  )

  const items: EvidenceItem[] = []
  const seen = new Set<string>()

  for (const s of sorted) {
    if (items.length >= maxItems) break

    const key = `${s.type}::${s.title?.slice(0, 40)}`
    if (seen.has(key)) continue
    seen.add(key)

    const cfg = getSignalConfig(s.type)
    const dateStr = new Date(s.detectedAt).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    })

    let excerpt: string | null = null
    if (s.title && s.title.length > 10) {
      excerpt = s.title.length > 120 ? s.title.slice(0, 117) + '...' : s.title
    } else if (s.rawContent) {
      excerpt = s.rawContent.length > 120 ? s.rawContent.slice(0, 117) + '...' : s.rawContent
    }

    items.push({
      date: dateStr,
      evidenceType: s.type,
      label: cfg?.businessLabel || cfg?.label || s.type,
      sourceName: s.sourceName ?? null,
      sourceUrl: s.url ?? null,
      shortExcerpt: excerpt,
      confidence: s.confidenceScore,
    })
  }

  return items
}

// ── Évaluation qualité des preuves ──────────────────────────────────────

export function assessEvidenceQuality(
  signals: RawSignal[],
  evidenceItems: EvidenceItem[],
): EvidenceStatus {
  if (signals.length === 0 || evidenceItems.length === 0) return 'weak'

  const avgConfidence = signals.reduce((sum, s) => sum + s.confidenceScore, 0) / signals.length
  const hasHighIntent = signals.some(s => {
    const cfg = getSignalConfig(s.type)
    return cfg?.category === 'high_intent'
  })
  const uniqueTypes = new Set(signals.map(s => s.type)).size

  if (evidenceItems.length >= 3 && avgConfidence >= 0.5 && hasHighIntent) return 'sufficient'
  if (evidenceItems.length >= 2 && avgConfidence >= 0.4) return 'insufficient'
  if (uniqueTypes >= 2 && avgConfidence >= 0.3) return 'insufficient'

  return 'weak'
}

// ── Décision display_status ─────────────────────────────────────────────

export function determineDisplayStatus(
  primaryTriggerLabel: string | null,
  businessHypothesis: string | null,
  evidenceStatus: EvidenceStatus,
  evidenceCount: number,
): DisplayStatus {
  if (!primaryTriggerLabel || !businessHypothesis) return 'hidden'
  if (evidenceCount === 0) return 'hidden'
  if (evidenceStatus === 'weak' && evidenceCount < 2) return 'draft'
  return 'visible'
}

// ── Calcul du trigger confidence ────────────────────────────────────────

export function computeTriggerConfidence(
  primarySignal: RawSignal,
  allSignals: RawSignal[],
): number {
  const base = primarySignal.confidenceScore * 50
  const sameTypeCount = allSignals.filter(s => s.type === primarySignal.type).length
  const countBonus = Math.min(25, sameTypeCount * 8)
  const uniqueTypes = new Set(allSignals.map(s => s.type)).size
  const convergenceBonus = uniqueTypes >= 3 ? 15 : uniqueTypes >= 2 ? 8 : 0

  return Math.min(100, Math.round(base + countBonus + convergenceBonus))
}

// ── Fonction principale — assemblage complet ────────────────────────────

export function computeTriggerData(
  signals: RawSignal[],
  companySector: string | null,
  companyName: string,
): TriggerResult {
  const primary = determinePrimaryTrigger(signals)

  if (!primary) {
    return {
      primaryTriggerType: '',
      primaryTriggerLabel: '',
      primaryTriggerSummary: '',
      businessHypothesis: '',
      opportunityReason: '',
      triggerConfidence: 0,
      evidenceCount: 0,
      evidenceSummary: [],
      evidenceStatus: 'weak',
      displayStatus: 'hidden',
      badge: '',
    }
  }

  const sig = primary.signal
  const uniqueTypes = new Set(signals.map(s => s.type)).size
  const hasConvergence = uniqueTypes >= 2

  const primaryTriggerType = sig.type
  const primaryTriggerLabel = getSignalBusinessLabel(sig.type)
  const primaryTriggerSummary = buildTriggerSummary(sig, signals)
  const businessHypothesis = generateBusinessHypothesis(sig.type, companySector, signals.length, hasConvergence)
  const evidenceSummary = buildEvidenceSummary(signals)
  const evidenceCount = evidenceSummary.length
  const evidenceStatus = assessEvidenceQuality(signals, evidenceSummary)
  const opportunityReason = buildOpportunityReason(sig.type, companyName, evidenceCount)
  const triggerConfidence = computeTriggerConfidence(sig, signals)
  const badge = getSignalBadge(sig.type)

  const displayStatus = determineDisplayStatus(
    primaryTriggerLabel,
    businessHypothesis,
    evidenceStatus,
    evidenceCount,
  )

  return {
    primaryTriggerType,
    primaryTriggerLabel,
    primaryTriggerSummary,
    businessHypothesis,
    opportunityReason,
    triggerConfidence,
    evidenceCount,
    evidenceSummary,
    evidenceStatus,
    displayStatus,
    badge,
  }
}
