/**
 * Service Perplexity Sonar — interface isolée pour discovery.
 * Abstraction propre : mock facile, retry, logs, gestion quota.
 */

import {
  perplexityResponses,
  perplexitySearch,
  type PerplexityFilters,
  type PerplexityCitation,
  type PerplexitySearchResult,
} from '@/lib/ai/perplexity'

export interface DiscoveredUrl {
  title: string
  url: string
  domain: string
  snippet: string
  provider: 'sonar' | 'sonar_search'
  relevanceScore: number
  fullContent?: string
  citations?: PerplexityCitation[]
}

export interface SonarSearchOptions {
  recency?: 'hour' | 'day' | 'week' | 'month' | 'year'
  languages?: string[]
  country?: string
  domains?: string[]
  maxResults?: number
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      if (i === retries) throw e
      const isRateLimit = e?.message?.includes('429')
      const wait = isRateLimit ? delayMs * (i + 2) : delayMs * (i + 1)
      console.warn(`[sonar] Retry ${i + 1}/${retries} après ${wait}ms: ${e?.message}`)
      await new Promise(r => setTimeout(r, wait))
    }
  }
  throw new Error('Unreachable')
}

export async function searchWithSonar(
  query: string,
  options: SonarSearchOptions = {},
): Promise<DiscoveredUrl[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    console.warn('[sonar] PERPLEXITY_API_KEY absent — mode mock')
    return []
  }

  const filters: PerplexityFilters = {
    recency: options.recency ?? 'month',
    languages: options.languages ?? ['fr', 'en'],
    country: options.country,
    domains: options.domains,
  }

  const results: DiscoveredUrl[] = []
  const seen = new Set<string>()

  const [sonarResult, searchResult] = await Promise.allSettled([
    withRetry(() => perplexityResponses(query, filters)),
    withRetry(() => perplexitySearch(query, {
      maxResults: options.maxResults ?? 5,
      filters,
    })),
  ])

  if (sonarResult.status === 'fulfilled') {
    const { text, citations } = sonarResult.value
    if (text && text.length > 100) {
      for (const cit of citations) {
        if (!cit.url || seen.has(cit.url)) continue
        seen.add(cit.url)
        results.push({
          title: cit.title || query.slice(0, 80),
          url: cit.url,
          domain: extractDomain(cit.url),
          snippet: text.slice(0, 300),
          provider: 'sonar',
          relevanceScore: 0.7,
          fullContent: results.length === 0 ? text : undefined,
          citations: results.length === 0 ? citations : undefined,
        })
      }
    }
  }

  if (searchResult.status === 'fulfilled') {
    for (const r of searchResult.value) {
      if (!r.url || seen.has(r.url)) continue
      seen.add(r.url)
      results.push({
        title: r.title,
        url: r.url,
        domain: extractDomain(r.url),
        snippet: r.snippet,
        provider: 'sonar_search',
        relevanceScore: 0.5,
      })
    }
  }

  console.log(`[sonar] "${query.slice(0, 60)}…" → ${results.length} URLs`)
  return results.slice(0, (options.maxResults ?? 5) + 3)
}

export async function discoverSourcesForWatch(watch: {
  name: string
  sectors: string[]
  countries: string[]
  companies: { name: string; website?: string | null }[]
  keywords?: string[]
}): Promise<DiscoveredUrl[]> {
  const allUrls: DiscoveredUrl[] = []
  const seen = new Set<string>()
  const year = new Date().getFullYear()

  const countryStr = watch.countries.slice(0, 3).join(', ')
  const sectorStr = watch.sectors.slice(0, 2).join(', ')

  const queries: string[] = []

  for (const co of watch.companies) {
    queries.push(
      `Actualités récentes ${co.name} ${countryStr} ${year} contrats projets expansion`,
      `${co.name} appel offres recrutement partenariat ${countryStr} ${year}`,
    )
  }

  if (watch.sectors.length > 0) {
    queries.push(
      `Opportunités commerciales secteur ${sectorStr} ${countryStr} ${year}`,
      `Appels d'offres ${sectorStr} ${countryStr} ${year}`,
    )
  }

  if (watch.keywords?.length) {
    queries.push(`${watch.keywords.join(' ')} ${countryStr} ${year}`)
  }

  for (const query of queries) {
    try {
      const urls = await searchWithSonar(query, {
        recency: 'month',
        country: watch.countries[0],
        maxResults: 5,
      })
      for (const u of urls) {
        if (seen.has(u.url)) continue
        seen.add(u.url)
        allUrls.push(u)
      }
    } catch (e: any) {
      console.warn(`[sonar:discover] Erreur query: ${e?.message}`)
    }
    await new Promise(r => setTimeout(r, 300))
  }

  return allUrls
}

export async function enrichContextForAccount(account: {
  name: string
  sector?: string | null
  country?: string | null
}): Promise<DiscoveredUrl[]> {
  const year = new Date().getFullYear()
  const query = `${account.name} ${account.sector ?? ''} ${account.country ?? ''} actualités contrats expansion ${year}`
  return searchWithSonar(query, { recency: 'month', maxResults: 5 })
}
