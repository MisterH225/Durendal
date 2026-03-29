/**
 * Pipeline de recherche sectorielle d'opportunités.
 *
 * Entrée : sector + country (pas de veille nécessaire).
 * Réutilise les agents discovery/fetch/extraction/qualification.
 *
 * Étapes :
 *  1. buildSectorQueries → construction requêtes
 *  2. discovery (Sonar + Firecrawl)
 *  3. fetch pages
 *  4. extract signals
 *  5. resolve entities
 *  6. qualify opportunities
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { searchWithSonar, type DiscoveredUrl } from './services/sonar-service'
import { firecrawlBatchSearch } from './services/firecrawl-service'
import { fetchPendingSources } from './agents/fetch-agent'
import { extractSignalsFromPages } from './agents/signal-extraction-agent'
import { normalizeName } from './normalizer'
import { buildSectorQueries, getSectorSearchProfile } from './sector-search-taxonomy'
import {
  getSignalBusinessLabel,
  getSignalHypothesisTemplate,
  getSignalApproachAngle,
  getSignalBadge,
  getSignalConfig,
} from './signals-taxonomy'
import { countryName } from '@/lib/countries'

export interface SectorSearchInput {
  searchId: string
  accountId: string
  sector: string
  subSector?: string
  country: string
  region?: string
  keywords?: string[]
  opportunityTypes?: string[]
  dateRangeDays?: number
}

export interface SectorSearchResult {
  status: 'completed' | 'partial' | 'failed'
  stats: {
    queriesGenerated: number
    sourcesDiscovered: number
    pagesFetched: number
    signalsExtracted: number
    entitiesResolved: number
    opportunitiesCreated: number
    evidenceCreated: number
    durationMs: number
  }
  errors: string[]
  logs: string[]
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

// ── Step 1: Discovery for sector search ──

async function discoverForSectorSearch(
  admin: SupabaseClient,
  input: SectorSearchInput,
  queries: string[],
  log: (msg: string) => void,
): Promise<{ insertedCount: number; errors: string[] }> {
  const seen = new Set<string>()
  let insertedCount = 0
  const errors: string[] = []

  const recency = (input.dateRangeDays ?? 30) <= 7 ? 'week' as const
    : (input.dateRangeDays ?? 30) <= 30 ? 'month' as const : 'year' as const

  // Split queries: half for Sonar, half for Firecrawl, both in parallel
  const sonarQueries = queries.slice(0, Math.ceil(queries.length / 2))
  const fcQueries = queries.slice(Math.ceil(queries.length / 2))

  const [sonarResults, fcResults] = await Promise.allSettled([
    (async () => {
      const allUrls: DiscoveredUrl[] = []
      for (const q of sonarQueries) {
        try {
          const urls = await searchWithSonar(q, {
            recency,
            country: input.country,
            maxResults: 5,
          })
          allUrls.push(...urls)
        } catch (e: any) {
          errors.push(`Sonar: ${e.message}`)
        }
        await new Promise(r => setTimeout(r, 300))
      }
      return allUrls
    })(),
    firecrawlBatchSearch(fcQueries, 5),
  ])

  const allSources: { url: string; title: string; domain: string; snippet: string; provider: string; relevance: number }[] = []

  if (sonarResults.status === 'fulfilled') {
    for (const s of sonarResults.value) {
      if (!s.url || seen.has(s.url)) continue
      seen.add(s.url)
      allSources.push({ url: s.url, title: s.title, domain: s.domain, snippet: s.snippet, provider: s.provider, relevance: s.relevanceScore })
    }
  }

  if (fcResults.status === 'fulfilled') {
    for (const r of fcResults.value) {
      if (!r.url || seen.has(r.url)) continue
      seen.add(r.url)
      allSources.push({ url: r.url, title: r.title, domain: r.domain, snippet: r.snippet, provider: 'firecrawl', relevance: 0.5 })
    }
  }

  log(`[sector-discovery] ${allSources.length} URLs uniques`)

  for (const src of allSources) {
    try {
      const { error } = await admin.from('discovered_sources').insert({
        account_id: input.accountId,
        search_id: input.searchId,
        watch_id: null,
        query: `${input.sector} ${input.country} sector search`,
        source_type: 'web',
        provider: src.provider,
        title: src.title,
        url: src.url,
        domain: src.domain || extractDomain(src.url),
        snippet: src.snippet?.slice(0, 2000),
        relevance_score: src.relevance,
        status: 'pending',
      })
      if (error && error.code !== '23505') errors.push(`Insert source: ${error.message}`)
      else if (!error) insertedCount++
    } catch (e: any) {
      errors.push(`Source insert: ${e.message}`)
    }
  }

  return { insertedCount, errors }
}

// ── Step 2: Fetch (reuse fetch-agent with search context) ──

async function fetchSectorSources(
  admin: SupabaseClient,
  input: SectorSearchInput,
  log: (msg: string) => void,
): Promise<{ fetchedCount: number; errors: string[] }> {
  const result = await fetchPendingSources(admin, input.accountId, '', 30, log, input.searchId)
  return { fetchedCount: result.fetchedCount, errors: result.errors }
}

// ── Step 3: Extract signals for sector search ──

async function extractSectorSignals(
  admin: SupabaseClient,
  input: SectorSearchInput,
  log: (msg: string) => void,
): Promise<{ extractedCount: number; errors: string[] }> {
  const profile = getSectorSearchProfile(input.sector)
  const countryLabel = countryName(input.country) || input.country

  const result = await extractSignalsFromPages(
    admin,
    input.accountId,
    '',
    [input.sector, ...(input.subSector ? [input.subSector] : [])],
    [input.country],
    [],
    30,
    log,
    input.searchId,
  )

  return { extractedCount: result.extractedCount, errors: result.errors }
}

// ── Step 4: Entity resolution for sector search ──

async function resolveEntitiesForSectorSearch(
  admin: SupabaseClient,
  input: SectorSearchInput,
  log: (msg: string) => void,
): Promise<{ resolved: number; created: number; errors: string[] }> {
  let resolved = 0
  let created = 0
  const errors: string[] = []

  const { data: unlinked } = await admin
    .from('extracted_signals')
    .select('id, company_name_raw, company_country_raw')
    .eq('account_id', input.accountId)
    .eq('search_id', input.searchId)
    .is('company_id', null)
    .not('company_name_raw', 'is', null)
    .limit(200)

  if (!unlinked?.length) {
    log(`[sector-resolve] Aucun signal à résoudre`)
    return { resolved: 0, created: 0, errors: [] }
  }

  log(`[sector-resolve] ${unlinked.length} signaux à résoudre`)

  const companyCache = new Map<string, string>()

  for (const sig of unlinked) {
    if (!sig.company_name_raw) continue
    const norm = normalizeName(sig.company_name_raw).toLowerCase()

    if (companyCache.has(norm)) {
      await admin.from('extracted_signals').update({ company_id: companyCache.get(norm) }).eq('id', sig.id)
      resolved++
      continue
    }

    // Try to find existing company
    const { data: existing } = await admin
      .from('companies')
      .select('id, name')
      .or(`name.ilike.%${sig.company_name_raw}%,normalized_name.ilike.%${norm}%`)
      .limit(1)

    if (existing?.length) {
      companyCache.set(norm, existing[0].id)
      await admin.from('extracted_signals').update({ company_id: existing[0].id }).eq('id', sig.id)
      resolved++
      continue
    }

    // Create new company
    const { data: newCo, error } = await admin.from('companies').insert({
      name: sig.company_name_raw,
      normalized_name: normalizeName(sig.company_name_raw),
      country: sig.company_country_raw || input.country,
      sector: input.sector,
    }).select('id').single()

    if (newCo) {
      companyCache.set(norm, newCo.id)
      await admin.from('extracted_signals').update({ company_id: newCo.id }).eq('id', sig.id)
      created++
    } else if (error) {
      errors.push(`Create company ${sig.company_name_raw}: ${error.message}`)
    }
  }

  log(`[sector-resolve] ${resolved} liés existants | ${created} entreprises créées`)
  return { resolved, created, errors }
}

// ── Step 5: Qualify sector opportunities ──

function daysSince(dateStr: string): number {
  return Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function signalStrength(sig: any): number {
  const cfg = getSignalConfig(sig.signal_type)
  const base = cfg?.baseScore ?? 10
  const recency = daysSince(sig.detected_at) <= 14 ? 1.3 : daysSince(sig.detected_at) <= 30 ? 1.1 : 1.0
  return base * recency * (sig.confidence_score || 0.5) * (sig.source_reliability || 0.5)
}

async function qualifySectorOpportunities(
  admin: SupabaseClient,
  input: SectorSearchInput,
  log: (msg: string) => void,
): Promise<{ created: number; evidenceCreated: number; errors: string[] }> {
  let created = 0
  let evidenceCreated = 0
  const errors: string[] = []

  const { data: signals } = await admin
    .from('extracted_signals')
    .select('*')
    .eq('account_id', input.accountId)
    .eq('search_id', input.searchId)
    .order('detected_at', { ascending: false })
    .limit(500)

  if (!signals?.length) {
    log(`[sector-qualify] Aucun signal`)
    return { created: 0, evidenceCreated: 0, errors: [] }
  }

  // Group by company (or by entity for company-less signals)
  const groups = new Map<string, any[]>()
  for (const sig of signals) {
    const key = sig.company_id || `anon:${normalizeName(sig.company_name_raw || 'unknown')}`
    const arr = groups.get(key) || []
    arr.push(sig)
    groups.set(key, arr)
  }

  log(`[sector-qualify] ${groups.size} groupes de signaux à qualifier`)

  for (const [key, sigs] of groups) {
    try {
      const companyId = key.startsWith('anon:') ? null : key
      const companyName = sigs[0].company_name_raw || 'Entité inconnue'

      // Select primary trigger
      const sorted = [...sigs].sort((a, b) => signalStrength(b) - signalStrength(a))
      const primary = sorted[0]
      const sameType = sigs.filter(s => s.signal_type === primary.signal_type)

      const primaryLabel = getSignalBusinessLabel(primary.signal_type)
      const primarySummary = sameType.length > 1
        ? `${sameType.length} signaux "${getSignalBadge(primary.signal_type)}" détectés. ${primary.signal_summary || primary.signal_label}`
        : primary.signal_summary || primary.signal_label
      const hypothesis = getSignalHypothesisTemplate(primary.signal_type)
      const angle = getSignalApproachAngle(primary.signal_type)

      // Build evidence
      const evidenceItems = sorted.slice(0, 5).map((sig, i) => {
        const d = sig.event_date || sig.detected_at
        return {
          signalId: sig.id,
          pageId: sig.page_id,
          type: sig.signal_type,
          label: sig.signal_label,
          excerpt: sig.signal_summary?.slice(0, 200) ?? sig.signal_label,
          source: sig.source_name ?? sig.source_domain ?? 'Web',
          url: sig.source_url ?? '',
          date: d,
          confidence: sig.confidence_score,
          rank: i + 1,
        }
      })

      // Evidence quality
      const goodSignals = sigs.filter((s: any) => s.confidence_score >= 0.5)
      const uniqueTypes = new Set(sigs.map((s: any) => s.signal_type))
      const evidenceStatus = goodSignals.length >= 2 && uniqueTypes.size >= 2 ? 'sufficient'
        : goodSignals.length >= 1 || sigs.length >= 2 ? 'insufficient' : 'weak'

      const displayStatus = !primaryLabel || evidenceStatus === 'weak' ? 'hidden'
        : evidenceStatus === 'insufficient' ? 'draft' : 'visible'

      // Score
      let totalScore = 0
      for (const sig of sigs) {
        const cfg = getSignalConfig(sig.signal_type)
        if (!cfg) continue
        const mult = cfg.category === 'high_intent' ? 1.5 : cfg.category === 'medium_intent' ? 1.0 : 0.5
        totalScore += cfg.baseScore * mult * (sig.confidence_score || 0.5)
      }
      if (evidenceStatus === 'sufficient') totalScore += 15
      if (uniqueTypes.size >= 3) totalScore += 15
      else if (uniqueTypes.size >= 2) totalScore += 8
      totalScore = Math.min(100, Math.max(0, Math.round(totalScore)))

      const heatLevel = evidenceStatus === 'weak' ? 'cold'
        : totalScore >= 70 && evidenceStatus === 'sufficient' ? 'hot'
        : totalScore >= 45 ? 'warm' : 'cold'

      const triggerConfidence = Math.min(100, Math.round(
        (primary.confidence_score || 0.5) * 60 +
        Math.min(sameType.length * 8, 25) +
        (primary.source_reliability || 0.5) * 15
      ))

      const lastSignalAt = sigs.reduce((latest: string, s: any) => {
        const d = s.event_date || s.detected_at
        return new Date(d) > new Date(latest) ? d : latest
      }, sigs[0].event_date || sigs[0].detected_at)

      const title = `${companyName} — ${primaryLabel}`
      const countryLabel = countryName(input.country) || input.country
      const reason = `Signal de type "${primaryLabel}" détecté pour ${companyName} dans le secteur ${input.sector} (${countryLabel}).`

      const { data: opp, error: oppErr } = await admin.from('lead_opportunities').insert({
        account_id: input.accountId,
        company_id: companyId,
        search_id: input.searchId,
        primary_watch_id: null,
        title,
        summary: hypothesis,
        total_score: totalScore,
        confidence_score: triggerConfidence,
        heat_level: heatLevel,
        recommended_angle: angle,
        last_signal_at: lastSignalAt,
        last_scored_at: new Date().toISOString(),
        first_detected_at: new Date().toISOString(),
        status: 'new',
        score_breakdown: {
          signalTypes: [...uniqueTypes],
          signalCount: sigs.length,
          evidenceStatus,
          triggerConfidence,
        },
        primary_trigger_type: primary.signal_type,
        primary_trigger_label: primaryLabel,
        primary_trigger_summary: primarySummary,
        business_hypothesis: hypothesis,
        opportunity_reason: reason,
        trigger_confidence: triggerConfidence,
        evidence_count: evidenceItems.length,
        evidence_summary: evidenceItems.map(e => ({
          type: e.type, label: e.label, excerpt: e.excerpt,
          source: e.source, url: e.url, date: e.date, confidence: e.confidence,
        })),
        evidence_status: evidenceStatus,
        display_status: displayStatus,
        origin: 'sector_search',
        sector: input.sector,
        country: input.country,
      }).select('id').single()

      if (oppErr) { errors.push(`Opp insert: ${oppErr.message}`); continue }
      created++

      // Insert evidence
      for (const ev of evidenceItems) {
        const { error } = await admin.from('opportunity_evidence').insert({
          opportunity_id: opp!.id,
          signal_id: ev.signalId,
          page_id: ev.pageId,
          evidence_type: ev.type,
          label: ev.label,
          short_excerpt: ev.excerpt,
          source_name: ev.source,
          source_url: ev.url,
          evidence_date: ev.date,
          confidence_score: ev.confidence,
          rank: ev.rank,
        })
        if (!error) evidenceCreated++
      }
    } catch (e: any) {
      errors.push(`Qualify: ${e.message}`)
    }
  }

  log(`[sector-qualify] ${created} opportunités créées | ${evidenceCreated} preuves`)
  return { created, evidenceCreated, errors }
}

// ── Main orchestrator ──

export async function runSectorSearchPipeline(
  admin: SupabaseClient,
  input: SectorSearchInput,
): Promise<SectorSearchResult> {
  const start = Date.now()
  const logs: string[] = []
  const allErrors: string[] = []
  const log = (msg: string) => { console.log(msg); logs.push(msg) }

  const stats = {
    queriesGenerated: 0,
    sourcesDiscovered: 0,
    pagesFetched: 0,
    signalsExtracted: 0,
    entitiesResolved: 0,
    opportunitiesCreated: 0,
    evidenceCreated: 0,
    durationMs: 0,
  }

  const countryLabel = countryName(input.country) || input.country
  log(`\n═══ SECTOR SEARCH PIPELINE ═══`)
  log(`Secteur: ${input.sector} | Pays: ${countryLabel} | Sous-secteur: ${input.subSector || '—'}`)

  // Update search status
  await admin.from('opportunity_searches').update({
    status: 'running',
    started_at: new Date().toISOString(),
  }).eq('id', input.searchId)

  // Create pipeline run
  const { data: run } = await admin.from('pipeline_runs').insert({
    account_id: input.accountId,
    search_id: input.searchId,
    watch_id: null,
    status: 'running',
  }).select('id').single()

  try {
    // Step 1: Build queries
    log(`\n── ÉTAPE 1/5 : Construction des requêtes ──`)
    const queries = buildSectorQueries(input.sector, input.country, {
      subSector: input.subSector,
      keywords: input.keywords,
      opportunityTypes: input.opportunityTypes,
      dateRangeDays: input.dateRangeDays,
    })
    stats.queriesGenerated = queries.length
    log(`[queries] ${queries.length} requêtes générées`)
    for (const q of queries.slice(0, 5)) log(`  → ${q}`)
    if (queries.length > 5) log(`  ... et ${queries.length - 5} autres`)

    // Step 2: Discovery
    log(`\n── ÉTAPE 2/5 : Discovery (Sonar + Firecrawl) ──`)
    const disc = await discoverForSectorSearch(admin, input, queries, log)
    stats.sourcesDiscovered = disc.insertedCount
    allErrors.push(...disc.errors)

    // Step 3: Fetch
    log(`\n── ÉTAPE 3/5 : Fetch / Scrape pages ──`)
    const fetchResult = await fetchSectorSources(admin, input, log)
    stats.pagesFetched = fetchResult.fetchedCount
    allErrors.push(...fetchResult.errors)

    // Step 4: Extract
    log(`\n── ÉTAPE 4/5 : Extraction signaux métier ──`)
    const extract = await extractSectorSignals(admin, input, log)
    stats.signalsExtracted = extract.extractedCount
    allErrors.push(...extract.errors)

    // Step 5a: Entity resolution
    log(`\n── ÉTAPE 5a : Résolution d'entités ──`)
    const resolve = await resolveEntitiesForSectorSearch(admin, input, log)
    stats.entitiesResolved = resolve.resolved + resolve.created
    allErrors.push(...resolve.errors)

    // Step 5b: Qualification
    log(`\n── ÉTAPE 5b : Qualification des opportunités ──`)
    const qualify = await qualifySectorOpportunities(admin, input, log)
    stats.opportunitiesCreated = qualify.created
    stats.evidenceCreated = qualify.evidenceCreated
    allErrors.push(...qualify.errors)

    stats.durationMs = Date.now() - start

    log(`\n═══ RÉSUMÉ SECTOR SEARCH ═══`)
    log(`  Requêtes      : ${stats.queriesGenerated}`)
    log(`  Sources        : ${stats.sourcesDiscovered}`)
    log(`  Pages          : ${stats.pagesFetched}`)
    log(`  Signaux        : ${stats.signalsExtracted}`)
    log(`  Entités        : ${stats.entitiesResolved}`)
    log(`  Opportunités   : ${stats.opportunitiesCreated}`)
    log(`  Preuves        : ${stats.evidenceCreated}`)
    log(`  Durée          : ${Math.round(stats.durationMs / 1000)}s`)

    const finalStatus = stats.opportunitiesCreated > 0 ? 'completed' : stats.signalsExtracted > 0 ? 'partial' : 'failed'

    // Update search
    await admin.from('opportunity_searches').update({
      status: finalStatus,
      results_count: stats.opportunitiesCreated,
      stats,
      errors: allErrors.slice(0, 50),
      completed_at: new Date().toISOString(),
    }).eq('id', input.searchId)

    if (run?.id) {
      await admin.from('pipeline_runs').update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        stats,
        errors: allErrors.slice(0, 50),
      }).eq('id', run.id)
    }

    return { status: finalStatus as any, stats, errors: allErrors, logs }
  } catch (e: any) {
    stats.durationMs = Date.now() - start
    allErrors.push(`Fatal: ${e.message}`)

    await admin.from('opportunity_searches').update({
      status: 'failed',
      stats,
      errors: allErrors.slice(0, 50),
      completed_at: new Date().toISOString(),
    }).eq('id', input.searchId)

    if (run?.id) {
      await admin.from('pipeline_runs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        stats,
        errors: allErrors.slice(0, 50),
      }).eq('id', run.id)
    }

    return { status: 'failed', stats, errors: allErrors, logs }
  }
}
