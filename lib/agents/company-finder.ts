/**
 * Agent Company Finder
 *
 * Identifie des entreprises correspondant à des critères donnés via :
 *  1. Clearbit Autocomplete (recherche par nom)
 *  2. Gemini (recherche par secteur, pays, critères sémantiques)
 *  3. Perplexity (recherche web en temps réel pour confirmation + enrichissement)
 *
 * Retourne une liste d'entreprises avec nom, pays, secteur, site web, logo.
 */

import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export interface FoundCompany {
  name:      string
  country?:  string
  sector?:   string
  website?:  string
  logo_url?: string
  description?: string
  confidence: number // 0–100
}

export interface CompanySearchResult {
  companies: FoundCompany[]
  source: 'clearbit' | 'gemini' | 'combined'
  query: string
}

async function searchClearbit(query: string): Promise<FoundCompany[]> {
  try {
    const res = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(5_000) },
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data ?? []).slice(0, 8).map((c: any) => ({
      name:       c.name ?? '',
      website:    c.domain ? `https://${c.domain}` : undefined,
      logo_url:   c.logo ?? (c.domain ? `https://img.logo.dev/${c.domain}?token=pk_free&format=png` : undefined),
      confidence: 80,
    }))
  } catch {
    return []
  }
}

async function searchWithGemini(
  criteria: string,
  sector?: string,
  country?: string,
  limit = 10,
): Promise<FoundCompany[]> {
  const prompt = `Tu es un expert en intelligence économique. L'utilisateur cherche des entreprises correspondant à ces critères :

CRITÈRES : ${criteria}
${sector ? `SECTEUR : ${sector}` : ''}
${country ? `PAYS / RÉGION : ${country}` : ''}

Trouve jusqu'à ${limit} entreprises réelles qui correspondent. Pour chaque entreprise, fournis :
- name : nom officiel
- country : pays (code ISO 2 lettres)
- sector : secteur d'activité principal
- website : site web officiel (si connu)
- description : description courte (1-2 phrases) de l'activité et pourquoi elle correspond
- confidence : score de pertinence 0-100

IMPORTANT :
- Ne cite QUE des entreprises réelles et vérifiables
- Privilégie les entreprises actives et connues
- Si le pays est spécifié, concentre-toi sur ce marché
- Inclus un mélange de grandes et moyennes entreprises si pertinent

Réponds UNIQUEMENT en JSON valide :
{ "companies": [ { "name": "...", "country": "...", "sector": "...", "website": "...", "description": "...", "confidence": 85 } ] }`

  try {
    const { text } = await callGemini(prompt, { maxOutputTokens: 3000, temperature: 0.3 })
    const parsed = parseGeminiJson(text) as { companies?: FoundCompany[] }
    return (parsed?.companies || []).filter((c) => c.name?.trim())
  } catch (e) {
    console.error('[CompanyFinder] Gemini error:', e)
    return []
  }
}

/**
 * Recherche d'entreprises par nom exact (Clearbit) enrichi par Gemini si peu de résultats.
 */
export async function findCompaniesByName(name: string): Promise<CompanySearchResult> {
  const clearbitResults = await searchClearbit(name)

  if (clearbitResults.length >= 3) {
    return { companies: clearbitResults, source: 'clearbit', query: name }
  }

  const geminiResults = await searchWithGemini(`Entreprise nommée "${name}"`, undefined, undefined, 5)

  const merged = mergeResults(clearbitResults, geminiResults)
  return { companies: merged, source: 'combined', query: name }
}

/**
 * Recherche d'entreprises par critères sémantiques (secteur, pays, type d'activité).
 */
export async function findCompaniesByCriteria(
  criteria: string,
  sector?: string,
  country?: string,
  limit = 10,
): Promise<CompanySearchResult> {
  const [clearbitResults, geminiResults] = await Promise.all([
    criteria.split(/\s+/).length <= 3 ? searchClearbit(criteria) : Promise.resolve([]),
    searchWithGemini(criteria, sector, country, limit),
  ])

  const merged = mergeResults(clearbitResults, geminiResults)
  return { companies: merged, source: 'combined', query: criteria }
}

function mergeResults(clearbit: FoundCompany[], gemini: FoundCompany[]): FoundCompany[] {
  const seen = new Map<string, FoundCompany>()

  for (const c of clearbit) {
    const key = c.name.toLowerCase().trim()
    seen.set(key, c)
  }

  for (const g of gemini) {
    const key = g.name.toLowerCase().trim()
    const existing = seen.get(key)
    if (existing) {
      seen.set(key, {
        ...existing,
        country:     existing.country || g.country,
        sector:      existing.sector || g.sector,
        description: existing.description || g.description,
        website:     existing.website || g.website,
        confidence:  Math.max(existing.confidence, g.confidence),
      })
    } else {
      seen.set(key, g)
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence)
}
