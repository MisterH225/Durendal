/**
 * Discovery Agent — Layer 1
 * Interroge Perplexity Sonar + Firecrawl en parallèle pour trouver
 * des URLs pertinentes à partir des veilles utilisateur.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { discoverSourcesForWatch, type DiscoveredUrl } from '../services/sonar-service'
import { firecrawlBatchSearch, type FirecrawlSearchResult } from '../services/firecrawl-service'
import { countryName } from '@/lib/countries'

export interface DiscoveryInput {
  watchId: string
  watchName: string
  accountId: string
  sectors: string[]
  countries: string[]
  companies: { id: string; name: string; website?: string | null }[]
  keywords?: string[]
}

export interface DiscoveryResult {
  sources: { url: string; title: string; domain: string; snippet: string; provider: string; relevanceScore: number }[]
  insertedCount: number
  duplicateCount: number
  errors: string[]
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export async function runDiscovery(
  admin: SupabaseClient,
  input: DiscoveryInput,
  log: (msg: string) => void,
): Promise<DiscoveryResult> {
  const errors: string[] = []
  let insertedCount = 0
  let duplicateCount = 0
  const allSources: DiscoveryResult['sources'] = []
  const seen = new Set<string>()

  log(`[discovery] Démarrage pour veille "${input.watchName}" — ${input.companies.length} entreprise(s)`)

  const year = new Date().getFullYear()
  const countryStr = input.countries.map(c => countryName(c)).slice(0, 3).join(', ')
  const sectorStr = input.sectors.slice(0, 2).join(', ')

  // Build queries for Firecrawl (runs in parallel with Sonar)
  const fcQueries: string[] = []
  for (const co of input.companies) {
    fcQueries.push(
      `"${co.name}" ${countryStr} ${year} contrat projet expansion`,
      `"${co.name}" recrutement appel offres ${countryStr} ${year}`,
    )
  }
  if (sectorStr) {
    fcQueries.push(`appel offres ${sectorStr} ${countryStr} ${year}`)
  }

  const [sonarResults, fcResults] = await Promise.allSettled([
    discoverSourcesForWatch({
      name: input.watchName,
      sectors: input.sectors,
      countries: input.countries,
      companies: input.companies,
      keywords: input.keywords,
    }),
    firecrawlBatchSearch(fcQueries, 5),
  ])

  // Merge Sonar results
  if (sonarResults.status === 'fulfilled') {
    for (const s of sonarResults.value) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      allSources.push({
        url: s.url,
        title: s.title,
        domain: s.domain,
        snippet: s.snippet,
        provider: s.provider,
        relevanceScore: s.relevanceScore,
      })
    }
    log(`[discovery] Sonar → ${sonarResults.value.length} URLs`)
  } else {
    errors.push(`Sonar error: ${sonarResults.reason}`)
    log(`[discovery] Sonar erreur: ${sonarResults.reason}`)
  }

  // Merge Firecrawl results
  if (fcResults.status === 'fulfilled') {
    for (const r of fcResults.value) {
      if (seen.has(r.url)) continue
      seen.add(r.url)
      allSources.push({
        url: r.url,
        title: r.title,
        domain: r.domain,
        snippet: r.snippet,
        provider: 'firecrawl',
        relevanceScore: 0.5,
      })
    }
    log(`[discovery] Firecrawl → ${fcResults.value.length} URLs`)
  } else {
    errors.push(`Firecrawl error: ${fcResults.reason}`)
  }

  log(`[discovery] Total unique: ${allSources.length} URLs`)

  // Store in discovered_sources
  for (const src of allSources) {
    try {
      const { error } = await admin.from('discovered_sources').upsert({
        account_id: input.accountId,
        watch_id: input.watchId,
        query: `${input.watchName} discovery`,
        source_type: 'web',
        provider: src.provider,
        title: src.title,
        url: src.url,
        domain: src.domain,
        snippet: src.snippet?.slice(0, 2000),
        relevance_score: src.relevanceScore,
        status: 'pending',
      }, { onConflict: 'watch_id,url' })

      if (error) {
        if (error.code === '23505') { duplicateCount++; continue }
        errors.push(`Insert ${src.url}: ${error.message}`)
      } else {
        insertedCount++
      }
    } catch (e: any) {
      errors.push(`Insert ${src.url}: ${e.message}`)
    }
  }

  log(`[discovery] Insérés: ${insertedCount} | Doublons: ${duplicateCount} | Erreurs: ${errors.length}`)

  return { sources: allSources, insertedCount, duplicateCount, errors }
}
