/**
 * Moteur principal des opportunités commerciales.
 *
 * Pipeline :
 *  1. Charger les signaux récents pour un account_id
 *  2. Agréger les signaux par entreprise (company)
 *  3. Calculer le scoring + trigger data pour chaque entreprise
 *  4. Créer ou mettre à jour les lead_opportunities
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  computeFullScore,
  getHeatLevel,
  computeConfidenceScore,
  type ScoringInput,
  type SignalInput,
  type ContactInput,
  type FitInput,
} from './scoring'
import { getSignalApproachAngle, SIGNAL_TYPE_MAP } from './signals-taxonomy'
import { getSectorConfig } from './sector-config'
import { computeTriggerData, type RawSignal } from './trigger-engine'

interface WatchContext {
  id: string
  sectors: string[]
  countries: string[]
  name: string
}

interface CompanySignalGroup {
  companyId: string
  companyName: string
  companySector: string | null
  companyCountry: string | null
  companyWebsite: string | null
  companyLogoUrl: string | null
  employeeRange: string | null
  companyType: string | null
  signals: {
    id: string
    type: string
    subtype: string | null
    title: string | null
    detectedAt: string
    confidenceScore: number
    url: string | null
    rawContent: string | null
    sourceName: string | null
  }[]
  watchId: string
  watchName: string
}

function computeFit(
  company: CompanySignalGroup,
  watch: WatchContext,
): FitInput {
  const sectorMatch = watch.sectors.some(s =>
    company.companySector?.toLowerCase().includes(s.toLowerCase()) ?? false
  )
  const subSectorMatch = !sectorMatch && watch.sectors.some(s => {
    const cfg = getSectorConfig(s)
    return cfg?.keywords.some(k => company.companySector?.toLowerCase().includes(k)) ?? false
  })
  const countryMatch = watch.countries.some(c =>
    company.companyCountry?.toUpperCase() === c.toUpperCase()
  )
  const sizeMatch = !!company.employeeRange
  const companyTypeMatch = !!company.companyType

  let keywordMatches = 0
  const watchName = watch.name.toLowerCase()
  const tokens = watchName.split(/\s+/).filter(t => t.length > 3)
  for (const token of tokens) {
    if (company.companyName.toLowerCase().includes(token) ||
        company.companySector?.toLowerCase().includes(token)) {
      keywordMatches++
    }
  }

  return { sectorMatch, subSectorMatch, countryMatch, sizeMatch, companyTypeMatch, keywordMatches: Math.min(keywordMatches, 5) }
}

function buildSignalInputs(group: CompanySignalGroup): SignalInput[] {
  return group.signals.map(s => ({
    id: s.id,
    type: s.type || 'unknown',
    subtype: s.subtype ?? undefined,
    detectedAt: s.detectedAt,
    confidenceScore: s.confidenceScore ?? 0.5,
    title: s.title ?? undefined,
  }))
}

function buildRawSignals(group: CompanySignalGroup): RawSignal[] {
  return group.signals.map(s => ({
    id: s.id,
    type: s.type || 'unknown',
    subtype: s.subtype,
    title: s.title,
    detectedAt: s.detectedAt,
    confidenceScore: s.confidenceScore ?? 0.5,
    url: s.url,
    rawContent: s.rawContent,
    sourceName: s.sourceName,
  }))
}

function companyDataCompleteness(group: CompanySignalGroup): number {
  let filled = 0
  const fields = [group.companyName, group.companySector, group.companyCountry, group.companyWebsite, group.employeeRange, group.companyType]
  for (const f of fields) { if (f) filled++ }
  return filled / fields.length
}

function bestApproachAngle(signals: SignalInput[], sectors: string[]): string {
  if (signals.length === 0) return 'Approche généraliste'

  const sorted = [...signals].sort((a, b) => {
    const sa = SIGNAL_TYPE_MAP.get(a.type)?.baseScore ?? 0
    const sb = SIGNAL_TYPE_MAP.get(b.type)?.baseScore ?? 0
    return sb - sa
  })

  const bestSignal = sorted[0]
  const sectorCfg = sectors.length > 0 ? getSectorConfig(sectors[0]) : undefined
  if (sectorCfg?.approachExamples.length) {
    return sectorCfg.approachExamples[0]
  }
  return getSignalApproachAngle(bestSignal.type)
}

/**
 * Recalcule toutes les opportunités pour un compte utilisateur.
 */
export async function recomputeOpportunities(
  admin: SupabaseClient,
  accountId: string,
): Promise<{ created: number; updated: number; errors: string[] }> {
  const errors: string[] = []
  let created = 0
  let updated = 0

  const { data: watches } = await admin
    .from('watches')
    .select('id, name, sectors, countries')
    .eq('account_id', accountId)
    .eq('is_active', true)

  if (!watches?.length) return { created: 0, updated: 0, errors: ['Aucune veille active'] }

  for (const watch of watches) {
    const ctx: WatchContext = {
      id: watch.id,
      sectors: watch.sectors || [],
      countries: watch.countries || [],
      name: watch.name,
    }

    const { data: signals } = await admin
      .from('signals')
      .select(`
        id, signal_type, title, url, raw_content, collected_at, relevance_score,
        confidence_score, signal_subtype, source_name,
        companies!inner(id, name, sector, country, website, logo_url, employee_range, company_type)
      `)
      .eq('watch_id', watch.id)
      .not('company_id', 'is', null)
      .order('collected_at', { ascending: false })
      .limit(500)

    if (!signals?.length) continue

    const groups = new Map<string, CompanySignalGroup>()
    for (const sig of signals) {
      const co = sig.companies as any
      if (!co?.id) continue

      if (!groups.has(co.id)) {
        groups.set(co.id, {
          companyId: co.id,
          companyName: co.name,
          companySector: co.sector,
          companyCountry: co.country,
          companyWebsite: co.website,
          companyLogoUrl: co.logo_url,
          employeeRange: co.employee_range,
          companyType: co.company_type,
          signals: [],
          watchId: watch.id,
          watchName: watch.name,
        })
      }
      groups.get(co.id)!.signals.push({
        id: sig.id,
        type: sig.signal_type || 'unknown',
        subtype: sig.signal_subtype,
        title: sig.title,
        detectedAt: sig.collected_at,
        confidenceScore: sig.confidence_score ?? sig.relevance_score ?? 0.5,
        url: sig.url,
        rawContent: sig.raw_content,
        sourceName: sig.source_name ?? null,
      })
    }

    for (const [companyId, group] of groups) {
      try {
        const signalInputs = buildSignalInputs(group)
        const rawSignals = buildRawSignals(group)
        const fitInput = computeFit(group, ctx)
        const completeness = companyDataCompleteness(group)

        const { data: existingOpp } = await admin
          .from('lead_opportunities')
          .select('id')
          .eq('account_id', accountId)
          .eq('company_id', companyId)
          .limit(1)

        const oppId = existingOpp?.[0]?.id

        let contactInputs: ContactInput[] = []
        if (oppId) {
          const { data: contacts } = await admin
            .from('contact_candidates')
            .select('email, phone, linkedin_url, is_decision_maker')
            .eq('opportunity_id', oppId)
          contactInputs = (contacts || []).map(c => ({
            hasEmail: !!c.email,
            hasPhone: !!c.phone,
            hasLinkedin: !!c.linkedin_url,
            isDecisionMaker: c.is_decision_maker ?? false,
          }))
        }

        const scoringInput: ScoringInput = {
          fit: fitInput,
          signals: signalInputs,
          contacts: contactInputs,
          userSectors: ctx.sectors,
          engagementLevel: 'none',
          companyDataCompleteness: completeness,
        }

        const breakdown = computeFullScore(scoringInput)
        const heatLevel = getHeatLevel(breakdown.final)
        const confidence = computeConfidenceScore(signalInputs, completeness)
        const angle = bestApproachAngle(signalInputs, ctx.sectors)

        // Trigger engine — signal principal, hypothèse, preuves
        const trigger = computeTriggerData(rawSignals, group.companySector, group.companyName)

        const title = trigger.primaryTriggerLabel
          ? `${group.companyName} — ${trigger.primaryTriggerLabel}`
          : `${group.companyName} — Signal détecté`

        const summary = trigger.businessHypothesis || trigger.opportunityReason || `${group.signals.length} signal(s) détecté(s).`

        const lastSignalAt = group.signals.length > 0
          ? group.signals.reduce((latest, s) =>
              new Date(s.detectedAt) > new Date(latest) ? s.detectedAt : latest,
            group.signals[0].detectedAt)
          : null

        const oppData = {
          account_id: accountId,
          company_id: companyId,
          primary_watch_id: watch.id,
          title,
          summary,
          fit_score: breakdown.fit.score,
          intent_score: breakdown.intent.score,
          recency_score: breakdown.recency.score,
          engagement_score: breakdown.engagement.score,
          reachability_score: breakdown.reachability.score,
          confidence_score: confidence,
          noise_penalty: breakdown.noisePenalty.score,
          total_score: breakdown.final,
          heat_level: heatLevel,
          recommended_angle: angle,
          last_signal_at: lastSignalAt,
          last_scored_at: new Date().toISOString(),
          score_breakdown: breakdown,
          // Trigger-engine fields
          primary_trigger_type: trigger.primaryTriggerType || null,
          primary_trigger_label: trigger.primaryTriggerLabel || null,
          primary_trigger_summary: trigger.primaryTriggerSummary || null,
          business_hypothesis: trigger.businessHypothesis || null,
          opportunity_reason: trigger.opportunityReason || null,
          trigger_confidence: trigger.triggerConfidence,
          evidence_count: trigger.evidenceCount,
          evidence_summary: trigger.evidenceSummary,
          evidence_status: trigger.evidenceStatus,
          display_status: trigger.displayStatus,
          updated_at: new Date().toISOString(),
        }

        if (oppId) {
          await admin.from('lead_opportunities').update(oppData).eq('id', oppId)
          updated++
        } else {
          await admin.from('lead_opportunities').insert({
            ...oppData,
            first_detected_at: new Date().toISOString(),
            status: 'new',
            explanation: {
              signals: group.signals.map(s => ({ type: s.type, title: s.title, date: s.detectedAt })),
            },
          })
          created++
        }

        for (const sig of group.signals) {
          await admin.from('account_signals').upsert(
            { company_id: companyId, signal_id: sig.id, signal_weight: 1.0 },
            { onConflict: 'company_id,signal_id' },
          )
        }
      } catch (e: any) {
        errors.push(`${group.companyName}: ${e.message}`)
      }
    }
  }

  return { created, updated, errors }
}
