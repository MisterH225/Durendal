/**
 * Pipeline Orchestrator — Exécute le pipeline complet pour une veille.
 *
 * Étapes :
 *  1. runDiscoveryForWatch   — Discovery (Sonar + Firecrawl)
 *  2. fetchPendingSources    — Fetch / Scrape pages
 *  3. extractSignalsFromPages — Extraction signaux métier (Gemini)
 *  4. resolveAccountsFromSignals — Résolution d'entités entreprises
 *  5. buildOpportunitiesFromSignals — Qualification + Evidence
 *  6. recomputeExplanations  — (optionnel) re-scoring
 *
 * Chaque étape est indépendante, loguée, avec gestion d'erreurs.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { runDiscovery, type DiscoveryInput } from './agents/discovery-agent'
import { fetchPendingSources } from './agents/fetch-agent'
import { extractSignalsFromPages } from './agents/signal-extraction-agent'
import { qualifyOpportunities } from './agents/qualification-agent'
import { normalizeName } from './normalizer'

export interface PipelineResult {
  runId: string | null
  status: 'completed' | 'partial' | 'failed'
  stats: {
    sourcesDiscovered: number
    pagesFetched: number
    signalsExtracted: number
    signalsResolved: number
    opportunitiesCreated: number
    opportunitiesUpdated: number
    evidenceCreated: number
    durationMs: number
  }
  errors: string[]
  logs: string[]
}

/**
 * Exécute le pipeline complet pour une veille donnée.
 */
export async function runFullPipeline(
  admin: SupabaseClient,
  watchId: string,
): Promise<PipelineResult> {
  const start = Date.now()
  const logs: string[] = []
  const allErrors: string[] = []
  const log = (msg: string) => { console.log(msg); logs.push(msg) }

  const stats = {
    sourcesDiscovered: 0,
    pagesFetched: 0,
    signalsExtracted: 0,
    signalsResolved: 0,
    opportunitiesCreated: 0,
    opportunitiesUpdated: 0,
    evidenceCreated: 0,
    durationMs: 0,
  }

  // Load watch context
  const { data: watch, error: watchErr } = await admin
    .from('watches')
    .select('*, watch_companies(companies(id, name, website, sector, country))')
    .eq('id', watchId)
    .single()

  if (!watch || watchErr) {
    return {
      runId: null,
      status: 'failed',
      stats: { ...stats, durationMs: Date.now() - start },
      errors: [`Veille introuvable: ${watchErr?.message ?? watchId}`],
      logs,
    }
  }

  const accountId: string = watch.account_id
  const sectors: string[] = watch.sectors ?? []
  const countries: string[] = watch.countries ?? []
  const companies = (watch.watch_companies ?? [])
    .map((wc: any) => wc.companies)
    .filter(Boolean)
    .map((c: any) => ({ id: c.id, name: c.name, website: c.website, sector: c.sector, country: c.country }))

  log(`\n═══ PIPELINE OPPORTUNITÉS ═══`)
  log(`Veille: ${watch.name} | Entreprises: ${companies.length} | Secteurs: ${sectors.join(', ')} | Pays: ${countries.join(', ')}`)

  // Create pipeline run record
  const { data: run } = await admin.from('pipeline_runs').insert({
    account_id: accountId,
    watch_id: watchId,
    status: 'running',
  }).select('id').single()

  const runId = run?.id ?? null

  try {
    // ─── STEP 1: Discovery ───
    log(`\n── ÉTAPE 1/5 : Discovery (Sonar + Firecrawl) ──`)
    const discoveryInput: DiscoveryInput = {
      watchId,
      watchName: watch.name,
      accountId,
      sectors,
      countries,
      companies: companies.map((c: any) => ({ id: c.id, name: c.name, website: c.website })),
    }

    const discoveryResult = await runDiscovery(admin, discoveryInput, log)
    stats.sourcesDiscovered = discoveryResult.insertedCount
    allErrors.push(...discoveryResult.errors)

    // ─── STEP 2: Fetch ───
    log(`\n── ÉTAPE 2/5 : Fetch / Scrape pages ──`)
    const fetchResult = await fetchPendingSources(admin, accountId, watchId, 30, log)
    stats.pagesFetched = fetchResult.fetchedCount
    allErrors.push(...fetchResult.errors)

    // ─── STEP 3: Extract signals ───
    log(`\n── ÉTAPE 3/5 : Extraction signaux métier (Gemini) ──`)
    const extractResult = await extractSignalsFromPages(
      admin, accountId, watchId, sectors, countries, companies, 20, log,
    )
    stats.signalsExtracted = extractResult.extractedCount
    allErrors.push(...extractResult.errors)

    // ─── STEP 4: Resolve entities ───
    log(`\n── ÉTAPE 4/5 : Résolution d'entités ──`)
    const resolveResult = await resolveAccountsFromSignals(admin, accountId, watchId, log)
    stats.signalsResolved = resolveResult.resolved
    allErrors.push(...resolveResult.errors)

    // ─── STEP 5: Qualification ───
    log(`\n── ÉTAPE 5/5 : Qualification des opportunités ──`)
    const qualResult = await qualifyOpportunities(admin, accountId, watchId, sectors, log)
    stats.opportunitiesCreated = qualResult.opportunitiesCreated
    stats.opportunitiesUpdated = qualResult.opportunitiesUpdated
    stats.evidenceCreated = qualResult.evidenceCreated
    allErrors.push(...qualResult.errors)

    stats.durationMs = Date.now() - start

    log(`\n═══ RÉSUMÉ PIPELINE ═══`)
    log(`  Sources découvertes : ${stats.sourcesDiscovered}`)
    log(`  Pages récupérées    : ${stats.pagesFetched}`)
    log(`  Signaux extraits    : ${stats.signalsExtracted}`)
    log(`  Signaux résolus     : ${stats.signalsResolved}`)
    log(`  Opportunités créées : ${stats.opportunitiesCreated}`)
    log(`  Opportunités MAJ    : ${stats.opportunitiesUpdated}`)
    log(`  Preuves créées      : ${stats.evidenceCreated}`)
    log(`  Erreurs             : ${allErrors.length}`)
    log(`  Durée               : ${Math.round(stats.durationMs / 1000)}s`)

    const hasAnyResult = stats.signalsExtracted > 0 || stats.opportunitiesCreated > 0 || stats.opportunitiesUpdated > 0
    const finalStatus = hasAnyResult ? 'completed' : (allErrors.length > 0 ? 'partial' : 'completed')

    if (runId) {
      await admin.from('pipeline_runs').update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        stats,
        errors: allErrors.slice(0, 50),
      }).eq('id', runId)
    }

    return { runId, status: finalStatus, stats, errors: allErrors, logs }
  } catch (e: any) {
    stats.durationMs = Date.now() - start
    allErrors.push(`Pipeline fatal: ${e.message}`)
    log(`\n✗ ERREUR FATALE: ${e.message}`)

    if (runId) {
      await admin.from('pipeline_runs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        stats,
        errors: allErrors.slice(0, 50),
      }).eq('id', runId)
    }

    return { runId, status: 'failed', stats, errors: allErrors, logs }
  }
}

/**
 * Step 4 helper — Resolve unlinked signals to companies.
 * For extracted signals with company_name_raw but no company_id,
 * try to match to existing companies.
 */
async function resolveAccountsFromSignals(
  admin: SupabaseClient,
  accountId: string,
  watchId: string,
  log: (msg: string) => void,
): Promise<{ resolved: number; errors: string[] }> {
  let resolved = 0
  const errors: string[] = []

  const { data: unlinked } = await admin
    .from('extracted_signals')
    .select('id, company_name_raw, company_country_raw, company_website_raw')
    .eq('account_id', accountId)
    .eq('watch_id', watchId)
    .is('company_id', null)
    .not('company_name_raw', 'is', null)
    .limit(200)

  if (!unlinked?.length) {
    log(`[resolve] Aucun signal sans entreprise`)
    return { resolved: 0, errors: [] }
  }

  log(`[resolve] ${unlinked.length} signaux à résoudre`)

  // Get all companies the user tracks in this watch
  const { data: watchCompanies } = await admin
    .from('watch_companies')
    .select('companies(id, name, normalized_name, website)')
    .eq('watch_id', watchId)

  const knownCompanies = (watchCompanies ?? [])
    .map((wc: any) => wc.companies)
    .filter(Boolean)
    .map((c: any) => ({
      id: c.id as string,
      name: c.name as string,
      normalized: (c.normalized_name ?? normalizeName(c.name)).toLowerCase(),
      website: c.website as string | null,
    }))

  for (const sig of unlinked) {
    if (!sig.company_name_raw) continue
    const norm = normalizeName(sig.company_name_raw).toLowerCase()

    // Try to match by normalized name
    const match = knownCompanies.find(c =>
      c.normalized === norm ||
      c.normalized.includes(norm) ||
      norm.includes(c.normalized) ||
      c.name.toLowerCase() === sig.company_name_raw.toLowerCase()
    )

    if (match) {
      const { error } = await admin
        .from('extracted_signals')
        .update({ company_id: match.id })
        .eq('id', sig.id)
      if (!error) resolved++
      else errors.push(`Resolve ${sig.id}: ${error.message}`)
    }
  }

  log(`[resolve] ${resolved} signaux liés à des entreprises connues`)
  return { resolved, errors }
}

/**
 * Re-run only qualification on existing extracted signals.
 */
export async function recomputeOpportunityExplanations(
  admin: SupabaseClient,
  accountId: string,
  watchId: string,
): Promise<QualificationResult> {
  const log = (msg: string) => console.log(msg)
  return qualifyOpportunities(admin, accountId, watchId, [], log)
}

interface QualificationResult {
  opportunitiesCreated: number
  opportunitiesUpdated: number
  evidenceCreated: number
  errors: string[]
}
