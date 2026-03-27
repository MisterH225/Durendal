import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'

// ─── Mapping codes ISO → noms complets ───────────────────────────────────────
const COUNTRY_NAMES: Record<string, string> = {
  CI: "Côte d'Ivoire", SN: 'Sénégal', GH: 'Ghana', NG: 'Nigeria',
  KE: 'Kenya', CM: 'Cameroun', MA: 'Maroc', ZA: 'Afrique du Sud',
  BJ: 'Bénin', BF: 'Burkina Faso', ML: 'Mali', TG: 'Togo',
}

type WebResult = { title: string; url: string; snippet: string }

// ─── 1. DuckDuckGo Lite (gratuit, sans API key) ───────────────────────────────
// Inspiré de l'architecture VeilleCI — remplace Firecrawl comme source primaire
async function webSearch(query: string, maxResults = 5): Promise<WebResult[]> {
  try {
    console.log(`[Agent1] DDG search: "${query}"`)
    const params = new URLSearchParams({ q: query, kl: 'fr-fr' })
    const res = await fetch(`https://lite.duckduckgo.com/lite/?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.log(`[Agent1] DDG HTTP ${res.status}`)
      return []
    }
    const html = await res.text()

    const results: WebResult[] = []
    // DDG Lite structure : chaque résultat = <a class="result-link" href="URL">Title</a>
    // suivi d'un <td class="result-snippet">snippet</td>
    const rowRegex = /<tr[\s\S]*?<\/tr>/gi
    const rows = html.match(rowRegex) || []

    for (const row of rows) {
      if (results.length >= maxResults) break
      // Détecte un lien externe (pas duckduckgo.com)
      const linkMatch = row.match(/href="(https?:\/\/(?!.*duckduckgo)[^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      if (!linkMatch) continue
      const url   = linkMatch[1].split('&rut=')[0] // retire le tracking UTM
      const title = linkMatch[2].replace(/<[^>]+>/g, '').trim()
      if (!url || !title || url.includes('duckduckgo.com')) continue
      const snippetMatch = row.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i)
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        : ''
      results.push({ url, title, snippet })
    }

    // Note: si DDG Lite change de format, le résultat sera vide (acceptable)

    console.log(`[Agent1] DDG → ${results.length} résultats pour "${query.slice(0, 50)}"`)
    return results
  } catch (e) {
    console.error('[Agent1] webSearch DDG error:', e)
    return []
  }
}

// ─── 2. Extraction texte HTML d'une page ─────────────────────────────────────
async function fetchPageContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketLens/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return ''
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return ''
    const html = await res.text()
    // Supprime scripts, styles, navigation
    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<head[\s\S]*?<\/head>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return clean.slice(0, 8000) // max 8 KB pour le LLM
  } catch { return '' }
}

// ─── 3. Construction des requêtes par profil (comme VeilleCI) ─────────────────
function buildSearchQueries(
  companyName: string,
  websiteHost: string,
  sectors: string[],
  countryNames: string[],
  year: number,
): Record<string, string[]> {
  const primary = countryNames[0] || 'Afrique'
  const sector  = sectors.slice(0, 2).join(' ')

  return {
    // Scanner : site officiel de l'entreprise + news directes
    web_scanner: [
      websiteHost ? `site:${websiteHost} actualités ${year}` : `"${companyName}" actualités ${year}`,
      `"${companyName}" ${primary} contrat partenariat ${year}`,
      `"${companyName}" financement levée fonds expansion ${year}`,
    ],

    // Presse : médias africains + presse internationale
    press_monitor: [
      `"${companyName}" ${primary} ${year} -site:duckduckgo.com`,
      `${sector} Afrique actualités marché ${year}`,
      `site:reuters.com OR site:bloomberglinea.com OR site:theafricareport.com "${companyName}" OR "${sector}" ${year}`,
      `${sector} ${primary} contrat appel offres ${year}`,
    ],

    // Analyste : intelligence stratégique + forecasts marché
    analyst: [
      `${sector} marché tendances analyse ${primary} ${year} rapport`,
      `"${companyName}" stratégie acquisitions résultats ${year}`,
      `${sector} industry market forecast Africa ${year}`,
    ],

    // Recherche profonde : multi-angle, competitive intelligence
    deep_research: [
      `"${companyName}" concurrents ${sector} ${primary}`,
      `${sector} ${primary} opportunités investissement projets ${year}`,
      `"${companyName}" recrutement croissance ${year}`,
    ],
  }
}

// ─── Firecrawl Search (fallback si clé disponible) ────────────────────────────
async function firecrawlSearch(query: string): Promise<{ title: string; url: string; content: string }[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: 4 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || [])
      .map((r: any) => ({ title: r.title || '', url: r.url || '', content: r.markdown || r.description || '' }))
      .filter((r: any) => r.content.length > 50)
  } catch { return [] }
}

// ─── Firecrawl Scrape (fallback enrichissement) ───────────────────────────────
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
    const params = new URLSearchParams({
      url: linkedinUrl, resolve_numeric_id: 'true',
      funding_data: 'include', extra: 'include', use_cache: 'if-present',
    })
    const res = await fetch(
      `https://nubela.co/proxycurl/api/linkedin/company?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function fetchLinkedInPosts(linkedinUrl: string) {
  const apiKey = process.env.PROXYCURL_API_KEY
  if (!apiKey) return []
  try {
    const params = new URLSearchParams({ linkedin_url: linkedinUrl, post_count: '5' })
    const res = await fetch(
      `https://nubela.co/proxycurl/api/linkedin/company/posts?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.posts || []
  } catch { return [] }
}

// ─── Extraction de signaux via Gemini Flash ───────────────────────────────────
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
Concentre-toi sur : financement, nouveaux produits, partenariats, expansion, résultats financiers, appels d'offres, contrats.

Contenu :
${content.slice(0, 5000)}

Réponds UNIQUEMENT en JSON valide (pas de texte avant/après) :
{"signals":[{"title":"titre factuel court","content":"résumé 2-3 phrases avec chiffres si disponibles","relevance":0.8,"type":"funding|product|partnership|recruitment|expansion|contract|news|financial"}]}

Si rien de pertinent sur "${companyName}", réponds exactement : {"signals":[]}`

    const { text } = await callGemini(prompt, { model: 'gemini-2.5-flash', maxOutputTokens: 1000 })
    const parsed = parseGeminiJson<{ signals: any[] }>(text)
    return (parsed?.signals || [])
      .filter((s: any) => s.relevance >= 0.35)
      .map((s: any) => ({ ...s, url: sourceUrl }))
  } catch (e) {
    console.error('[Agent1] extractSignals exception:', e)
    return []
  }
}

// ─── Gemini Grounding : recherche avec Google Search activé ──────────────────
async function researchWithGrounding(
  companyName: string,
  countries: string[],
  sectors: string[],
): Promise<{ signals: { title: string; content: string; relevance: number; type: string; url: string; source_name: string }[] }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { signals: [] }

  const countryNames = countries.map(c => COUNTRY_NAMES[c] || c).join(', ')
  const sectorStr    = sectors.join(', ')
  const year         = new Date().getFullYear()

  try {
    // PASS 1 : Recherche en langage naturel avec Google Search grounding
    const researchQuery = `Actualités récentes ${year - 1}-${year} sur l'entreprise "${companyName}" en Afrique (${countryNames}). Secteurs couverts : ${sectorStr}. Recherche : levées de fonds, nouveaux produits, partenariats stratégiques, expansion géographique, résultats financiers, appels d'offres.`

    console.log(`[Agent1] Grounding PASS 1: "${companyName}"`)
    const { text: researchText, sources } = await callGeminiWithSearch(researchQuery, {
      model: 'gemini-2.5-flash',
      maxOutputTokens: 2000,
    })
    console.log(`[Agent1] Grounding → ${researchText.length} chars, ${sources.length} sources`)

    if (!researchText || researchText.trim().length < 80) return { signals: [] }

    // PASS 2 : Extraction JSON depuis le texte de recherche
    const extractPrompt = `Tu es un analyste de veille concurrentielle. Extrais les informations factuelles récentes depuis ce texte de recherche sur "${companyName}".

TEXTE DE RECHERCHE :
${researchText.slice(0, 4000)}

Réponds UNIQUEMENT en JSON valide :
{"signals":[{"title":"titre factuel court (max 80 chars)","content":"résumé 2-3 phrases avec chiffres clés","relevance":0.85,"type":"funding|product|partnership|recruitment|expansion|contract|news|financial"}]}

Règles :
- Inclure UNIQUEMENT des faits présents dans le texte ci-dessus
- Minimum relevance 0.4 pour être inclus
- Si rien de concret, réponds exactement : {"signals":[]}`

    const { text: extractText } = await callGemini(extractPrompt, {
      model: 'gemini-2.5-flash',
      maxOutputTokens: 1200,
    })
    const parsed = parseGeminiJson<{ signals: any[] }>(extractText)
    const rawSignals = (parsed?.signals || []).filter((s: any) => s.relevance >= 0.35)

    console.log(`[Agent1] Grounding PASS 2: ${rawSignals.length} signaux extraits`)

    return {
      signals: rawSignals.map((s: any, i: number) => ({
        title:       s.title,
        content:     s.content,
        relevance:   s.relevance,
        type:        s.type || 'news',
        url:         sources[i % Math.max(sources.length, 1)]?.url ?? '',
        source_name: sources[i % Math.max(sources.length, 1)]?.title ?? 'Google (Gemini)',
      })),
    }
  } catch (e) {
    console.error(`[Agent1] Grounding exception pour "${companyName}":`, e)
    return { signals: [] }
  }
}

// ─── Déduplication par URL ────────────────────────────────────────────────────
async function urlAlreadyExists(supabase: any, watchId: string, url: string): Promise<boolean> {
  if (!url) return false
  const { count } = await supabase
    .from('signals').select('id', { count: 'exact', head: true })
    .eq('watch_id', watchId).eq('url', url)
  return (count || 0) > 0
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { watchId } = await req.json()
    if (!watchId) return NextResponse.json({ error: 'watchId requis' }, { status: 400 })

    const { data: watch } = await supabase
      .from('watches')
      .select('*, watch_companies(companies(id, name, website, linkedin_url, country))')
      .eq('id', watchId)
      .single()

    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    const companies: any[]        = watch.watch_companies?.map((wc: any) => wc.companies).filter(Boolean) || []
    const watchCountries: string[] = watch.countries || []
    const watchSectors: string[]   = watch.sectors || []

    console.log(`[Agent1] ══ DÉMARRAGE ══`)
    console.log(`  Entreprises: ${companies.map((c: any) => c.name).join(', ')}`)
    console.log(`  Pays: ${watchCountries.join(', ')} | Secteurs: ${watchSectors.join(', ')}`)
    console.log(`  APIs: GEMINI=${!!process.env.GEMINI_API_KEY} | FIRECRAWL=${!!process.env.FIRECRAWL_API_KEY} | PROXYCURL=${!!process.env.PROXYCURL_API_KEY}`)
    console.log(`  DuckDuckGo: actif (gratuit, sans clé)`)

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 1, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    let totalSignals = 0
    let sumRelevance = 0
    const stats = {
      ddg_search: 0, grounding: 0, firecrawl: 0,
      website: 0, linkedin: 0, sources_lib: 0, duplicates_skipped: 0,
    }

    // Helper : insère un signal avec déduplication
    const insertSignal = async (payload: {
      company_id: string; title: string; content: string
      url: string; source_name: string; relevance: number; type: string
    }): Promise<boolean> => {
      if (payload.url && await urlAlreadyExists(supabase, watchId, payload.url)) {
        stats.duplicates_skipped++
        return false
      }
      const { error } = await supabase.from('signals').insert({
        watch_id:        watchId,
        company_id:      payload.company_id,
        source_id:       null,
        raw_content:     payload.content,
        title:           payload.title,
        url:             payload.url || null,
        source_name:     payload.source_name || null,
        relevance_score: payload.relevance,
        signal_type:     payload.type || 'news',
        published_at:    new Date().toISOString(),
      })
      if (error) {
        console.error('[Agent1] INSERT error:', error.message)
        return false
      }
      totalSignals++
      sumRelevance += payload.relevance
      return true
    }

    const year = new Date().getFullYear()
    const countryNames = watchCountries.map(c => COUNTRY_NAMES[c] || c)

    // ════════════════════════════════════════════════════════════════════════
    //  PIPELINE PAR ENTREPRISE
    // ════════════════════════════════════════════════════════════════════════
    for (const company of companies) {
      console.log(`\n[Agent1] ══ ${company.name} ══`)

      let websiteHost = ''
      try { if (company.website) websiteHost = new URL(company.website).hostname } catch {}

      // Construit les 4 profils de requêtes (comme VeilleCI)
      const queries = buildSearchQueries(company.name, websiteHost, watchSectors, countryNames, year)

      // ── A. DuckDuckGo — 4 profils en séquentiel (15 requêtes max) ──────
      const allProfiles = Object.entries(queries)
      for (const [profile, profileQueries] of allProfiles) {
        for (const query of profileQueries) {
          const webResults = await webSearch(query, 4)
          for (const result of webResults) {
            // Extrait le texte de la page (comme VeilleCI fetchPageContent)
            let pageContent = await fetchPageContent(result.url)
            if (pageContent.length < 100) {
              // Fallback : utilise le snippet DuckDuckGo
              pageContent = `${result.title}\n\n${result.snippet}`
            }
            if (pageContent.length < 30) continue

            const signals = await extractSignalsFromContent(
              pageContent, company.name, watchCountries, result.url
            )
            for (const s of signals) {
              let hostname = result.url
              try { hostname = new URL(result.url).hostname } catch {}
              const ok = await insertSignal({
                company_id:  company.id,
                title:       s.title || result.title,
                content:     s.content,
                url:         result.url,
                source_name: hostname,
                relevance:   s.relevance,
                type:        s.type,
              })
              if (ok) stats.ddg_search++
            }
          }
          // Délai anti-spam
          await new Promise(r => setTimeout(r, 300))
        }
      }
      console.log(`[Agent1] A. DDG search: ${stats.ddg_search} signaux`)

      // ── B. Google Grounding (Gemini — sources vérifiables) ───────────────
      const { signals: groundedSignals } = await researchWithGrounding(
        company.name, watchCountries, watchSectors
      )
      for (const s of groundedSignals) {
        const ok = await insertSignal({
          company_id:  company.id,
          title:       s.title, content: s.content,
          url:         s.url,   source_name: s.source_name,
          relevance:   s.relevance, type: s.type,
        })
        if (ok) stats.grounding++
      }
      console.log(`[Agent1] B. Grounding: ${stats.grounding} signaux`)

      // ── C. Firecrawl Search (si clé disponible) ──────────────────────────
      if (process.env.FIRECRAWL_API_KEY) {
        const fcQueries = [
          `"${company.name}" ${countryNames[0]} ${year} actualités`,
          `"${company.name}" Afrique partenariat contrat ${year}`,
        ]
        for (const q of fcQueries) {
          const results = await firecrawlSearch(q)
          for (const r of results) {
            let hostname = r.url
            try { hostname = new URL(r.url).hostname } catch {}
            const signals = await extractSignalsFromContent(
              `${r.title}\n\n${r.content}`, company.name, watchCountries, r.url
            )
            for (const s of signals) {
              const ok = await insertSignal({
                company_id: company.id, title: s.title || r.title,
                content: s.content, url: r.url, source_name: hostname,
                relevance: s.relevance, type: s.type,
              })
              if (ok) stats.firecrawl++
            }
          }
        }
        console.log(`[Agent1] C. Firecrawl: ${stats.firecrawl} signaux`)
      }

      // ── D. Site officiel (Firecrawl Scrape si dispo, sinon fetchPageContent) ──
      if (company.website) {
        console.log(`[Agent1] D. Site officiel: ${company.website}`)
        const siteContent = process.env.FIRECRAWL_API_KEY
          ? await firecrawlScrape(company.website)
          : await fetchPageContent(company.website)
        if (siteContent.length > 200) {
          const signals = await extractSignalsFromContent(siteContent, company.name, watchCountries, company.website)
          for (const s of signals) {
            const ok = await insertSignal({
              company_id: company.id, title: s.title, content: s.content,
              url: company.website, source_name: `Site officiel ${company.name}`,
              relevance: Math.max(s.relevance, 0.6), type: s.type,
            })
            if (ok) stats.website++
          }
        }
        console.log(`[Agent1] D. Site officiel: ${stats.website} signaux`)
      }

      // ── E. LinkedIn via Proxycurl ─────────────────────────────────────────
      if (company.linkedin_url && process.env.PROXYCURL_API_KEY) {
        const profile = await fetchLinkedInCompany(company.linkedin_url)
        if (profile) {
          const profileContent = [
            profile.description,
            profile.specialities?.join(', '),
            profile.company_size_on_linkedin ? `Effectif : ${profile.company_size_on_linkedin}` : '',
            profile.follower_count ? `Abonnés : ${profile.follower_count}` : '',
            profile.latest_funding_round?.funding_type
              ? `Financement : ${profile.latest_funding_round.funding_type} — ${profile.latest_funding_round.money_raised} ${profile.latest_funding_round.currency}`
              : '',
          ].filter(Boolean).join('\n')
          if (profileContent) {
            const ok = await insertSignal({
              company_id: company.id, title: `Profil LinkedIn — ${company.name}`,
              content: profileContent, url: company.linkedin_url,
              source_name: 'LinkedIn (Proxycurl)', relevance: 0.9, type: 'profile',
            })
            if (ok) stats.linkedin++
          }
        }
        const posts = await fetchLinkedInPosts(company.linkedin_url)
        for (const post of posts.slice(0, 3)) {
          const content = post.text || post.commentary || ''
          if (content.length < 30) continue
          const ok = await insertSignal({
            company_id: company.id, title: `Post LinkedIn — ${company.name}`,
            content, url: post.post_url || company.linkedin_url,
            source_name: 'LinkedIn', relevance: 0.75, type: 'social',
          })
          if (ok) stats.linkedin++
        }
      }

      await new Promise(r => setTimeout(r, 300))
    }

    // ── F. Sources de la bibliothèque ─────────────────────────────────────
    const { data: libSources } = await supabase
      .from('sources').select('*').eq('is_active', true).eq('type', 'web')

    const relevantSources = (libSources || []).filter((s: any) =>
      s.countries?.some((c: string) => watchCountries.includes(c)) ||
      s.sectors?.some((sec: string) => watchSectors.includes(sec))
    )
    console.log(`\n[Agent1] F. Bibliothèque: ${relevantSources.length} sources pertinentes`)

    for (const source of relevantSources.slice(0, 5)) {
      const urlToFetch = source.rss_url || source.url
      if (!urlToFetch) continue
      try {
        const content = process.env.FIRECRAWL_API_KEY
          ? await firecrawlScrape(urlToFetch)
          : await fetchPageContent(urlToFetch)
        if (!content || content.length < 100) continue
        for (const company of companies) {
          const signals = await extractSignalsFromContent(content, company.name, watchCountries, source.url)
          for (const s of signals) {
            const ok = await insertSignal({
              company_id: company.id, title: s.title, content: s.content,
              url: `${source.url}#${company.id}`, source_name: source.name,
              relevance: s.relevance, type: s.type,
            })
            if (ok) stats.sources_lib++
          }
        }
      } catch (err) { console.error(`[Agent1] Erreur source lib "${source.name}":`, err) }
    }

    // ── Finalisation ─────────────────────────────────────────────────────
    console.log(`\n[Agent1] ══ RÉSUMÉ FINAL ══`)
    console.log(`  Total signaux  : ${totalSignals}`)
    console.log(`  DDG search     : ${stats.ddg_search}`)
    console.log(`  Grounding      : ${stats.grounding}`)
    console.log(`  Firecrawl      : ${stats.firecrawl}`)
    console.log(`  Site officiel  : ${stats.website}`)
    console.log(`  LinkedIn       : ${stats.linkedin}`)
    console.log(`  Bibliothèque   : ${stats.sources_lib}`)
    console.log(`  Doublons igno. : ${stats.duplicates_skipped}`)

    await supabase.from('agent_jobs').update({
      status:        'done',
      completed_at:  new Date().toISOString(),
      signals_count: totalSignals,
      metadata: {
        breakdown:    stats,
        avg_relevance: totalSignals > 0 ? Math.round((sumRelevance / totalSignals) * 100) / 100 : 0,
      },
    }).eq('id', job?.id)

    await supabase.from('watches').update({ last_run_at: new Date().toISOString() }).eq('id', watchId)

    if (watch.account_id) {
      await supabase.from('alerts').insert({
        account_id: watch.account_id,
        watch_id:   watchId,
        type:       'signal',
        title:      `Scan terminé — ${totalSignals} signaux collectés`,
        message:    `DDG: ${stats.ddg_search} | Grounding: ${stats.grounding} | Firecrawl: ${stats.firecrawl} | Site: ${stats.website} | LinkedIn: ${stats.linkedin} | Bibliothèque: ${stats.sources_lib}`,
      })
    }

    // ★ Auto-déclenche Agent 2 (synthèse) si des signaux ont été trouvés
    // (fire-and-forget — fonctionne sur VPS Node.js / pm2)
    if (totalSignals > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      console.log(`[Agent1] Auto-déclenchement Agent 2 (${totalSignals} signaux)`)
      fetch(`${baseUrl}/api/agents/synthesize`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie':        req.headers.get('Cookie') || '',
        },
        body: JSON.stringify({ watchId }),
      }).catch(err => console.error('[Agent1] Auto-synthesize error:', err))
    }

    return NextResponse.json({ success: true, total_signals: totalSignals, breakdown: stats })

  } catch (error) {
    console.error('[Agent1] ERREUR FATALE:', error)
    return NextResponse.json({ error: 'Erreur agent collecte' }, { status: 500 })
  }
}
