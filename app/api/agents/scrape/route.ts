// ★ Vercel : autorise jusqu'à 5 minutes (plan Pro requis)
export const maxDuration = 300

/**
 * POST /api/agents/scrape
 * Orchestrateur principal de collecte — architecture inspirée de VeilleCI.
 *
 * Pipeline :
 *  1. runAllAgentsParallel()   → 4 agents en parallèle (Perplexity + fetchPageContent)
 *  2. researchWithPerplexity() → Perplexity Responses API (qualité + citations)
 *  3. Firecrawl / LinkedIn     → enrichissement si clés disponibles
 *  4. generateWatchReport()    → rapport inline (PAS fire-and-forget)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { callGemini, callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'
import { runAllAgentsParallel, CollectedSignal } from '@/lib/agents/collector-engine'
import { generateWatchReport }       from '@/lib/agents/report-generator'

// ─── Mapping ISO → noms complets ─────────────────────────────────────────────
const COUNTRY_NAMES: Record<string, string> = {
  CI: "Côte d'Ivoire", SN: 'Sénégal',      GH: 'Ghana',      NG: 'Nigeria',
  KE: 'Kenya',         CM: 'Cameroun',      MA: 'Maroc',      ZA: 'Afrique du Sud',
  BJ: 'Bénin',         BF: 'Burkina Faso',  ML: 'Mali',       TG: 'Togo',
}

// ─── Firecrawl Search (enrichissement si clé disponible) ─────────────────────
async function firecrawlSearch(query: string): Promise<{ title: string; url: string; content: string }[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({ query, limit: 4 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data ?? [])
      .map((r: any) => ({ title: r.title ?? '', url: r.url ?? '', content: r.markdown ?? r.description ?? '' }))
      .filter((r: any) => r.content.length > 50)
  } catch { return [] }
}

async function firecrawlScrape(url: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return ''
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data.data?.markdown ?? ''
  } catch { return '' }
}

// ─── Proxycurl LinkedIn ───────────────────────────────────────────────────────
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
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    return res.ok ? await res.json() : null
  } catch { return null }
}

async function fetchLinkedInPosts(linkedinUrl: string) {
  const apiKey = process.env.PROXYCURL_API_KEY
  if (!apiKey) return []
  try {
    const params = new URLSearchParams({ linkedin_url: linkedinUrl, post_count: '5' })
    const res = await fetch(
      `https://nubela.co/proxycurl/api/linkedin/company/posts?${params}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.posts ?? []
  } catch { return [] }
}

// ─── Gemini Grounding (2 passes) ─────────────────────────────────────────────
async function researchWithGrounding(
  companyName: string,
  countries:   string[],
  sectors:     string[],
  log:         (msg: string) => void,
): Promise<{ title: string; content: string; relevance: number; type: string; url: string; source_name: string }[]> {
  if (!process.env.GEMINI_API_KEY) return []
  const countryNames = countries.map(c => COUNTRY_NAMES[c] || c).join(', ')
  const sectorStr    = sectors.join(', ')
  const year         = new Date().getFullYear()

  try {
    // Pass 1 : recherche en langage naturel + grounding Google Search
    const query = `Actualités récentes ${year - 1}-${year} sur "${companyName}" en Afrique (${countryNames}). Secteurs : ${sectorStr}. Levées de fonds, produits, partenariats, expansion, résultats.`
    log(`  [grounding] "${companyName}" — recherche Google...`)
    const { text, sources } = await callGeminiWithSearch(query, { model: 'gemini-2.5-flash', maxOutputTokens: 2_000 })

    if (!text || text.trim().length < 80) return []

    // Pass 2 : extraction JSON depuis le texte de recherche
    const extractPrompt = `Extrais les faits récents sur "${companyName}" depuis ce texte.
TEXTE : ${text.slice(0, 4_000)}
Réponds UNIQUEMENT en JSON : {"signals":[{"title":"...","content":"...","relevance":0.85,"type":"funding|product|partnership|expansion|contract|news|financial"}]}
Si rien de concret : {"signals":[]}`

    const { text: extracted } = await callGemini(extractPrompt, { model: 'gemini-2.5-flash', maxOutputTokens: 1_200 })
    const parsed = parseGeminiJson<{ signals: any[] }>(extracted)
    const rawSignals = (parsed?.signals ?? []).filter((s: any) => s.relevance >= 0.25)

    log(`  [grounding] "${companyName}" → ${rawSignals.length} signaux, ${sources.length} sources`)

    return rawSignals.map((s: any, i: number) => ({
      title:       s.title,
      content:     s.content,
      relevance:   s.relevance,
      type:        s.type ?? 'news',
      url:         sources[i % Math.max(sources.length, 1)]?.url ?? '',
      source_name: sources[i % Math.max(sources.length, 1)]?.title ?? 'Google (Gemini)',
    }))
  } catch (e: any) {
    log(`  [grounding] ✗ Erreur: ${e?.message}`)
    return []
  }
}

// ─── Extraction signaux depuis contenu ────────────────────────────────────────
async function extractSignalsFromContent(
  content:        string,
  companyName:    string,
  watchCountries: string[],
): Promise<{ title: string; content: string; relevance: number; type: string }[]> {
  if (!content.trim() || content.length < 50) return []
  try {
    const countryList = watchCountries.map(c => COUNTRY_NAMES[c] || c).join(', ')
    const prompt = `Extrais les informations pertinentes sur "${companyName}" dans ce contenu pour la veille africaine (${countryList}).
Contenu : ${content.slice(0, 5_000)}
JSON : {"signals":[{"title":"...","content":"...","relevance":0.8,"type":"funding|product|partnership|contract|news|financial"}]}
Si rien : {"signals":[]}`
    const { text } = await callGemini(prompt, { model: 'gemini-2.5-flash', maxOutputTokens: 1_000 })
    const parsed = parseGeminiJson<{ signals: any[] }>(text)
    return (parsed?.signals ?? []).filter((s: any) => s.relevance >= 0.25)
  } catch { return [] }
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const logs: string[] = []
  const log = (msg: string) => { console.log(msg); logs.push(msg) }

  try {
    const supabase      = createClient()
    const { watchId }   = await req.json()
    if (!watchId) return NextResponse.json({ error: 'watchId requis' }, { status: 400 })

    const { data: watch } = await supabase
      .from('watches')
      .select('*, watch_companies(companies(id, name, website, linkedin_url, country))')
      .eq('id', watchId)
      .single()

    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    const watchCountries: string[] = watch.countries ?? []
    const watchSectors: string[]   = watch.sectors   ?? []
    const realCompanies: any[]     = watch.watch_companies?.map((wc: any) => wc.companies).filter(Boolean) ?? []
    // Mode sectoriel si aucune entreprise liée
    const companies: any[] = realCompanies.length > 0
      ? realCompanies
      : [{ id: 'sector-' + watchId, name: watchSectors.length > 0 ? watchSectors.join(', ') : (watch.name ?? 'secteur'), website: null, linkedin_url: null, country: watchCountries[0] ?? null }]
    log(`\n[Scrape] ════════════════════════════════`)
    log(`[Scrape] Veille     : ${watch.name ?? watchId}`)
    log(`[Scrape] Entreprises: ${companies.map((c: any) => c.name).join(', ')}`)
    log(`[Scrape] Pays       : ${watchCountries.join(', ')}`)
    log(`[Scrape] Secteurs   : ${watchSectors.join(', ')}`)
    log(`[Scrape] APIs       : GEMINI=${!!process.env.GEMINI_API_KEY} | FIRECRAWL=${!!process.env.FIRECRAWL_API_KEY} | PROXYCURL=${!!process.env.PROXYCURL_API_KEY}`)

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 1, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    let   totalSignals   = 0
    let   sumRelevance   = 0
    const statsBySource  = { parallel_agents: 0, grounding: 0, firecrawl: 0, website: 0, linkedin: 0, sources_lib: 0 }
    const seenUrls       = new Set<string>()

    // Helper : insère un signal avec déduplication en mémoire + DB
    const insertSignal = async (payload: CollectedSignal): Promise<boolean> => {
      const dedupKey = payload.url || `${payload.company_id}:${payload.title}`
      if (seenUrls.has(dedupKey)) return false
      seenUrls.add(dedupKey)

      // Vérification DB (URL exacte)
      if (payload.url) {
        const { count } = await supabase
          .from('signals').select('id', { count: 'exact', head: true })
          .eq('watch_id', watchId).eq('url', payload.url)
        if ((count ?? 0) > 0) return false
      }

      const { error } = await supabase.from('signals').insert({
        watch_id:        watchId,
        company_id:      payload.company_id,
        source_id:       null,
        raw_content:     payload.content,
        title:           payload.title,
        url:             payload.url      || null,
        source_name:     payload.source_name || null,
        relevance_score: payload.relevance,
        signal_type:     payload.type     || 'news',
        published_at:    new Date().toISOString(),
      })
      if (error) { log(`[Scrape] INSERT error: ${error.message}`); return false }
      totalSignals++
      sumRelevance += payload.relevance
      return true
    }

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 1 — 4 agents en parallèle (web_scanner, press_monitor,
    //             analyst, deep_research) comme VeilleCI runAllWatchAgents
    // ══════════════════════════════════════════════════════════════════════
    log(`\n[Scrape] ── PHASE 1 : Agents parallèles ──`)
    const engineResult = await runAllAgentsParallel(
      companies, watchSectors, watchCountries, log,
    )

    for (const signal of engineResult.allSignals) {
      const ok = await insertSignal(signal)
      if (ok) statsBySource.parallel_agents++
    }
    log(`[Scrape] Phase 1 → ${statsBySource.parallel_agents} signaux insérés (${engineResult.allSignals.length} collectés, doublons dédupliqués)`)

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 2 — Gemini Grounding (Google Search) pour chaque entreprise
    // ══════════════════════════════════════════════════════════════════════
    log(`\n[Scrape] ── PHASE 2 : Gemini Grounding ──`)
    for (const company of companies) {
      const groundedSignals = await researchWithGrounding(
        company.name, watchCountries, watchSectors, log,
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
        if (ok) statsBySource.grounding++
      }
    }
    log(`[Scrape] Phase 2 → ${statsBySource.grounding} signaux Grounding`)

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 3 — Firecrawl (enrichissement si clé dispo), LinkedIn, Sites
    // ══════════════════════════════════════════════════════════════════════
    log(`\n[Scrape] ── PHASE 3 : Enrichissement ──`)
    const year          = new Date().getFullYear()
    const countryNames  = watchCountries.map(c => COUNTRY_NAMES[c] || c)

    for (const company of companies) {
      // Firecrawl Search
      if (process.env.FIRECRAWL_API_KEY) {
        for (const query of [
          `"${company.name}" ${countryNames[0]} ${year}`,
          `"${company.name}" Afrique partenariat contrat ${year}`,
        ]) {
          const results = await firecrawlSearch(query)
          for (const r of results) {
            let hostname = r.url
            try { hostname = new URL(r.url).hostname } catch {}
            const signals = await extractSignalsFromContent(`${r.title}\n\n${r.content}`, company.name, watchCountries)
            for (const s of signals) {
              const ok = await insertSignal({
                company_id:  company.id, title: s.title || r.title,
                content:     s.content, url: r.url,
                source_name: hostname,  relevance: s.relevance, type: s.type,
              })
              if (ok) statsBySource.firecrawl++
            }
          }
        }
      }

      // Site officiel
      if (company.website) {
        log(`  [site] ${company.website}`)
        const siteContent = process.env.FIRECRAWL_API_KEY
          ? await firecrawlScrape(company.website)
          : await (async () => {
              try {
                const r = await fetch(company.website, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12_000) })
                if (!r.ok) return ''
                const h = await r.text()
                return h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8_000)
              } catch { return '' }
            })()
        if (siteContent.length > 200) {
          const signals = await extractSignalsFromContent(siteContent, company.name, watchCountries)
          for (const s of signals) {
            const ok = await insertSignal({
              company_id: company.id, title: s.title, content: s.content,
              url: company.website, source_name: `Site officiel ${company.name}`,
              relevance: Math.max(s.relevance, 0.6), type: s.type,
            })
            if (ok) statsBySource.website++
          }
        }
      }

      // LinkedIn
      if (company.linkedin_url && process.env.PROXYCURL_API_KEY) {
        const profile = await fetchLinkedInCompany(company.linkedin_url)
        if (profile) {
          const profileContent = [
            profile.description,
            profile.specialities?.join(', '),
            profile.company_size_on_linkedin ? `Effectif : ${profile.company_size_on_linkedin}` : '',
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
            if (ok) statsBySource.linkedin++
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
          if (ok) statsBySource.linkedin++
        }
      }

      await new Promise(r => setTimeout(r, 200))
    }

    // Bibliothèque de sources
    const { data: libSources } = await supabase
      .from('sources').select('*').eq('is_active', true).eq('type', 'web')

    const relevantSources = (libSources ?? []).filter((s: any) =>
      s.countries?.some((c: string) => watchCountries.includes(c)) ||
      s.sectors?.some((sec: string) => watchSectors.includes(sec)),
    )

    for (const source of relevantSources.slice(0, 5)) {
      const urlToFetch = source.rss_url || source.url
      if (!urlToFetch) continue
      try {
        const content = process.env.FIRECRAWL_API_KEY
          ? await firecrawlScrape(urlToFetch)
          : await (async () => {
              try {
                const r = await fetch(urlToFetch, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10_000) })
                const h = await r.text()
                return h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8_000)
              } catch { return '' }
            })()
        if (!content || content.length < 100) continue
        for (const company of companies) {
          const signals = await extractSignalsFromContent(content, company.name, watchCountries)
          for (const s of signals) {
            const ok = await insertSignal({
              company_id: company.id, title: s.title, content: s.content,
              url: `${source.url}#${company.id}`, source_name: source.name,
              relevance: s.relevance, type: s.type,
            })
            if (ok) statsBySource.sources_lib++
          }
        }
      } catch (e: any) { log(`  [lib] Erreur "${source.name}": ${e?.message}`) }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  RÉSUMÉ COLLECTE
    // ══════════════════════════════════════════════════════════════════════
    log(`\n[Scrape] ══ RÉSUMÉ COLLECTE ══`)
    log(`  Agents parallèles : ${statsBySource.parallel_agents}`)
    log(`    web_scanner     : ${engineResult.breakdown.web_scanner   ?? 0}`)
    log(`    press_monitor   : ${engineResult.breakdown.press_monitor ?? 0}`)
    log(`    analyst         : ${engineResult.breakdown.analyst       ?? 0}`)
    log(`    deep_research   : ${engineResult.breakdown.deep_research ?? 0}`)
    log(`  Grounding         : ${statsBySource.grounding}`)
    log(`  Firecrawl         : ${statsBySource.firecrawl}`)
    log(`  Site officiel     : ${statsBySource.website}`)
    log(`  LinkedIn          : ${statsBySource.linkedin}`)
    log(`  Bibliothèque      : ${statsBySource.sources_lib}`)
    log(`  TOTAL             : ${totalSignals} signaux insérés`)

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 4 — Génération inline du rapport (comme generateWatchReport()
    //            dans VeilleCI, pas fire-and-forget)
    // ══════════════════════════════════════════════════════════════════════
    let reportResult: { reportId: string | null; insights: number; sources: number; skipped: boolean; reason?: string } = { reportId: null, insights: 0, sources: 0, skipped: false }

    if (totalSignals > 0) {
      log(`\n[Scrape] ── PHASE 4 : Génération rapport inline ──`)
      reportResult = await generateWatchReport(supabase, watchId, watch, true, log)
    } else {
      log(`\n[Scrape] Phase 4 ignorée (0 signaux collectés)`)
    }

    // ── Finalisation ─────────────────────────────────────────────────────
    await supabase.from('agent_jobs').update({
      status:        'done',
      completed_at:  new Date().toISOString(),
      signals_count: totalSignals,
      metadata: {
        breakdown_agents: engineResult.breakdown,
        breakdown_phases: statsBySource,
        engine_duration:  engineResult.durationMs,
        avg_relevance:    totalSignals > 0 ? Math.round((sumRelevance / totalSignals) * 100) / 100 : 0,
        report_id:        reportResult.reportId,
        errors:           engineResult.errors.slice(0, 20),
      },
    }).eq('id', job?.id)

    await supabase.from('watches')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', watchId)

    if (watch.account_id && totalSignals > 0) {
      await supabase.from('alerts').insert({
        account_id: watch.account_id,
        watch_id:   watchId,
        type:       'signal',
        title:      `Collecte terminée — ${totalSignals} signaux`,
        message:    `Agents: ${statsBySource.parallel_agents} | Grounding: ${statsBySource.grounding} | Firecrawl: ${statsBySource.firecrawl} | Site: ${statsBySource.website} | LinkedIn: ${statsBySource.linkedin}`,
      })
    }

    return NextResponse.json({
      success:       true,
      total_signals: totalSignals,
      breakdown:     { ...statsBySource, agents: engineResult.breakdown },
      report_id:     reportResult.reportId,
      report_ready:  !reportResult.skipped,
    })

  } catch (error: any) {
    console.error('[Scrape] ERREUR FATALE:', error)
    return NextResponse.json({ error: String(error?.message ?? error) }, { status: 500 })
  }
}