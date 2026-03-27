import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'

// ─── Mapping codes ISO → noms complets ───────────────────────────────────────
const COUNTRY_NAMES: Record<string, string> = {
  CI: "Côte d'Ivoire", SN: 'Sénégal', GH: 'Ghana', NG: 'Nigeria',
  KE: 'Kenya', CM: 'Cameroun', MA: 'Maroc', ZA: 'Afrique du Sud',
  BJ: 'Bénin', BF: 'Burkina Faso', ML: 'Mali', TG: 'Togo',
}

// ─── Firecrawl Search : web search avec résultats structurés ─────────────────
async function firecrawlSearch(query: string): Promise<{ title: string; url: string; content: string }[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) { console.log('[Agent1] FIRECRAWL_API_KEY absent — search ignoré'); return [] }
  try {
    console.log(`[Agent1] Firecrawl search: "${query}"`)
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: 5, lang: 'fr' }),
    })
    if (!res.ok) { console.error(`[Agent1] Firecrawl search error ${res.status}: ${await res.text()}`); return [] }
    const data = await res.json()
    const results = (data.data || [])
      .map((r: any) => ({ title: r.title || '', url: r.url || '', content: r.markdown || r.description || '' }))
      .filter((r: any) => r.content.length > 50)
    console.log(`[Agent1] Firecrawl search → ${results.length} résultats`)
    return results
  } catch (e) { console.error('[Agent1] Firecrawl search exception:', e); return [] }
}

// ─── Firecrawl Scrape : contenu complet d'une URL ────────────────────────────
async function firecrawlScrape(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return ''
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data.data?.markdown || ''
  } catch { return '' }
}

// ─── Proxycurl : profil + posts LinkedIn ─────────────────────────────────────
async function fetchLinkedInCompany(linkedinUrl: string) {
  const apiKey = process.env.PROXYCURL_API_KEY
  if (!apiKey) return null
  try {
    const params = new URLSearchParams({ url: linkedinUrl, resolve_numeric_id: 'true', categories: 'include', funding_data: 'include', exit_data: 'include', acquisitions: 'include', extra: 'include', use_cache: 'if-present' })
    const res = await fetch(`https://nubela.co/proxycurl/api/linkedin/company?${params}`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function fetchLinkedInPosts(linkedinUrl: string) {
  const apiKey = process.env.PROXYCURL_API_KEY
  if (!apiKey) return []
  try {
    const params = new URLSearchParams({ linkedin_url: linkedinUrl, post_count: '5' })
    const res = await fetch(`https://nubela.co/proxycurl/api/linkedin/company/posts?${params}`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!res.ok) return []
    const data = await res.json()
    return data.posts || []
  } catch { return [] }
}

// ─── Extraction JSON depuis un contenu brut ───────────────────────────────────
async function extractSignalsFromContent(
  content: string,
  companyName: string,
  contextCountries: string[],
  sourceUrl = '',
): Promise<{ title: string; content: string; relevance: number; type: string; url: string }[]> {
  if (!content.trim() || content.length < 50) return []
  try {
    const countryList = contextCountries.map(c => COUNTRY_NAMES[c] || c).join(', ')
    const prompt = `Tu es un analyste de veille concurrentielle pour les marchés africains (${countryList}).

Extrais les informations pertinentes sur "${companyName}" dans ce contenu.
Concentre-toi uniquement sur des faits réels : financement, produits, partenariats, expansion, résultats financiers.

Contenu :
${content.slice(0, 5000)}

Réponds UNIQUEMENT en JSON valide (pas de texte avant/après) :
{"signals":[{"title":"titre factuel court","content":"résumé 2-3 phrases avec chiffres si disponibles","relevance":0.8,"type":"funding|product|partnership|recruitment|expansion|news|financial"}]}

Si rien de pertinent sur "${companyName}", réponds exactement : {"signals":[]}`

    const { text } = await callGemini(prompt, { model: 'gemini-1.5-flash', maxOutputTokens: 1000 })
    const parsed = parseGeminiJson<{ signals: any[] }>(text)
    return (parsed?.signals || [])
      .filter((s: any) => s.relevance >= 0.35)
      .map((s: any) => ({ ...s, url: sourceUrl }))
  } catch (e) {
    console.error(`[Agent1] extractSignals error:`, e)
    return []
  }
}

// ─── Recherche Gemini Grounding : 2 passes séparées ──────────────────────────
// PASS 1 : Gemini recherche en langage naturel (grounding fonctionne mieux ainsi)
// PASS 2 : Gemini extrait les signaux structurés depuis le texte de recherche
async function researchWithGrounding(
  companyName: string,
  countries: string[],
  sectors: string[],
): Promise<{ signals: { title: string; content: string; relevance: number; type: string; url: string; source_name: string }[] }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) { console.log('[Agent1] GEMINI_API_KEY absent — grounding ignoré'); return { signals: [] } }

  const countryNames = countries.map(c => COUNTRY_NAMES[c] || c).join(', ')
  const sectorStr    = sectors.join(', ')
  const year         = new Date().getFullYear()

  try {
    // ── PASS 1 : Recherche Google en langage naturel ─────────────────────
    const researchQuery = `Actualités récentes ${year - 1}-${year} sur l'entreprise "${companyName}" en Afrique (${countryNames}). Secteurs : ${sectorStr}. Inclure : levées de fonds, nouveaux produits, partenariats, expansion, résultats financiers, recrutements importants.`

    console.log(`[Agent1] Grounding pass 1 pour: ${companyName}`)
    const { text: researchText, sources } = await callGeminiWithSearch(researchQuery, {
      model: 'gemini-1.5-flash',
      maxOutputTokens: 2000,
    })

    console.log(`[Agent1] Grounding → ${researchText.length} chars, ${sources.length} sources`)

    if (!researchText || researchText.trim().length < 80) {
      console.log(`[Agent1] Grounding sans résultat pour ${companyName}`)
      return { signals: [] }
    }

    // ── PASS 2 : Extraction JSON depuis le texte de recherche ────────────
    const extractPrompt = `Tu es un analyste de veille concurrentielle. Extrais les informations factuelles et récentes depuis ce texte de recherche sur "${companyName}".

TEXTE DE RECHERCHE :
${researchText.slice(0, 4000)}

Réponds UNIQUEMENT en JSON valide :
{"signals":[{"title":"titre factuel court (max 80 chars)","content":"résumé 2-3 phrases avec chiffres clés","relevance":0.85,"type":"funding|product|partnership|recruitment|expansion|news|financial"}]}

Règles :
- Inclure UNIQUEMENT des faits vérifiables présents dans le texte
- Exclure les informations génériques ou non datées récemment
- Minimum relevance 0.5 pour être inclus
- Si rien de concret, réponds : {"signals":[]}`

    const { text: extractText } = await callGemini(extractPrompt, { model: 'gemini-1.5-flash', maxOutputTokens: 1200 })
    const parsed = parseGeminiJson<{ signals: any[] }>(extractText)
    const rawSignals = (parsed?.signals || []).filter((s: any) => s.relevance >= 0.35)

    console.log(`[Agent1] Grounding pass 2 → ${rawSignals.length} signaux extraits`)

    // Associe les sources aux signaux par round-robin
    return {
      signals: rawSignals.map((s: any, i: number) => ({
        title:       s.title,
        content:     s.content,
        relevance:   s.relevance,
        type:        s.type || 'news',
        url:         sources[i