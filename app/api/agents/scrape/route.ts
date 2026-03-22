import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Proxycurl : récupère les infos d'une page entreprise LinkedIn ───────────
async function fetchLinkedInCompany(linkedinUrl: string) {
  const apiKey = process.env.PROXYCURL_API_KEY
  if (!apiKey) return null

  try {
    const params = new URLSearchParams({
      url: linkedinUrl,
      resolve_numeric_id: 'true',
      categories: 'include',
      funding_data: 'include',
      exit_data: 'include',
      acquisitions: 'include',
      extra: 'include',
      use_cache: 'if-present',
    })
    const res = await fetch(
      `https://nubela.co/proxycurl/api/linkedin/company?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// ─── Proxycurl : récupère les posts récents d'une entreprise ─────────────────
async function fetchLinkedInPosts(linkedinUrl: string) {
  const apiKey = process.env.PROXYCURL_API_KEY
  if (!apiKey) return []

  try {
    const params = new URLSearchParams({
      linkedin_url: linkedinUrl,
      post_count: '5',
    })
    const res = await fetch(
      `https://nubela.co/proxycurl/api/linkedin/company/posts?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.posts || []
  } catch { return [] }
}

// ─── Proxycurl : offres d'emploi récentes (signal d'expansion) ──────────────
async function fetchLinkedInJobs(companyName: string, country: string) {
  const apiKey = process.env.PROXYCURL_API_KEY
  if (!apiKey) return []

  try {
    const countryCodeMap: Record<string, string> = {
      CI: 'CI', SN: 'SN', GH: 'GH', NG: 'NG', KE: 'KE',
    }
    const params = new URLSearchParams({
      keyword: companyName,
      geo_id: countryCodeMap[country] || 'CI',
      count: '5',
    })
    const res = await fetch(
      `https://nubela.co/proxycurl/api/v2/linkedin/company/job?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.job || []
  } catch { return [] }
}

// ─── Firecrawl : scraping web & presse ──────────────────────────────────────
async function scrapeWebSource(url: string): Promise<string> {
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

// ─── Claude Haiku : tri et scoring de pertinence ────────────────────────────
async function scoreRelevance(
  content: string,
  companies: string[]
): Promise<{ title: string; content: string; company: string; relevance: number; type: string }[]> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Extrais les 3 informations les plus pertinentes sur ces entreprises : ${companies.join(', ')}.

Contenu :
${content.slice(0, 3000)}

Réponds UNIQUEMENT en JSON valide :
{"signals":[{"title":"...","content":"...","company":"...","relevance":0.8,"type":"news"}]}`,
        }],
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    const text = data.content[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return []
    const parsed = JSON.parse(match[0])
    return parsed.signals || []
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

    const companies = watch.watch_companies?.map((wc: any) => wc.companies) || []
    const companyNames = companies.map((c: any) => c.name)

    // Sources web filtrées par pays/secteur
    const { data: sources } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .eq('type', 'web')

    const filteredSources = (sources || []).filter((s: any) =>
      s.countries?.some((c: string) => watch.countries?.includes(c)) ||
      s.sectors?.some((sec: string) => watch.sectors?.includes(sec))
    )

    // Crée le job
    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({
        watch_id: watchId,
        agent_number: 1,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select().single()

    let totalSignals = 0
    const stats = { linkedin_profiles: 0, linkedin_posts: 0, linkedin_jobs: 0, web: 0 }

    // ── 1. LinkedIn via Proxycurl ─────────────────────────────────────────────
    const hasProxycurl = !!process.env.PROXYCURL_API_KEY

    for (const company of companies) {
      // 1a. Profil entreprise (infos générales, headcount, funding)
      if (company.linkedin_url && hasProxycurl) {
        const profile = await fetchLinkedInCompany(company.linkedin_url)
        if (profile) {
          const profileContent = [
            profile.description,
            profile.specialities?.join(', '),
            profile.company_size_on_linkedin ? `Effectif LinkedIn : ${profile.company_size_on_linkedin}` : '',
            profile.follower_count ? `Abonnés LinkedIn : ${profile.follower_count}` : '',
            profile.hq ? `Siège : ${profile.hq.city}, ${profile.hq.country}` : '',
            profile.latest_funding_round?.funding_type
              ? `Dernier financement : ${profile.latest_funding_round.funding_type} — ${profile.latest_funding_round.money_raised} ${profile.latest_funding_round.currency}`
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
      }

      // 1b. Posts récents de l'entreprise
      if (company.linkedin_url && hasProxycurl) {
        const posts = await fetchLinkedInPosts(company.linkedin_url)
        for (const post of posts.slice(0, 3)) {
          const content = post.text || post.commentary || ''
          if (content.length < 30) continue

          await supabase.from('signals').insert({
            watch_id: watchId,
            company_id: company.id,
            source_id: null,
            raw_content: content,
            title: `Post LinkedIn — ${company.name} (${new Date(post.posted_at || Date.now()).toLocaleDateString('fr-FR')})`,
            url: post.post_url || company.linkedin_url,
            relevance_score: 0.75,
            signal_type: 'social',
            published_at: post.posted_at ? new Date(post.posted_at).toISOString() : new Date().toISOString(),
          })
          totalSignals++
          stats.linkedin_posts++
        }
      }

      // 1c. Offres d'emploi (signal fort d'expansion ou de nouveaux produits)
      if (hasProxycurl) {
        const jobs = await fetchLinkedInJobs(company.name, company.country || 'CI')
        if (jobs.length > 0) {
          const jobTitles = jobs.map((j: any) => j.job_title || j.title).filter(Boolean)
          if (jobTitles.length > 0) {
            await supabase.from('signals').insert({
              watch_id: watchId,
              company_id: company.id,
              source_id: null,
              raw_content: `${company.name} recrute actuellement : ${jobTitles.join(', ')}. Signal potentiel d'expansion ou de lancement de nouveaux produits/services.`,
              title: `Recrutements LinkedIn — ${company.name} (${jobs.length} offres)`,
              url: company.linkedin_url || '',
              relevance_score: 0.85,
              signal_type: 'recruitment',
              published_at: new Date().toISOString(),
            })
            totalSignals++
            stats.linkedin_jobs++
          }
        }
      }
    }

    // ── 2. Web & presse via Firecrawl ─────────────────────────────────────────
    for (const source of filteredSources.slice(0, 8)) {
      try {
        const urlToScrape = source.rss_url || source.url
        if (!urlToScrape) continue

        const content = await scrapeWebSource(urlToScrape)
        if (!content || content.length < 100) continue

        const signals = await scoreRelevance(content, companyNames)

        for (const signal of signals) {
          const matchingCompany = companies.find((c: any) =>
            c.name.toLowerCase().includes((signal.company || '').toLowerCase()) ||
            (signal.company || '').toLowerCase().includes(c.name.toLowerCase())
          )

          await supabase.from('signals').insert({
            watch_id: watchId,
            company_id: matchingCompany?.id || null,
            source_id: source.id,
            raw_content: signal.content,
            title: signal.title,
            url: source.url,
            relevance_score: signal.relevance || 0.5,
            signal_type: signal.type || 'news',
            published_at: new Date().toISOString(),
          })
          totalSignals++
          stats.web++
        }
      } catch (err) {
        console.error(`Erreur scraping ${source.name}:`, err)
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

    await supabase.from('alerts').insert({
      account_id: watch.account_id,
      watch_id: watchId,
      type: 'signal',
      title: `Scan terminé — ${totalSignals} signaux collectés`,
      message: `LinkedIn : ${stats.linkedin_profiles} profils, ${stats.linkedin_posts} posts, ${stats.linkedin_jobs} recrutements. Web/presse : ${stats.web} articles.`,
    })

    return NextResponse.json({
      success: true,
      total_signals: totalSignals,
      breakdown: stats,
      linkedin_enabled: hasProxycurl,
    })
  } catch (error) {
    console.error('Agent 1 error:', error)
    return NextResponse.json({ error: 'Erreur agent collecte' }, { status: 500 })
  }
}
