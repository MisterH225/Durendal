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
  if (!apiKey) {
    console.log('[Agent1] FIRECRAWL_API_KEY absent — firecrawl search ignoré')
    return []
  }
  try {
    console.log(`[Agent1] Firecrawl search: "${query}"`)
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: 5 }),
    })
    if (!res.ok) {
      console.error(`[Agent1] Firecrawl search HTTP ${res.status}:`, await res.text())
      return []
    }
    const data = await res.json()
    const results = (data.data || [])
      .map((r: any) => ({ title: r.title || '', url: r.url || '', content: r.markdown || r.description || r.content || '' }))
      .filter((r: any) => r.content.length > 50)
    console.log(`[Agent1] Firecrawl search → ${results.length} résultats`)
    return results
  } catch (e) {
    console.error('[Agent1] Firecrawl search exception:', e)
    return []
  }
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
    const params = new URLSearchParams({
      url: linkedinUrl, resolve_numeric_id: 'true', categories: 'include',
      funding_data: 'include', exit_data: 'include', acquisitions: 'include',
      extra: 'include', use_cache: 'if-present',
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
Concentre-toi sur : financement, nouveaux produits, partenariats, expansion, résultats financiers.

Contenu :
${content.slice(0, 5000)}

Réponds UNIQUEMENT en JSON valide (pas de texte avant/après) :
{"signals":[{"title":"titre factuel court","content":"résumé 2-3 phrases avec chiffres si disponibles","relevance":0.8,"type":"funding|product|partnership|recruitment|expansion|news|financial"}]}

Si rien de pertinent sur "${companyName}", réponds exactement : {"signals":[]}`

    const { text } = await callGemini(prompt, { model: 'gemini-2.0-flash', maxOutputTokens: 1000 })
    const parsed = parseGeminiJson<{ signals: any[] }>(text)
    return (parsed?.signals || [])
      .filter((s: any) => s.relevance >= 0.35)
      .map((s: any) => ({ ...s, url: sourceUrl }))
  } catch (e) {
    console.error('[Agent1] extractSignals exception:', e)
    return []
  }
}

// ─── Gemini Grounding : 2 passes séparées ────────────────────────────────────
// PROBLÈME PRÉCÉDENT : demander du JSON + grounding en même temps causait
// que Gemini retournait du texte naturel avec citations [1][2], cassant parseGeminiJson.
//
// SOLUTION 2 passes :
//   Pass 1 → texte naturel + sources (grounding fonctionne mieux ainsi)
//   Pass 2 → extraction JSON depuis le texte (sans outil = JSON fiable)
async function researchWithGrounding(
  companyName: string,
  countries: string[],
  sectors: string[],
): Promise<{ signals: { title: string; content: string; relevance: number; type: string; url: string; source_name: string }[] }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.log('[Agent1] GEMINI_API_KEY absent — grounding ignoré')
    return { signals: [] }
  }

  const countryNames = countries.map(c => COUNTRY_NAMES[c] || c).join(', ')
  const sectorStr    = sectors.join(', ')
  const year         = new Date().getFullYear()

  try {
    // ── PASS 1 : Recherche en langage naturel avec Google Search ─────────
    const researchQuery = `Actualités récentes ${year - 1}-${year} sur l'entreprise "${companyName}" en Afrique (${countryNames}). Secteurs couverts : ${sectorStr}. Recherche : levées de fonds, nouveaux produits ou services, partenariats stratégiques, expansion géographique, résultats financiers, recrutements clés.`

    console.log(`[Agent1] Grounding PASS 1: "${companyName}"`)
    const { text: researchText, sources } = await callGeminiWithSearch(researchQuery, {
      model: 'gemini-2.0-flash',
      maxOutputTokens: 2000,
    })

    console.log(`[Agent1] Grounding résultat: ${researchText.length} chars, ${sources.length} sources`)

    if (!researchText || researchText.trim().length < 80) {
      console.log(`[Agent1] Grounding vide pour "${companyName}"`)
      return { signals: [] }
    }

    // ── PASS 2 : Extraction JSON depuis le texte de recherche ────────────
    const extractPrompt = `Tu es un analyste de veille concurrentielle. Extrais les informations factuelles récentes depuis ce texte de recherche sur "${companyName}".

TEXTE DE RECHERCHE :
${researchText.slice(0, 4000)}

Réponds UNIQUEMENT en JSON valide :
{"signals":[{"title":"titre factuel court (max 80 chars)","content":"résumé 2-3 phrases avec chiffres clés","relevance":0.85,"type":"funding|product|partnership|recruitment|expansion|news|financial"}]}

Règles :
- Inclure UNIQUEMENT des faits présents dans le texte ci-dessus
- Minimum relevance 0.4 pour être inclus
- Si rien de concret, réponds exactement : {"signals":[]}`

    const { text: extractText } = await callGemini(extractPrompt, {
      model: 'gemini-2.0-flash',
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

    console.log(`[Agent1] DÉMARRAGE — ${companies.length} entreprises | pays: ${watchCountries.join(', ')} | secteurs: ${watchSectors.join(', ')}`)
    console.log(`[Agent1] APIs disponibles: GEMINI=${!!process.env.GEMINI_API_KEY} | FIRECRAWL=${!!process.env.FIRECRAWL_API_KEY} | PROXYCURL=${!!process.env.PROXYCURL_API_KEY}`)

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 1, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    let totalSignals = 0
    let totalGroundingSources = 0
    let sumRelevance = 0
    const stats = {
      grounding: 0, firecrawl_search: 0, website: 0,
      linkedin_profiles: 0, linkedin_posts: 0,
      sources_lib: 0, duplicates_skipped: 0,
    }

    // Helper : insère un signal avec déduplication
    const insertSignal = async (payload: {
      company_id: string
      title: string
      content: string
      url: string
      source_name: string
      relevance: number
      type: string
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
        console.error('[Agent1] INSERT signal error:', error.message, '| Colonnes manquantes ?')
        return false
      }
      totalSignals++
      sumRelevance += payload.relevance
      return true
    }

    for (const company of companies) {
      const countryNames = watchCountries.map(c => COUNTRY_NAMES[c] || c).join(', ')
      const year = new Date().getFullYear()

      console.log(`\n[Agent1] ══ Traitement: "${company.name}" ══`)

      // ── A. Google Grounding (2 passes) ────────────────────────────────────
      const { signals: groundedSignals } = await researchWithGrounding(
        company.name, watchCountries, watchSectors
      )
      for (const s of groundedSignals) {
        const ok = await insertSignal({
          company_id:  company.id,
          title:       s.title,
          content:     s.content,
          url:         s.url,
          source_name: s.source_name,
          relevance:   s.relevance,
          type:        s.type,
        })
        if (ok) { stats.grounding++; totalGroundingSources++ }
      }
      console.log(`[Agent1] A. Grounding: ${stats.grounding} signaux insérés`)

      // ── B. Firecrawl Search (toujours actif, sources différentes) ─────────
      const queries = [
        `"${company.name}" ${countryNames} ${year} actualités`,
        `"${company.name}" Afrique financement partenariat ${year}`,
        `"${company.name}" ${watchSectors.slice(0, 2).join(' OR ')} expansion`,
      ]

      for (const query of queries) {
        const results = await firecrawlSearch(query)
        for (const result of results) {
          if (!result.content) continue
          let hostname = ''
          try { hostname = new URL(result.url).hostname } catch { hostname = result.url }

          const signals = await extractSignalsFromContent(
            `${result.title}\n\n${result.content}`,
            company.name,
            watchCountries,
            result.url,
          )
          for (const s of signals) {
            const ok = await insertSignal({
              company_id:  company.id,
              title:       s.title || result.title,
              content:     s.content,
              url:         s.url || result.url,
              source_name: hostname,
              relevance:   s.relevance,
              type:        s.type,
            })
            if (ok) stats.firecrawl_search++
          }
        }
        await new Promise(r => setTimeout(r, 400))
      }
      console.log(`[Agent1] B. Firecrawl search: ${stats.firecrawl_search} signaux`)

      // ── C. Site officiel (Firecrawl Scrape) ──────────────────────────────
      if (company.website) {
        console.log(`[Agent1] C. Scraping site officiel: ${company.website}`)
        const siteContent = await firecrawlScrape(company.website)
        if (siteContent.length > 200) {
          const signals = await extractSignalsFromContent(siteContent, company.name, watchCountries, company.website)
          for (const s of signals) {
            const ok = await insertSignal({
              company_id:  company.id,
              title:       s.title,
              content:     s.content,
              url:         company.website,
              source_name: `Site officiel ${company.name}`,
              relevance:   Math.max(s.relevance, 0.6),
              type:        s.type,
            })
            if (ok) stats.website++
          }
        }
      }

      // ── D. LinkedIn via Proxycurl ─────────────────────────────────────────
      if (company.linkedin_url && process.env.PROXYCURL_API_KEY) {
        const profile = await fetchLinkedInCompany(company.linkedin_url)
        if (profile) {
          const profileContent = [
            profile.description,
            profile.specialities?.join(', '),
            profile.company_size_on_linkedin ? `Effectif : ${profile.company_size_on_linkedin}` : '',
            profile.follower_count ? `Abonnés LinkedIn : ${profile.follower_count}` : '',
            profile.latest_funding_round?.funding_type
              ? `Financement : ${profile.latest_funding_round.funding_type} — ${profile.latest_funding_round.money_raised} ${profile.latest_funding_round.currency}`
              : '',
          ].filter(Boolean).join('\n')
          if (profileContent) {
            const ok = await insertSignal({
              company_id:  company.id,
              title:       `Profil LinkedIn — ${company.name}`,
              content:     profileContent,
              url:         company.linkedin_url,
              source_name: 'LinkedIn (Proxycurl)',
              relevance:   0.9,
              type:        'profile',
            })
            if (ok) stats.linkedin_profiles++
          }
        }
        const posts = await fetchLinkedInPosts(company.linkedin_url)
        for (const post of posts.slice(0, 3)) {
          const content = post.text || post.commentary || ''
          if (content.length < 30) continue
          const ok = await insertSignal({
            company_id:  company.id,
            title:       `Post LinkedIn — ${company.name}`,
            content,
            url:         post.post_url || company.linkedin_url,
            source_name: 'LinkedIn',
            relevance:   0.75,
            type:        'social',
          })
          if (ok) stats.linkedin_posts++
        }
      }

      await new Promise(r => setTimeout(r, 300))
    }

    // ── E. Sources de la bibliothèque ─────────────────────────────────────
    const { data: libSources } = await supabase
      .from('sources').select('*').eq('is_active', true).eq('type', 'web')

    const relevantSources = (libSources || []).filter((s: any) =>
      s.countries?.some((c: string) => watchCountries.includes(c)) ||
      s.sectors?.some((sec: string) => watchSectors.includes(sec))
    )

    console.log(`\n[Agent1] E. Bibliothèque: ${relevantSources.length} sources pertinentes`)

    for (const source of relevantSources.slice(0, 5)) {
      try {
        const urlToFetch = source.rss_url || source.url
        if (!urlToFetch) continue
        const content = await firecrawlScrape(urlToFetch)
        if (!content || content.length < 100) continue
        for (const company of companies) {
          const signals = await extractSignalsFromContent(content, company.name, watchCountries, source.url)
          for (const s of signals) {
            const ok = await insertSignal({
              company_id:  company.id,
              title:       s.title,
              content:     s.content,
              url:         `${source.url}#${company.id}`,
              source_name: source.name,
              relevance:   s.relevance,
              type:        s.type,
            })
            if (ok) stats.sources_lib++
          }
        }
      } catch (err) {
        console.error(`[Agent1] Erreur source lib "${source.name}":`, err)
      }
    }

    // ── Finalisation ─────────────────────────────────────────────────────────
    console.log(`\n[Agent1] ══ RÉSUMÉ FINAL ══`)
    console.log(`  Total signaux  : ${totalSignals}`)
    console.log(`  Grounding      : ${stats.grounding}`)
    console.log(`  Firecrawl srch : ${stats.firecrawl_search}`)
    console.log(`  Site officiel  : ${stats.website}`)
    console.log(`  LinkedIn       : ${stats.linkedin_profiles + stats.linkedin_posts}`)
    console.log(`  Bibliothèque   : ${stats.sources_lib}`)
    console.log(`  Doublons igno. : ${stats.duplicates_skipped}`)

    await supabase.from('agent_jobs').update({
      status:        'done',
      completed_at:  new Date().toISOString(),
      signals_count: totalSignals,
      metadata: {
        breakdown:         stats,
        grounding_sources: totalGroundingSources,
        avg_relevance:     totalSignals > 0 ? Math.round((sumRelevance / totalSignals) * 100) / 100 : 0,
      },
    }).eq('id', job?.id)

    await supabase.from('watches').update({ last_run_at: new Date().toISOString() }).eq('id', watchId)

    if (watch.account_id) {
      await supabase.from('alerts').insert({
        account_id: watch.account_id,
        watch_id:   watchId,
        type:       'signal',
        title:      `Scan terminé — ${totalSignals} signaux collectés`,
        message:    `Grounding: ${stats.grounding} | Firecrawl: ${stats.firecrawl_search} | Site: ${stats.website} | LinkedIn: ${stats.linkedin_profiles + stats.linkedin_posts} | Bibliothèque: ${stats.sources_lib}`,
      })
    }

    return NextResponse.json({ success: true, total_signals: totalSignals, breakdown: stats })

  } catch (error) {
    console.error('[Agent1] ERREUR FATALE:', error)
    return NextResponse.json({ error: 'Erreur agent collecte' }, { status: 500 })
  }
}
