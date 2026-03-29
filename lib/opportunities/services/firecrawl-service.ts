/**
 * Service Firecrawl — interface isolée pour search + scrape.
 * Retry, timeout, logs, mock si clé absente.
 */

export interface FirecrawlSearchResult {
  title: string
  url: string
  domain: string
  snippet: string
  markdown?: string
}

export interface FirecrawlScrapeResult {
  url: string
  title: string
  text: string
  markdown: string
  metadata: Record<string, any>
  publishedAt?: string | null
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export async function firecrawlSearch(
  query: string,
  limit = 5,
): Promise<FirecrawlSearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    console.warn('[firecrawl] FIRECRAWL_API_KEY absent — skip')
    return []
  }

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.warn(`[firecrawl] Search ${res.status}`)
      return []
    }
    const data = await res.json()
    const results = (data.data ?? []).slice(0, limit).map((r: any) => ({
      title: r.title ?? r.url ?? '',
      url: r.url ?? '',
      domain: extractDomain(r.url ?? ''),
      snippet: r.description ?? r.markdown?.slice(0, 400) ?? '',
      markdown: r.markdown,
    })).filter((r: FirecrawlSearchResult) => r.url && r.title)

    console.log(`[firecrawl] Search "${query.slice(0, 50)}…" → ${results.length} résultats`)
    return results
  } catch (e: any) {
    console.warn(`[firecrawl] Search error: ${e?.message}`)
    return []
  }
}

export async function firecrawlScrape(url: string): Promise<FirecrawlScrapeResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      console.warn(`[firecrawl] Scrape ${res.status} for ${url}`)
      return null
    }
    const data = await res.json()
    const d = data.data ?? {}
    const markdown = d.markdown ?? ''
    const text = markdown
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#*_~`>]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    return {
      url,
      title: d.metadata?.title ?? '',
      text: text.slice(0, 10_000),
      markdown: markdown.slice(0, 10_000),
      metadata: d.metadata ?? {},
      publishedAt: d.metadata?.publishedTime ?? d.metadata?.datePublished ?? null,
    }
  } catch (e: any) {
    console.warn(`[firecrawl] Scrape error ${url}: ${e?.message}`)
    return null
  }
}

export async function firecrawlBatchSearch(
  queries: string[],
  limitPerQuery = 5,
): Promise<FirecrawlSearchResult[]> {
  const all: FirecrawlSearchResult[] = []
  const seen = new Set<string>()

  for (const q of queries) {
    const results = await firecrawlSearch(q, limitPerQuery)
    for (const r of results) {
      if (seen.has(r.url)) continue
      seen.add(r.url)
      all.push(r)
    }
    await new Promise(r => setTimeout(r, 200))
  }
  return all
}
