import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, callGeminiWithSearch, parseGeminiJson, type GroundingSource } from '@/lib/ai/gemini'

// ─── Mapping codes ISO → noms complets ───────────────────────────────────────
const COUNTRY_NAMES: Record<string, string> = {
  CI: "Côte d'Ivoire", SN: 'Sénégal', GH: 'Ghana', NG: 'Nigeria',
  KE: 'Kenya', CM: 'Cameroun', MA: 'Maroc', ZA: 'Afrique du Sud',
  BJ: 'Bénin', BF: 'Burkina Faso', ML: 'Mali', TG: 'Togo',
}

// ─── Firecrawl Scrape : récupère le contenu complet d'une URL ─────────────────
// Utilisé uniquement pour le site officiel de l'entreprise (données structurées)
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

// ─── Extraction de signaux depuis un contenu déjà collecté ───────────────────
// Utilisé uniquement pour Proxycurl / site officiel (pas de grounding nécessaire)
async function extractSignalsFromContent(
  content: string,
  companyName: string,
  contextCountries: string[],
): Promise<{ title: string; content: string; relevance: number; type: string }[]> {
  if (!content.trim()) return []
  try {
    const countryList = contextCountries.map(c => COUNTRY_NAMES[c] || c).join(', ')
    const prompt = `Tu es un analyste de veille concurrentielle pour les marchés africains (${countryList}).

Extrais les informations les plus pertinentes sur "${companyName}" dans ce contenu.
Concentre-toi sur : financement, nouveaux produits, partenariats, recrutements, expansion, résultats financiers.

Contenu :
${content.slice(0, 4000)}

Réponds UNIQUEMENT en JSON valide :
{"signals":[{"title":"titre court et précis","content":"résumé factuel en 2-3 phrases","relevance":0.8,"type":"funding|product|partnership|recruitment|expansion|news|financial"}]}

Si aucune information pertinente sur "${companyName}", réponds : {"signals":[]}`

    const { text } = await callGemini(prompt, { model: 'gemini-2.0-flash', maxOutputTokens: 800 })
    const parsed = parseGeminiJson<{ signals: any[] }>(text)
    return (parsed?.signals || []).filter((s: any) => s.relevance >= 0.4)
  } catch { return [] }
}

// ─── Recherche web avec Google Search Grounding ───────────────────────────────
// Approche Perplexity : Gemini fait une vraie recherche Google en temps réel.
// Retourne des signaux structurés ET les URLs sources (vérifiables).
async function researchCompanyWithGrounding(
  companyName: string,
  countries: string[],
  sectors: string[],
): Promise<{ signals: { title: string; content: string; relevance: number; type: string; source_url: string; source_title: string }[] }> {
  const countryNames = countries.map(c => COUNTRY_NAMES[c] || c).join(', ')
  const sectorStr    = sectors.join(', ')
  const thisYear     = new Date().getFullYear()

  const prompt = `Tu es un analyste de veille concurrentielle spécialisé sur les marchés africains (${countryNames}).

Recherche les dernières actualités sur l'entreprise "${companyName}" dans les secteurs : ${sectorStr}.
Période cible : ${thisYear - 1}-${thisYear} uniquement (informations récentes).

Cherche spécifiquement :
- Levées de fonds ou investissements
- Nouveaux produits ou services lancés
- Partenariats stratégiques signés
- Expansions géographiques annoncées
- Recrutements ou changements d'équipe dirigeante
- Résultats financiers publiés
- Événements marquants (acquisitions, certifications, prix)

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après :
{
  "signals": [
    {
      "title": "Titre court et factuel (max 80 caractères)",
      "content": "Résumé de l'information en 2-4 phrases, avec les chiffres clés si disponibles",
      "relevance": 0.9,
      "type": "funding|product|partnership|recruitment|expansion|news|financial",
      "date_approx": "YYYY-MM ou YYYY si connue, sinon null"
    }
  ]
}

Si aucune actualité récente et vérifiable sur "${companyName}", réponds : {"signals":[]}`

  try {
    const { text, sources, tokensUsed } = await callGeminiWithSearch(prompt, {
      model: 'gemini-2.0-flash',
      maxOutputTokens: 2000,
    })
    console.log(`[Agent1] Grounding ${companyName}: ${sources.length} sources, ${tokensUsed} tokens`)

    const parsed = parseGeminiJson<{ signals: any[] }>(text)
    const rawSignals = parsed?.signals || []

    // Associe les sources disponibles aux signaux (round-robin si plus de signaux que de sources)
    return {
      signals: rawSignals
        .filter((s: any) => s.relevance >= 0.4)
        .map((s: any, i: number) => ({
          title:        s.title,
          content:      s.content,
          relevance:    s.relevance,
          type:         s.type || 'news',
          source_url:   sources[i % Math.max(sources.length, 1)]?.url || '',
          source_title: sources[i % Math.max(sources.length, 1)]?.title || '',
        })),
    }
  } catch (e) {
    console.error(`[Agent1] Grounding error pour ${companyName}:`, e)
    return { signals: [] }
  }
}

// ─── Déduplication : vérifie si un signal avec cette URL existe déjà ─────────
async function signalUrlExists(supabase: any, watchId: string, url: string): Promise<boolean> {
  if (!url) return false
  const { count } = await supabase
    .from('signals')
    .select('id', { count: 'exact', head: true })
    .eq('watch_id', watchId)
    .eq('url', url)
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

    const companies: any[]     = watch.watch_companies?.map((wc: any) => wc.companies).filter(Boolean) || []
    const watchCountries: string[] = watch.countries || []
    const watchSectors: string[]   = watch.sectors || []

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 1, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    let totalSignals = 0
    let totalGroundingSources = 0
    let sumRelevance = 0
    const stats = { grounding: 0, website: 0, linkedin_profiles: 0, linkedin_posts: 0, sources_lib: 0, duplicates_skipped: 0 }

    for (const company of companies) {

      // ── A. Google Search Grounding (source principale, avec citations) ──────
      // 1 seul appel API remplace les 15 appels précédents — résultats vérifiables
      const { signals: groundedSignals } = await researchCompanyWithGrounding(
        company.name, watchCountries, watchSectors
      )

      for (const signal of groundedSignals) {
        // Déduplication : on évite d'insérer 2x la même source
        if (signal.source_url && await signalUrlExists(supabase, watchId, signal.source_url)) {
          stats.duplicates_skipped++
          continue
        }
        await supabase.from('signals').insert({
          watch_id:        watchId,
          company_id:      company.id,
          source_id:       null,
          raw_content:     signal.content,
          title:           signal.title,
          url:             signal.source_url || null,
          source_name:     signal.source_title || null,
          relevance_score: signal.relevance,
          signal_type:     signal.type,
          published_at:    new Date().toISOString(),
        })
        totalSignals++
        stats.grounding++
        sumRelevance += signal.relevance
      }
      totalGroundingSources += groundedSignals.length

      // Pause pour respecter les quotas Gemini
      await new Promise(r => setTimeout(r, 500))

      // ── B. Site officiel via Firecrawl (données produit, équipe, etc.) ──────
      if (company.website) {
        const siteContent = await firecrawlScrape(company.website)
        if (siteContent.length > 200) {
          const websiteSignals = await extractSignalsFromContent(siteContent, company.name, watchCountries)
          for (const signal of websiteSignals) {
            if (await signalUrlExists(supabase, watchId, company.website)) {
              stats.duplicates_skipped++
              continue
            }
            await supabase.from('signals').insert({
              watch_id:        watchId,
              company_id:      company.id,
              source_id:       null,
              raw_content:     signal.content,
              title:           signal.title,
              url:             company.website,
              source_name:     `Site officiel ${company.name}`,
              relevance_score: Math.max(signal.relevance, 0.7),
              signal_type:     signal.type || 'news',
              published_at:    new Date().toISOString(),
            })
            totalSignals++
            stats.website++
          }
        }
      }

      // ── C. LinkedIn via Proxycurl (optionnel, si clé configurée) ──────────
      if (company.linkedin_url && process.env.PROXYCURL_API_KEY) {
        const profile = await fetchLinkedInCompany(company.linkedin_url)
        if (profile) {
          const profileContent = [
            profile.description,
            profile.specialities?.join(', '),
            profile.company_size_on_linkedin ? `Effectif : ${profile.company_size_on_linkedin}` : '',
            profile.follower_count           ? `Abonnés LinkedIn : ${profile.follower_count}`    : '',
            profile.latest_funding_round?.funding_type
              ? `Financement : ${profile.latest_funding_round.funding_type} — ${profile.latest_funding_round.money_raised} ${profile.latest_funding_round.currency}`
              : '',
          ].filter(Boolean).join('\n')

          if (profileContent && !await signalUrlExists(supabase, watchId, company.linkedin_url)) {
            await supabase.from('signals').insert({
              watch_id:        watchId,
              company_id:      company.id,
              source_id:       null,
              raw_content:     profileContent,
              title:           `Profil LinkedIn — ${company.name}`,
              url:             company.linkedin_url,
              source_name:     'LinkedIn (Proxycurl)',
              relevance_score: 0.9,
              signal_type:     'profile',
              published_at:    new Date().toISOString(),
            })
            totalSignals++
            stats.linkedin_profiles++
          }
        }

        const posts = await fetchLinkedInPosts(company.linkedin_url)
        for (const post of posts.slice(0, 3)) {
          const content = post.text || post.commentary || ''
          if (content.length < 30) continue
          const postUrl = post.post_url || company.linkedin_url
          if (await signalUrlExists(supabase, watchId, postUrl)) { stats.duplicates_skipped++; continue }
          await supabase.from('signals').insert({
            watch_id:        watchId,
            company_id:      company.id,
            source_id:       null,
            raw_content:     content,
            title:           `Post LinkedIn — ${company.name}`,
            url:             postUrl,
            source_name:     'LinkedIn',
            relevance_score: 0.75,
            signal_type:     'social',
            published_at:    post.posted_at ? new Date(post.posted_at).toISOString() : new Date().toISOString(),
          })
          totalSignals++
          stats.linkedin_posts++
        }
      }
    }

    // ── D. Sources de la bibliothèque (bonus si configurée) ──────────────────
    const { data: libSources } = await supabase
      .from('sources')
      .select('*')
      .eq('is_active', true)
      .eq('type', 'web')

    const relevantSources = (libSources || []).filter((s: any) =>
      s.countries?.some((c: string) => watchCountries.includes(c)) ||
      s.sectors?.some((sec: string) => watchSectors.includes(sec))
    )

    for (const source of relevantSources.slice(0, 3)) {
      try {
        const urlToFetch = source.rss_url || source.url
        if (!urlToFetch) continue
        const content = await firecrawlScrape(urlToFetch)
        if (!content || content.length < 100) continue

        for (const company of companies) {
          const signals = await extractSignalsFromContent(content, company.name, watchCountries)
          for (const signal of signals) {
            const sigUrl = `${source.url}#${company.id}`
            if (await signalUrlExists(supabase, watchId, sigUrl)) { stats.duplicates_skipped++; continue }
            await supabase.from('signals').insert({
              watch_id:        watchId,
              company_id:      company.id,
              source_id:       source.id,
              raw_content:     signal.content,
              title:           signal.title,
              url:             source.url,
              source_name:     source.name,
              relevance_score: signal.relevance,
              signal_type:     signal.type || 'news',
              published_at:    new Date().toISOString(),
            })
            totalSignals++
            stats.sources_lib++
          }
        }
      } catch (err) {
        console.error(`[Agent1] Erreur source lib ${source.name}:`, err)
      }
    }

    // ── Finalisation ────────────────────────────────────────────────────────
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

    await supabase.from('watches').update({
      last_run_at: new Date().toISOString(),
    }).eq('id', watchId)

    if (watch.account_id) {
      await supabase.from('alerts').insert({
        account_id: watch.account_id,
        watch_id:   watchId,
        type:       'signal',
        title:      `Scan terminé — ${totalSignals} signaux collectés`,
        message:    `Google Grounding : ${stats.grounding} | Site web : ${stats.website} | LinkedIn : ${stats.linkedin_profiles + stats.linkedin_posts} | Bibliothèque : ${stats.sources_lib} | Doublons ignorés : ${stats.duplicates_skipped}`,
      })
    }

    return NextResponse.json({
      success:          true,
      total_signals:    totalSignals,
      breakdown:        stats,
      linkedin_enabled: !!process.env.PROXYCURL_API_KEY,
    })
  } catch (error) {
    console.error('[Agent1] Erreur:', error)
    return NextResponse.json({ error: 'Erreur agent collecte' }, { status: 500 })
  }
}
