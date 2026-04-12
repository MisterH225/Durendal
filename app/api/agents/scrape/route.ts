export const maxDuration = 300

/**
 * POST /api/agents/scrape
 * Orchestrateur principal de collecte — REFONTE GEMINI
 *
 * Pipeline :
 *  Phase 1 — Gemini + Google Search Grounding (collecte signaux)
 *  Phase 2 — Extraction articles + déduplication
 *  Phase 3 — Analyse IA structurée par signal
 *  Phase 4 — Agent 2 : Rapport concurrentiel
 *  Phase 4b — Pipeline Challenger (Pro+)
 *  Phase 5 — Agent 3 : Analyse de marché
 *  Phase 6 — Agent 4 : Plan stratégique
 *  Phase 7 — Agent 5 : Prédictions
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }          from '@/lib/supabase/admin'
import { callGemini, callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'
import { extractArticle }             from '@/lib/article-extractor'
import { generateWatchReport }        from '@/lib/agents/report-generator'
import { generateMarketAnalysis }     from '@/lib/agents/market-analyst'
import { generateStrategyReport }     from '@/lib/agents/strategy-advisor'
import { generatePredictions }        from '@/lib/agents/prediction-engine'
import { runChallengerPipeline }      from '@/lib/agents/report-challengers'
import { countryName }                from '@/lib/countries'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CollectedSignalItem {
  title: string
  summary: string
  severity: 'high' | 'medium' | 'low'
  region: string
  signal_type: string
  company_name: string | null
  source_hint: string
  source_url: string
}

interface VeilleAnalysis {
  executiveTakeaway: string
  competitiveImpact: string
  affectedCompanies: { name: string; impact: string; riskLevel: string }[]
  marketImplications: string[]
  strategicRecommendations: string[]
  whatToWatch: string[]
  confidenceNote: string
}

// ─── Deduplication ─────────────────────────────────────────────────────────────

function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôùûüÿçœæ0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

// ─── Build Gemini prompt for watch ─────────────────────────────────────────────

function buildCollectionPrompt(
  watch: any,
  companies: any[],
  watchSectors: string[],
  watchCountries: string[],
): { systemInstruction: string; prompt: string } {
  const companyDetails = companies.map(c => {
    const aspects = c.aspects?.length ? ` (aspects : ${c.aspects.join(', ')})` : ''
    return `- ${c.name} (${c.sector ?? 'secteur inconnu'}, ${countryName(c.country ?? '')})${aspects}`
  }).join('\n')

  const sectors = watchSectors.join(', ') || 'non spécifié'
  const countries = watchCountries.map(c => countryName(c)).join(', ') || 'non spécifié'

  const systemInstruction = [
    `Tu es un analyste senior en veille concurrentielle.`,
    ``,
    `MISSION : identifier les développements récents les plus importants concernant`,
    `les entreprises et secteurs surveillés par cette veille.`,
    ``,
    companies.length > 0 ? `ENTREPRISES SURVEILLÉES :\n${companyDetails}` : '',
    `SECTEURS : ${sectors}`,
    `PAYS/RÉGIONS : ${countries}`,
    ``,
    `RÈGLES :`,
    `- Chaque signal DOIT être directement pertinent pour les entreprises ou secteurs surveillés.`,
    `- Privilégie les faits vérifiables récents (24-48h), pas les rumeurs.`,
    `- Inclus l'URL source la plus précise possible.`,
    `- Varie les types de signaux : news, funding, product, partnership, regulation, market_shift.`,
    `- Si une entreprise surveillée est directement concernée, mentionne-la dans company_name.`,
    `IMPORTANT : retourne UNIQUEMENT un objet JSON valide avec une clé "signals", sans markdown.`,
  ].filter(Boolean).join('\n')

  const prompt = [
    `Identifie les 8 développements les plus importants des dernières 24-48h`,
    `concernant les entreprises surveillées ou leur environnement concurrentiel.`,
    ``,
    `Critères de sélection :`,
    `- Impact concurrentiel direct sur les entreprises ou secteurs surveillés`,
    `- Mouvements stratégiques (fusions, acquisitions, partenariats, levées de fonds)`,
    `- Lancements de produits ou innovations dans les secteurs concernés`,
    `- Changements réglementaires affectant les marchés ciblés`,
    `- Évolutions de marché significatives dans les pays ciblés`,
    `- Contrats, appels d'offres, résultats financiers`,
    ``,
    `Pour chaque développement :`,
    `- "title" : titre court et percutant (max 120 caractères)`,
    `- "summary" : explication de l'enjeu concurrentiel en 2-3 phrases (max 300 caractères)`,
    `- "severity" : "high" | "medium" | "low"`,
    `- "region" : pays ou région principale`,
    `- "signal_type" : "news" | "funding" | "product" | "partnership" | "regulation" | "market_shift"`,
    `- "company_name" : nom de l'entreprise surveillée directement concernée (ou null)`,
    `- "source_hint" : source/publication`,
    `- "source_url" : URL directe vers l'article source`,
    ``,
    `Format JSON :`,
    `{"signals":[{"title":"...","summary":"...","severity":"high","region":"...","signal_type":"news","company_name":"..." ou null,"source_hint":"...","source_url":"https://..."}]}`,
  ].join('\n')

  return { systemInstruction, prompt }
}

// ─── Analysis prompt ───────────────────────────────────────────────────────────

function buildAnalysisPrompt(
  title: string,
  body: string | null,
  summary: string,
  companies: string[],
  sectors: string[],
  countries: string[],
): string {
  const content = body
    ? `TITRE : ${title}\n\nCONTENU COMPLET :\n${body.slice(0, 12000)}`
    : `TITRE : ${title}\n\nRÉSUMÉ : ${summary}`

  const depth = body
    ? 'Tu as accès au contenu COMPLET. Fournis une analyse détaillée.'
    : 'Tu n\'as que le résumé. Utilise tes connaissances pour enrichir l\'analyse.'

  return [
    `Tu es un analyste en veille concurrentielle senior. ${depth}`,
    companies.length > 0 ? `Entreprises surveillées : ${companies.join(', ')}` : '',
    sectors.length > 0 ? `Secteurs : ${sectors.join(', ')}` : '',
    countries.length > 0 ? `Pays ciblés : ${countries.join(', ')}` : '',
    ``,
    `--- CONTENU ---`,
    content,
    `--- FIN ---`,
    ``,
    `Génère une analyse concurrentielle structurée en français.`,
    `Chaque section doit être SUBSTANTIELLE et actionnable.`,
    `NE LAISSE AUCUNE SECTION VIDE.`,
    `Retourne UNIQUEMENT un objet JSON valide :`,
    `{"executiveTakeaway":"Synthèse 2-3 phrases","competitiveImpact":"Impact concurrentiel (3-4 phrases)",`,
    `"affectedCompanies":[{"name":"Nom","impact":"Description","riskLevel":"high|medium|low"}],`,
    `"marketImplications":["Implication 1","Implication 2"],`,
    `"strategicRecommendations":["Recommandation 1","Recommandation 2"],`,
    `"whatToWatch":["Indicateur 1","Indicateur 2"],`,
    `"confidenceNote":"Niveau de confiance et biais"}`,
  ].filter(Boolean).join('\n')
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const logs: string[] = []
  const log = (msg: string) => { console.log(msg); logs.push(msg) }

  try {
    const supabase      = createAdminClient()
    const { watchId }   = await req.json()
    if (!watchId) return NextResponse.json({ error: 'watchId requis' }, { status: 400 })

    const { data: watch } = await supabase
      .from('watches')
      .select('*, watch_companies(aspects, companies(id, name, website, linkedin_url, country, sector))')
      .eq('id', watchId)
      .single()

    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    const watchCountries: string[] = watch.countries ?? []
    const watchSectors: string[]   = watch.sectors   ?? []
    const realCompanies: any[]     = (watch.watch_companies ?? []).map((wc: any) => ({
      ...wc.companies,
      aspects: wc.aspects ?? [],
    })).filter(Boolean)
    const companies: any[] = realCompanies.length > 0
      ? realCompanies
      : [{ id: 'sector-' + watchId, name: watchSectors.length > 0 ? watchSectors.join(', ') : (watch.name ?? 'secteur'), website: null, linkedin_url: null, country: watchCountries[0] ?? null }]

    log(`\n[Scrape] ════════════════════════════════`)
    log(`[Scrape] Veille     : ${watch.name ?? watchId}`)
    log(`[Scrape] Entreprises: ${companies.map((c: any) => c.name).join(', ')}`)
    log(`[Scrape] Pays       : ${watchCountries.join(', ')}`)
    log(`[Scrape] Secteurs   : ${watchSectors.join(', ')}`)
    log(`[Scrape] Moteur     : Gemini + Google Search Grounding`)

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 1, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    let totalSignals = 0
    const dedupWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Load recent fingerprints for dedup
    const { data: recentSignals } = await supabase
      .from('signals')
      .select('title')
      .eq('watch_id', watchId)
      .gt('collected_at', dedupWindow)

    const recentFingerprints = new Set(
      (recentSignals ?? []).map((s: { title: string | null }) => titleFingerprint(s.title ?? ''))
    )

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 1 — Gemini + Google Search Grounding
    // ══════════════════════════════════════════════════════════════════════
    log(`\n[Scrape] ── PHASE 1 : Gemini Search Grounding ──`)

    const { systemInstruction, prompt } = buildCollectionPrompt(watch, companies, watchSectors, watchCountries)
    const { text: geminiText, sources: groundingSources } = await callGeminiWithSearch(prompt, {
      systemInstruction,
      maxOutputTokens: 4000,
    })

    const parsed = parseGeminiJson<{ signals: CollectedSignalItem[] }>(geminiText)
    const rawSignals = parsed?.signals ?? []

    log(`[Scrape] Gemini → ${rawSignals.length} signaux bruts, ${groundingSources.length} sources`)

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 2 — Déduplication + extraction articles
    // ══════════════════════════════════════════════════════════════════════
    log(`\n[Scrape] ── PHASE 2 : Déduplication + extraction articles ──`)

    const filtered = rawSignals.filter(s => {
      if (!s.title || !s.summary) return false
      const fp = titleFingerprint(s.title)
      if (recentFingerprints.has(fp)) return false
      recentFingerprints.add(fp)
      return true
    })

    log(`[Scrape] Après dédup : ${filtered.length} signaux uniques`)

    const companyNames = companies.map((c: any) => c.name)
    const insertedIds: string[] = []

    for (const s of filtered) {
      const url = s.source_url
        || groundingSources.find(gs => gs.url && gs.title)?.url
        || null

      let imageUrl: string | null = null
      let articleBody: string | null = null
      let articleAuthor: string | null = null
      let articlePublishedAt: string | null = null
      let articlePublisher: string | null = null

      if (url) {
        try {
          const extracted = await extractArticle(url)
          imageUrl = extracted.imageUrl
          articleBody = extracted.body
          articleAuthor = extracted.author
          articlePublishedAt = extracted.publishedAt
          articlePublisher = extracted.publisher
        } catch (e) {
          log(`  [extract] Échec pour ${url}: ${e instanceof Error ? e.message : e}`)
        }
      }

      let companyId: string | null = null
      if (s.company_name) {
        const match = companies.find((c: any) =>
          c.name.toLowerCase().includes(s.company_name!.toLowerCase()) ||
          s.company_name!.toLowerCase().includes(c.name.toLowerCase())
        )
        if (match) companyId = match.id
      }

      const severity = (['high', 'medium', 'low'] as const).includes(s.severity as any)
        ? s.severity : 'medium'

      const { data: inserted, error: insertErr } = await supabase
        .from('signals')
        .insert({
          watch_id:        watchId,
          company_id:      companyId,
          title:           s.title.slice(0, 200),
          raw_content:     s.summary.slice(0, 1000),
          url:             url,
          source_name:     s.source_hint ?? articlePublisher ?? null,
          signal_type:     s.signal_type ?? 'news',
          relevance_score: severity === 'high' ? 0.9 : severity === 'medium' ? 0.6 : 0.3,
          severity,
          region:          s.region ?? null,
          published_at:    articlePublishedAt ?? new Date().toISOString(),
          data: {
            summary:           s.summary,
            region:            s.region ?? null,
            source_url:        url,
            image_url:         imageUrl,
            article_body:      articleBody,
            article_author:    articleAuthor,
            article_published: articlePublishedAt,
            article_publisher: articlePublisher ?? s.source_hint ?? null,
            grounding_sources: groundingSources.slice(0, 5).map(gs => ({ title: gs.title, url: gs.url })),
            generated_by:      'gemini-scrape-route',
          },
        })
        .select('id')
        .single()

      if (insertErr) {
        log(`  [insert] Erreur : ${insertErr.message}`)
        continue
      }

      totalSignals++
      if (inserted?.id) insertedIds.push(inserted.id)
    }

    log(`[Scrape] Phase 1+2 → ${totalSignals} signaux insérés`)

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 3 — Analyse IA structurée par signal
    // ══════════════════════════════════════════════════════════════════════
    log(`\n[Scrape] ── PHASE 3 : Analyse IA structurée ──`)

    for (const sigId of insertedIds) {
      try {
        const { data: sig } = await supabase
          .from('signals')
          .select('id, title, raw_content, data')
          .eq('id', sigId)
          .single()

        if (!sig) continue

        const sigData = (sig.data ?? {}) as Record<string, unknown>
        const prompt = buildAnalysisPrompt(
          sig.title ?? '',
          (sigData.article_body as string) ?? null,
          sig.raw_content ?? '',
          companyNames,
          watchSectors,
          watchCountries.map(c => countryName(c)),
        )

        const { text } = await callGemini(prompt, { maxOutputTokens: 3000, temperature: 0.2 })
        const analysis = parseGeminiJson<VeilleAnalysis>(text)

        if (analysis?.executiveTakeaway) {
          await supabase
            .from('signals')
            .update({ data: { ...sigData, ai_analysis: analysis } })
            .eq('id', sigId)
          log(`  [analyse] ✓ Signal ${sigId.slice(0, 8)}`)
        }

        await new Promise(r => setTimeout(r, 1500))
      } catch (e) {
        log(`  [analyse] ✗ Signal ${sigId.slice(0, 8)}: ${e instanceof Error ? e.message : e}`)
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  RÉSUMÉ COLLECTE
    // ══════════════════════════════════════════════════════════════════════
    log(`\n[Scrape] ══ RÉSUMÉ COLLECTE ══`)
    log(`  Gemini signaux    : ${totalSignals}`)
    log(`  Sources Grounding : ${groundingSources.length}`)
    log(`  Analyses IA       : ${insertedIds.length}`)

    // ══════════════════════════════════════════════════════════════════════
    //  PHASE 4 — Agent 2 : Rapport concurrentiel
    // ══════════════════════════════════════════════════════════════════════
    let reportResult: { reportId: string | null; insights: number; sources: number; skipped: boolean; reason?: string } = { reportId: null, insights: 0, sources: 0, skipped: false }
    let marketReportId: string | null = null
    let strategyReportId: string | null = null
    let predictionReportId: string | null = null

    if (totalSignals > 0) {
      log(`\n[Scrape] ── PHASE 4 : Agent 2 — Rapport concurrentiel ──`)
      reportResult = await generateWatchReport(supabase, watchId, watch, true, log)

      if (reportResult.reportId) {
        let effectiveReportId = reportResult.reportId

        const isPro = await (async () => {
          if (!watch.account_id) return false
          const { data: account } = await supabase
            .from('accounts')
            .select('plan_id, plans(name)')
            .eq('id', watch.account_id)
            .single()
          const planName = (account as any)?.plans?.name ?? 'free'
          return planName === 'pro' || planName === 'business'
        })()

        if (isPro) {
          log(`\n[Scrape] ── PHASE 4b : Pipeline Challenger (audit multi-agents) ──`)
          const challengerResult = await runChallengerPipeline(
            supabase, watchId, watch, reportResult.reportId, log,
          )
          if (challengerResult.finalReportId) {
            effectiveReportId = challengerResult.finalReportId
            log(`[Scrape] Rapport enrichi par Challengers: ${effectiveReportId}`)
          }
        } else {
          log(`[Scrape] Pipeline Challenger ignoré (plan Free)`)
        }

        // PHASE 5 — Agent 3 : Analyse de marché
        log(`\n[Scrape] ── PHASE 5 : Agent 3 — Analyse de marché ──`)
        const marketResult = await generateMarketAnalysis(
          supabase, watchId, watch, effectiveReportId, log,
        )
        marketReportId = marketResult.reportId

        // PHASE 6 — Agent 4 : Plan stratégique
        log(`\n[Scrape] ── PHASE 6 : Agent 4 — Plan stratégique ──`)
        const strategyResult = await generateStrategyReport(
          supabase, watchId, watch, effectiveReportId, marketReportId, log,
        )
        strategyReportId = strategyResult.reportId

        // PHASE 7 — Agent 5 : Prédictions
        log(`\n[Scrape] ── PHASE 7 : Agent 5 — Prédictions ──`)
        const predictionResult = await generatePredictions(
          supabase, watchId, watch, effectiveReportId, marketReportId, strategyReportId, log,
        )
        predictionReportId = predictionResult.reportId
      }
    } else {
      log(`\n[Scrape] Phases 4-7 ignorées (0 signaux collectés)`)
    }

    await supabase.from('agent_jobs').update({
      status:        'done',
      completed_at:  new Date().toISOString(),
      signals_count: totalSignals,
      metadata: {
        collector:              'gemini-search-grounding',
        signals_count:          totalSignals,
        grounding_sources:      groundingSources.length,
        analyses_generated:     insertedIds.length,
        report_id:              reportResult.reportId,
        market_report_id:       marketReportId,
        strategy_report_id:     strategyReportId,
        prediction_report_id:   predictionReportId,
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
        title:      `Collecte Gemini terminée — ${totalSignals} signaux`,
        message:    `${totalSignals} signaux collectés via Gemini Search Grounding avec analyses IA structurées.`,
      })
    }

    return NextResponse.json({
      success:       true,
      total_signals: totalSignals,
      collector:     'gemini-search-grounding',
      report_id:              reportResult.reportId,
      market_report_id:       marketReportId,
      strategy_report_id:     strategyReportId,
      prediction_report_id:   predictionReportId,
      report_ready:           !reportResult.skipped,
    })

  } catch (error: any) {
    console.error('[Scrape] ERREUR FATALE:', error)
    return NextResponse.json({ error: String(error?.message ?? error) }, { status: 500 })
  }
}
