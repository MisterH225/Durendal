import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

const COUNTRY_NAMES: Record<string, string> = {
  CI: "Côte d'Ivoire", SN: 'Sénégal', GH: 'Ghana', NG: 'Nigeria',
  KE: 'Kenya', CM: 'Cameroun', MA: 'Maroc', ZA: 'Afrique du Sud',
  BJ: 'Bénin', BF: 'Burkina Faso', ML: 'Mali', TG: 'Togo',
}

// ─── Firecrawl Search : recherche web par requête ────────────────────────────
async function firecrawlSearch(query: string): Promise<{ title: string; url: string; content: string }[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return []

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit: 5 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || []).map((r: any) => ({
      title: r.title || r.url || '',
      url: r.url || '',
      content: r.markdown || r.description || r.content || '',
    })).filter((r: any) => r.content.length > 50)
  } catch { return [] }
}

// ─── Firecrawl Scrape : scraping d'une URL précise ───────────────────────────
async function firecrawlScrape(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return ''

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data.data?.markdown || ''
  } catch { return '' }
}

// ─── Proxycurl : profil entreprise LinkedIn ──────────────────────────────────
async function fetchLinkedInCompany(linkedinUrl: string) {
  const apiKey = process.env.PROXYCURL_API_KEY
  if (!apiKey) return null
  try {
    const params = new URLSearchParams({
      url: linkedinUrl, resolve_numeric_id: 'true',
      categories: 'include', funding_data: 'include',
      exit_data: 'include', acquisitions: 'include',
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

// ─── Proxycurl : posts récents LinkedIn ──────────────────────────────────────
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

// ─── Gemini Flash : extraction et scoring de signaux ────────────────────────
async function extractSignals(
  content: string,
  companyName: string,
  contextCountries: string[],
): Promise<{ title: string; content: string; relevance: number; type: string }[]> {
  if (!content.trim()) return []
  try {
    const prompt = `Tu es un analyste de veille concurrentielle pour les marchés africains (${contextCountries.map(c => COUNTRY_NAMES[c] || c).join(', ')}).

Extrais les 3 informations les plus pertinentes sur "${companyName}" dans ce contenu.
Concentre-toi sur : financement, nouveaux produits, partenariats, recrutements, expansion, résultats financiers, événements marquants.

Contenu :
${content.slice(0, 4000)}

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après :
{"signals":[{"title":"titre court et précis","content":"résumé de l'information en 2-3 phrases","relevance":0.8,"type":"funding|product|partnership|recruitment|expansion|news|financial"}]}

Si aucune information pertinente sur "${companyName}", réponds : {"signals":[]}`

    const { text } = await callGemini(prompt, { model: 'gemini-2.0-flash', maxOutputTokens: 800 })
    const parsed = parseGeminiJson<{ signals: any[] }>(text)
    return (parsed?.signals || []).filter((s: any) => s.relevance >= 0.4)
  } catch { return [] }
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────
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

    const companies = watch.watch_companies?.map((wc: any) => wc.companies).filter(Boolean) || []
    const watchCountries: string[] = watch.countries || []
    const watchSectors: string[] = watch.sectors || []

    // Crée le job
    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 1, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    let totalSignals = 0
    const stats = { search: 0, linkedin_profiles: 0, linkedin_posts: 0, sources: 0 }
    const hasProxycurl = !!process.env.PROXYCURL_API_KEY

    for (const company of companies) {
      const countryNames = watchCountries.map(c => COUNTRY_NAMES[c] || c).join(' ')
      const sectorStr = watchSectors.join(' ')

      // ── A. Recherche Firecrawl (source principale) ────────────────────────
      const queries = [
        `${company.name} ${countryNames} actualité 2025 2026`,
        `${company.name} ${sectorStr} Afrique financement partenariat`,
        `${company.name} site:${countryNames.toLowerCase().replace(/\s/g, '')} OR site:linkedin.com`,
      ]

      for (const query of queries) {
        const results = await firecrawlSearch(query)
        for (const result of results) {
          const signals = await extractSignals(
            `TITRE: ${result.title}\nURL: ${result.url}\n\n${result.content}`,
            company.name,
            watchCountries,
          )
          for (const signal of signals) {
            await supabase.from('signals').insert({
              watch_id: watchId,
              company_id: company.id,
              source_id: null,
              raw_content: signal.content,
              title: signal.title,
              url: result.url,
              relevance_score: signal.relevance,
              signal_type: signal.type || 'news',
              published_at: new Date().toISOString(),
            })
            totalSignals++
            stats.search++
          }
        }
        // Petite pause pour éviter le rate-limiting
        await new Promise(r => setTimeout(r, 300))
      }

      // ── B. Site officiel de l'entreprise si disponible ───────────────────
      if (company.website) {
        const siteContent = await firecrawlScrape(company.website)
        if (siteContent.length > 200) {
          const signals = await extractSignals(siteContent, company.name, watchCountries)
          for (const signal of signals) {
            await supabase.from('signals').insert({
              watch_id: watchId,
              company_id: company.id,
              source_id: null,
              raw_content: signal.content,
              title: signal.title,
              url: company.website,
              relevance_score: Math.max(signal.relevance, 0.7),
              signal_type: signal.type || 'news',
              published_at: new Date().toISOString(),
            })
            totalSignals++
          }
        }
      }

      // ── C. LinkedIn via Proxycurl (optionnel) ────────────────────────────
      if (company.linkedin_url && hasProxycurl) {
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
            await supabase.from('signals').insert({
              watch_id: watchId,
              company_id: company.id,
              source_id: null,
              raw_content: profileContent,
              title: `Profil LinkedIn — ${company.name}`,
              url: company.linkedin_url,
              relevance_score: 0.9,
              signal_type: 'profile',
              published_at: new Date().toISOString(),
            })
            totalSignals++
            stats.linkedin_profiles++
          }
        }

        const posts = await fetchLinkedInPosts(company.linkedin_url)
        for (const post of posts.slice(0, 3)) {
          const content = post.text || post.commentary || ''
          if (content.length < 30) continue
          await supabase.from('signals').insert({
            watch_id: watchId,
            company_id: company.id,
            source_id: null,
            raw_content: content,
            title: `Post LinkedIn — ${company.name}`,
            url: post.post_url || company.linkedin_url,
            relevance_score: 0.75,
            signal_type: 'social',
            published_at: post.posted_at ? new Date(post.posted_at).toISOString() : new Date().toISOString(),
          })
          totalSignals++
          stats.linkedin_posts++
        }
      }
    }

    // ── D. Sources de la bibliothèque (bonus si renseignée) ──────────────────
    const { data: sources } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .eq('type', 'web')

    const filteredSources = (sources || []).filter((s: any) =>
      s.countries?.some((c: string) => watchCountries.includes(c)) ||
      s.sectors?.some((sec: string) => watchSectors.includes(sec))
    )

    for (const source of filteredSources.slice(0, 5)) {
      try {
        const urlToScrape = source.rss_url || source.url
        if (!urlToScrape) continue
        const content = await firecrawlScrape(urlToScrape)
        if (!content || content.length < 100) continue

        const companyNames = companies.map((c: any) => c.name)
        for (const company of companies) {
          const signals = await extractSignals(content, company.name, watchCountries)
          for (const signal of signals) {
            await supabase.from('signals').insert({
              watch_id: watchId,
              company_id: company.id,
              source_id: source.id,
              raw_content: signal.content,
              title: signal.title,
              url: source.url,
              relevance_score: signal.relevance,
              signal_type: signal.type || 'news',
              published_at: new Date().toISOString(),
            })
            totalSignals++
            stats.sources++
          }
        }
      } catch (err) {
        console.error(`[Agent1] Erreur source ${source.name}:`, err)
      }
    }

    // Finalise le job
    await supabase.from('agent_jobs').update({
      status: 'done',
      completed_at: new Date().toISOString(),
    }).eq('id', job?.id)

    await supabase.from('watches').update({
      last_run_at: new Date().toISOString(),
    }).eq('id', watchId)

    if (watch.account_id) {
      await supabase.from('alerts').insert({
        account_id: watch.account_id,
        watch_id: watchId,
        type: 'signal',
        title: `Scan terminé — ${totalSignals} signaux collectés`,
        message: `Recherche web : ${stats.search} signaux. LinkedIn : ${stats.linkedin_profiles + stats.linkedin_posts} entrées. Sources : ${stats.sources}.`,
      })
    }

    return NextResponse.json({
      success: true,
      total_signals: totalSignals,
      breakdown: stats,
      linkedin_enabled: hasProxycurl,
    })
  } catch (error) {
    console.error('[Agent1] Erreur:', error)
    return NextResponse.json({ error: 'Erreur agent collecte' }, { status: 500 })
  }
}
