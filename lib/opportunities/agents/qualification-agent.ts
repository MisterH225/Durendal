/**
 * Qualification Agent — Layer 4
 * Agrège les signaux extraits par entreprise, détermine :
 * - le signal principal (primary trigger)
 * - l'hypothèse commerciale
 * - les preuves structurées
 * - le niveau de confiance
 * - le statut visible/hidden/draft
 * - le score secondaire
 *
 * Crée ou met à jour les lead_opportunities + opportunity_evidence.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  getSignalConfig,
  getSignalBusinessLabel,
  getSignalHypothesisTemplate,
  getSignalApproachAngle,
  getSignalBadge,
  SIGNAL_TYPE_MAP,
} from '../signals-taxonomy'
import { getSectorConfig } from '../sector-config'

export interface QualificationResult {
  opportunitiesCreated: number
  opportunitiesUpdated: number
  evidenceCreated: number
  errors: string[]
}

interface ExtractedSignalRow {
  id: string
  company_id: string | null
  company_name_raw: string
  signal_type: string
  signal_subtype: string | null
  signal_label: string
  signal_summary: string | null
  extracted_facts: any
  confidence_score: number
  source_reliability: number
  source_url: string | null
  source_name: string | null
  source_domain: string | null
  detected_at: string
  event_date: string | null
  page_id: string | null
}

interface SignalGroup {
  companyId: string
  companyName: string
  signals: ExtractedSignalRow[]
}

function daysSince(dateStr: string): number {
  return Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function signalStrength(sig: ExtractedSignalRow): number {
  const cfg = getSignalConfig(sig.signal_type)
  const baseScore = cfg?.baseScore ?? 10
  const recencyBonus = daysSince(sig.detected_at) <= 14 ? 1.3 : daysSince(sig.detected_at) <= 30 ? 1.1 : 1.0
  const confidenceMultiplier = sig.confidence_score
  return baseScore * recencyBonus * confidenceMultiplier * (sig.source_reliability || 0.5)
}

function selectPrimaryTrigger(signals: ExtractedSignalRow[]): ExtractedSignalRow {
  const typeGroups = new Map<string, ExtractedSignalRow[]>()
  for (const s of signals) {
    const arr = typeGroups.get(s.signal_type) || []
    arr.push(s)
    typeGroups.set(s.signal_type, arr)
  }

  let bestType = signals[0].signal_type
  let bestScore = 0

  for (const [type, group] of typeGroups) {
    const avgStrength = group.reduce((s, sig) => s + signalStrength(sig), 0) / group.length
    const convergenceBonus = Math.min(group.length * 0.15, 0.6)
    const totalScore = avgStrength * (1 + convergenceBonus)
    if (totalScore > bestScore) {
      bestScore = totalScore
      bestType = type
    }
  }

  const typeSignals = typeGroups.get(bestType) || signals
  return typeSignals.reduce((best, s) =>
    signalStrength(s) > signalStrength(best) ? s : best,
    typeSignals[0],
  )
}

function buildPrimaryTriggerSummary(
  primary: ExtractedSignalRow,
  sameTypeSignals: ExtractedSignalRow[],
): string {
  if (sameTypeSignals.length > 1) {
    const count = sameTypeSignals.length
    const dates = sameTypeSignals
      .map(s => s.event_date || s.detected_at)
      .sort()
    const first = new Date(dates[0])
    const last = new Date(dates[dates.length - 1])
    const daySpan = Math.max(1, Math.round((last.getTime() - first.getTime()) / 86_400_000))
    return `${count} signaux "${getSignalBadge(primary.signal_type)}" détectés sur ${daySpan} jours. ${primary.signal_summary || primary.signal_label}`
  }
  return primary.signal_summary || primary.signal_label
}

function buildBusinessHypothesis(
  primary: ExtractedSignalRow,
  signals: ExtractedSignalRow[],
  companySector: string | null,
): string {
  const template = getSignalHypothesisTemplate(primary.signal_type)
  const uniqueTypes = new Set(signals.map(s => s.signal_type))

  if (uniqueTypes.size >= 3) {
    return `${template} La convergence de ${uniqueTypes.size} types de signaux distincts renforce la probabilité d'un besoin concret à court terme.`
  }
  if (uniqueTypes.size >= 2) {
    return `${template} La présence de signaux complémentaires confirme l'hypothèse d'un besoin réel.`
  }
  return template
}

function buildOpportunityReason(
  primary: ExtractedSignalRow,
  signals: ExtractedSignalRow[],
  companyName: string,
): string {
  const label = getSignalBusinessLabel(primary.signal_type)
  const count = signals.length

  if (count === 1) {
    return `Un signal de type "${label}" a été détecté pour ${companyName}, suggérant une opportunité potentielle.`
  }
  return `${count} signaux détectés pour ${companyName}, dont un signal principal de type "${label}". Ces éléments convergents suggèrent une opportunité commerciale exploitable.`
}

interface EvidenceItem {
  signalId: string
  pageId: string | null
  evidenceType: string
  label: string
  shortExcerpt: string
  sourceName: string
  sourceUrl: string
  evidenceDate: string | null
  confidenceScore: number
  rank: number
}

function buildEvidence(signals: ExtractedSignalRow[]): EvidenceItem[] {
  const sorted = [...signals]
    .sort((a, b) => signalStrength(b) - signalStrength(a))
    .slice(0, 5)

  return sorted.map((sig, i) => {
    const dateStr = sig.event_date || sig.detected_at
    const d = new Date(dateStr)
    const dateFormatted = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

    return {
      signalId: sig.id,
      pageId: sig.page_id,
      evidenceType: sig.signal_type,
      label: `${dateFormatted} — ${sig.signal_label}`,
      shortExcerpt: sig.signal_summary?.slice(0, 200) ?? sig.signal_label,
      sourceName: sig.source_name ?? sig.source_domain ?? 'Source web',
      sourceUrl: sig.source_url ?? '',
      evidenceDate: sig.event_date || sig.detected_at,
      confidenceScore: sig.confidence_score,
      rank: i + 1,
    }
  })
}

function assessEvidenceQuality(
  signals: ExtractedSignalRow[],
): 'sufficient' | 'insufficient' | 'weak' {
  const goodSignals = signals.filter(s => s.confidence_score >= 0.5)
  const uniqueTypes = new Set(signals.map(s => s.signal_type))
  const uniqueSources = new Set(signals.map(s => s.source_domain).filter(Boolean))

  if (goodSignals.length >= 2 && (uniqueTypes.size >= 2 || uniqueSources.size >= 2)) {
    return 'sufficient'
  }
  if (goodSignals.length >= 1 || signals.length >= 2) {
    return 'insufficient'
  }
  return 'weak'
}

function computeDisplayStatus(
  primaryLabel: string | null,
  hypothesis: string | null,
  evidenceStatus: string,
): 'visible' | 'hidden' | 'draft' {
  if (!primaryLabel || !hypothesis) return 'hidden'
  if (evidenceStatus === 'weak') return 'hidden'
  if (evidenceStatus === 'insufficient') return 'draft'
  return 'visible'
}

function computeTriggerConfidence(
  primary: ExtractedSignalRow,
  sameTypeCount: number,
): number {
  const base = primary.confidence_score * 60
  const convergenceBonus = Math.min(sameTypeCount * 8, 25)
  const sourceBonus = (primary.source_reliability ?? 0.5) * 15
  return Math.min(100, Math.round(base + convergenceBonus + sourceBonus))
}

function computeOpportunityScore(
  signals: ExtractedSignalRow[],
  evidenceStatus: string,
  triggerConfidence: number,
  sectorMatch: boolean,
): number {
  let score = 0

  // Intent from signal types
  for (const sig of signals) {
    const cfg = getSignalConfig(sig.signal_type)
    if (!cfg) continue
    const categoryMultiplier =
      cfg.category === 'high_intent' ? 1.5 :
      cfg.category === 'medium_intent' ? 1.0 :
      cfg.category === 'low_intent' ? 0.5 : 0.3
    score += cfg.baseScore * categoryMultiplier * sig.confidence_score
  }

  // Recency
  const newestDays = Math.min(...signals.map(s => daysSince(s.event_date || s.detected_at)))
  if (newestDays <= 7) score += 20
  else if (newestDays <= 30) score += 10

  // Evidence quality
  if (evidenceStatus === 'sufficient') score += 15
  else if (evidenceStatus === 'insufficient') score += 5

  // Convergence
  const uniqueTypes = new Set(signals.map(s => s.signal_type)).size
  if (uniqueTypes >= 3) score += 15
  else if (uniqueTypes >= 2) score += 8

  // Sector match
  if (sectorMatch) score += 10

  // Trigger confidence
  score += triggerConfidence * 0.1

  return Math.min(100, Math.max(0, Math.round(score)))
}

function getHeatLevel(score: number, evidenceStatus: string): 'hot' | 'warm' | 'cold' {
  if (evidenceStatus === 'weak') return 'cold'
  if (score >= 70 && evidenceStatus === 'sufficient') return 'hot'
  if (score >= 45) return 'warm'
  return 'cold'
}

export async function qualifyOpportunities(
  admin: SupabaseClient,
  accountId: string,
  watchId: string,
  watchSectors: string[],
  log: (msg: string) => void,
): Promise<QualificationResult> {
  let opportunitiesCreated = 0
  let opportunitiesUpdated = 0
  let evidenceCreated = 0
  const errors: string[] = []

  const { data: signals } = await admin
    .from('extracted_signals')
    .select('*')
    .eq('account_id', accountId)
    .eq('watch_id', watchId)
    .not('company_id', 'is', null)
    .order('detected_at', { ascending: false })
    .limit(500)

  if (!signals?.length) {
    log(`[qualification] Aucun signal avec entreprise identifiée`)
    return { opportunitiesCreated: 0, opportunitiesUpdated: 0, evidenceCreated: 0, errors: [] }
  }

  // Group by company
  const groups = new Map<string, SignalGroup>()
  for (const sig of signals as ExtractedSignalRow[]) {
    if (!sig.company_id) continue
    if (!groups.has(sig.company_id)) {
      groups.set(sig.company_id, {
        companyId: sig.company_id,
        companyName: sig.company_name_raw,
        signals: [],
      })
    }
    groups.get(sig.company_id)!.signals.push(sig)
  }

  log(`[qualification] ${groups.size} entreprises à qualifier (${signals.length} signaux)`)

  // Get company data for sector matching
  const companyIds = [...groups.keys()]
  const { data: companiesData } = await admin
    .from('companies')
    .select('id, name, sector, country')
    .in('id', companyIds)

  const companyMap = new Map<string, { name: string; sector: string | null; country: string | null }>()
  for (const c of companiesData ?? []) {
    companyMap.set(c.id, { name: c.name, sector: c.sector, country: c.country })
  }

  for (const [companyId, group] of groups) {
    try {
      const company = companyMap.get(companyId)
      const companySector = company?.sector ?? null
      const sectorMatch = watchSectors.some(s =>
        companySector?.toLowerCase().includes(s.toLowerCase()) ?? false
      )

      // Select primary trigger
      const primary = selectPrimaryTrigger(group.signals)
      const sameTypeSignals = group.signals.filter(s => s.signal_type === primary.signal_type)

      const primaryTriggerLabel = getSignalBusinessLabel(primary.signal_type)
      const primaryTriggerSummary = buildPrimaryTriggerSummary(primary, sameTypeSignals)
      const businessHypothesis = buildBusinessHypothesis(primary, group.signals, companySector)
      const opportunityReason = buildOpportunityReason(primary, group.signals, group.companyName)
      const triggerConfidence = computeTriggerConfidence(primary, sameTypeSignals.length)
      const evidenceItems = buildEvidence(group.signals)
      const evidenceStatus = assessEvidenceQuality(group.signals)
      const displayStatus = computeDisplayStatus(primaryTriggerLabel, businessHypothesis, evidenceStatus)
      const recommendedAngle = getSignalApproachAngle(primary.signal_type)

      const totalScore = computeOpportunityScore(group.signals, evidenceStatus, triggerConfidence, sectorMatch)
      const heatLevel = getHeatLevel(totalScore, evidenceStatus)

      const lastSignalAt = group.signals.reduce((latest, s) => {
        const d = s.event_date || s.detected_at
        return new Date(d) > new Date(latest) ? d : latest
      }, group.signals[0].event_date || group.signals[0].detected_at)

      const title = `${company?.name ?? group.companyName} — ${primaryTriggerLabel}`
      const summary = businessHypothesis

      const oppData = {
        account_id: accountId,
        company_id: companyId,
        primary_watch_id: watchId,
        title,
        summary,
        total_score: totalScore,
        confidence_score: triggerConfidence,
        heat_level: heatLevel,
        recommended_angle: recommendedAngle,
        last_signal_at: lastSignalAt,
        last_scored_at: new Date().toISOString(),
        score_breakdown: {
          signalTypes: [...new Set(group.signals.map(s => s.signal_type))],
          signalCount: group.signals.length,
          evidenceStatus,
          triggerConfidence,
          sectorMatch,
        },
        primary_trigger_type: primary.signal_type,
        primary_trigger_label: primaryTriggerLabel,
        primary_trigger_summary: primaryTriggerSummary,
        business_hypothesis: businessHypothesis,
        opportunity_reason: opportunityReason,
        trigger_confidence: triggerConfidence,
        evidence_count: evidenceItems.length,
        evidence_summary: evidenceItems.map(e => ({
          type: e.evidenceType,
          label: e.label,
          excerpt: e.shortExcerpt,
          source: e.sourceName,
          url: e.sourceUrl,
          date: e.evidenceDate,
          confidence: e.confidenceScore,
        })),
        evidence_status: evidenceStatus,
        display_status: displayStatus,
        updated_at: new Date().toISOString(),
      }

      // Upsert opportunity
      const { data: existing } = await admin
        .from('lead_opportunities')
        .select('id')
        .eq('account_id', accountId)
        .eq('company_id', companyId)
        .limit(1)

      let oppId: string
      if (existing?.[0]?.id) {
        const { error } = await admin
          .from('lead_opportunities')
          .update(oppData)
          .eq('id', existing[0].id)
        if (error) { errors.push(`Update opp ${companyId}: ${error.message}`); continue }
        oppId = existing[0].id
        opportunitiesUpdated++
      } else {
        const { data: inserted, error } = await admin
          .from('lead_opportunities')
          .insert({
            ...oppData,
            first_detected_at: new Date().toISOString(),
            status: 'new',
          })
          .select('id')
          .single()
        if (error || !inserted) { errors.push(`Insert opp ${companyId}: ${error?.message}`); continue }
        oppId = inserted.id
        opportunitiesCreated++
      }

      // Clear old evidence and insert new
      await admin.from('opportunity_evidence').delete().eq('opportunity_id', oppId)

      for (const ev of evidenceItems) {
        const { error } = await admin.from('opportunity_evidence').insert({
          opportunity_id: oppId,
          signal_id: ev.signalId,
          page_id: ev.pageId,
          evidence_type: ev.evidenceType,
          label: ev.label,
          short_excerpt: ev.shortExcerpt,
          source_name: ev.sourceName,
          source_url: ev.sourceUrl,
          evidence_date: ev.evidenceDate,
          confidence_score: ev.confidenceScore,
          rank: ev.rank,
        })
        if (!error) evidenceCreated++
      }
    } catch (e: any) {
      errors.push(`Qualify ${group.companyName}: ${e.message}`)
    }
  }

  log(`[qualification] Créées: ${opportunitiesCreated} | MAJ: ${opportunitiesUpdated} | Preuves: ${evidenceCreated}`)
  return { opportunitiesCreated, opportunitiesUpdated, evidenceCreated, errors }
}
