/**
 * veille-signal-collector.job.ts
 *
 * Collecteur de signaux pour la veille concurrentielle.
 * Architecture calquée sur news-signal.job.ts (module forecast) :
 *
 * Pipeline :
 *   1. Charger les veilles actives dont l'intervalle est dépassé
 *   2. Pour chaque veille, construire un prompt contextualisé
 *      (entreprises, secteurs, pays, aspects)
 *   3. Appeler Gemini avec Google Search Grounding
 *   4. Dédupliquer par fingerprint titre (fenêtre 24h)
 *   5. Extraire le contenu article complet + image OG
 *   6. Générer une analyse IA structurée par signal
 *   7. Insérer dans la table signals
 *   8. Mettre à jour last_run_at + log agent_jobs
 */

import { createWorkerSupabase } from '../../supabase'
import { callGemini, callGeminiWithSearch, parseGeminiJson } from '../../../../../lib/ai/gemini'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface WatchRow {
  id: string
  name: string
  frequency: string
  last_run_at: string | null
  sectors: string[] | null
  countries: string[] | null
  account_id: string
  watch_companies: {
    company_id: string
    aspects: string[] | null
    companies: { id: string; name: string; sector: string | null; country: string | null; website: string | null } | null
  }[]
}

interface CollectedSignalItem {
  title: string
  summary: string
  severity: 'high' | 'medium' | 'low'
  region: string
  signal_type: string
  category: string
  company_name: string | null
  source_hint: string
  source_url: string
}

interface CollectedSignalsResponse {
  signals: CollectedSignalItem[]
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

// ─── Frequency intervals ───────────────────────────────────────────────────────

const FREQUENCY_INTERVALS: Record<string, number> = {
  realtime: 60 * 60 * 1000,
  daily:    24 * 60 * 60 * 1000,
  weekly:   7 * 24 * 60 * 60 * 1000,
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

// ─── OG Image fallback ─────────────────────────────────────────────────────────

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      redirect: 'follow',
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const html = await res.text()
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1] && match[1].startsWith('http')) return match[1]
    }
    return null
  } catch {
    return null
  }
}

// ─── Build prompt for a specific watch ─────────────────────────────────────────

function buildCollectionPrompt(watch: WatchRow): { systemInstruction: string; prompt: string } {
  const companies = (watch.watch_companies ?? [])
    .map(wc => wc.companies)
    .filter(Boolean)

  const companyDetails = companies.map(c => {
    const wc = watch.watch_companies.find(w => w.company_id === c!.id)
    const aspects = wc?.aspects?.length ? ` (aspects surveillés : ${wc.aspects.join(', ')})` : ''
    return `- ${c!.name} (${c!.sector ?? 'secteur inconnu'}, ${c!.country ?? 'pays inconnu'})${aspects}`
  }).join('\n')

  const sectors = (watch.sectors ?? []).join(', ') || 'non spécifié'
  const countries = (watch.countries ?? []).join(', ') || 'non spécifié'

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
    `- Classe chaque signal dans une CATÉGORIE MÉTIER pertinente selon son contenu :`,
    `  Régulation, Vente, RSE, Livraison, Partenariat, Innovation, Finance, Ressources Humaines, etc.`,
    `  Choisis la catégorie la plus adaptée au sujet du signal.`,
    `IMPORTANT : retourne UNIQUEMENT un objet JSON valide avec une clé "signals", sans markdown.`,
  ].filter(Boolean).join('\n')

  const prompt = [
    `Identifie les 5 développements les plus importants des dernières 24-48h`,
    `concernant les entreprises surveillées ou leur environnement concurrentiel.`,
    ``,
    `Critères de sélection :`,
    `- Impact concurrentiel direct sur les entreprises ou secteurs surveillés`,
    `- Mouvements stratégiques (fusions, acquisitions, partenariats, levées de fonds)`,
    `- Lancements de produits ou innovations dans les secteurs concernés`,
    `- Changements réglementaires affectant les marchés ciblés`,
    `- Évolutions de marché significatives dans les pays ciblés`,
    ``,
    `Pour chaque développement, crée un objet avec ces champs :`,
    `- "title" : titre court et percutant (max 120 caractères)`,
    `- "summary" : explication de l'enjeu concurrentiel en 2-3 phrases (max 300 caractères)`,
    `- "severity" : "high" | "medium" | "low" selon l'impact concurrentiel`,
    `- "region" : pays ou région principale concernée`,
    `- "signal_type" : "news" | "funding" | "product" | "partnership" | "regulation" | "market_shift"`,
    `- "category" : catégorie métier (ex: "Régulation", "Vente", "RSE", "Livraison", "Partenariat", "Innovation", "Finance", "Ressources Humaines")`,
    `- "company_name" : nom de l'entreprise surveillée directement concernée (ou null)`,
    `- "source_hint" : source/publication de référence`,
    `- "source_url" : URL directe vers l'article source`,
    ``,
    `Format attendu (JSON uniquement) :`,
    `{`,
    `  "signals": [`,
    `    {`,
    `      "title": "...",`,
    `      "summary": "...",`,
    `      "severity": "high",`,
    `      "region": "...",`,
    `      "signal_type": "news",`,
    `      "category": "Régulation",`,
    `      "company_name": "..." ou null,`,
    `      "source_hint": "...",`,
    `      "source_url": "https://..."`,
    `    }`,
    `  ]`,
    `}`,
  ].join('\n')

  return { systemInstruction, prompt }
}

// ─── Analyse IA structurée ─────────────────────────────────────────────────────

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
    `{`,
    `  "executiveTakeaway": "Synthèse 2-3 phrases pour un décideur",`,
    `  "competitiveImpact": "Impact sur le paysage concurrentiel (3-4 phrases)",`,
    `  "affectedCompanies": [{"name":"Nom","impact":"Description (2-3 phrases)","riskLevel":"high|medium|low"}],`,
    `  "marketImplications": ["Implication 1 (2-3 phrases)", "Implication 2"],`,
    `  "strategicRecommendations": ["Recommandation actionnable 1", "Recommandation 2"],`,
    `  "whatToWatch": ["Indicateur 1", "Indicateur 2"],`,
    `  "confidenceNote": "Niveau de confiance et biais (2 phrases)"`,
    `}`,
  ].filter(Boolean).join('\n')
}

async function generateSignalAnalysis(
  signalId: string,
  title: string,
  summary: string,
  articleBody: string | null,
  companies: string[],
  sectors: string[],
  countries: string[],
  supabase: ReturnType<typeof createWorkerSupabase>,
): Promise<void> {
  try {
    const prompt = buildAnalysisPrompt(title, articleBody, summary, companies, sectors, countries)

    const { text } = await callGemini(prompt, {
      maxOutputTokens: 3000,
      temperature: 0.2,
    })

    const analysis = parseGeminiJson<VeilleAnalysis>(text)

    if (!analysis || !analysis.executiveTakeaway) {
      console.log(`[veille-collector] Analyse vide pour signal ${signalId}, skip.`)
      return
    }

    const { data: current } = await supabase
      .from('signals')
      .select('data')
      .eq('id', signalId)
      .single()

    const existingData = (current?.data ?? {}) as Record<string, unknown>

    await supabase
      .from('signals')
      .update({ data: { ...existingData, ai_analysis: analysis } })
      .eq('id', signalId)

    console.log(`[veille-collector] ✓ Analyse AI pour signal ${signalId}`)
  } catch (err) {
    console.error(`[veille-collector] ✗ Échec analyse signal ${signalId}:`, err)
  }
}

// ─── Main job ──────────────────────────────────────────────────────────────────

export async function runVeilleSignalCollectorJob(): Promise<void> {
  const supabase = createWorkerSupabase()
  const now = Date.now()
  const dedupWindow = new Date(now - 24 * 60 * 60 * 1000).toISOString()

  // 1. Charger les veilles actives
  const { data: watches, error: wErr } = await supabase
    .from('watches')
    .select(`
      id, name, frequency, last_run_at, sectors, countries, account_id,
      watch_companies (
        company_id, aspects,
        companies ( id, name, sector, country, website )
      )
    `)
    .eq('is_active', true)

  if (wErr || !watches?.length) {
    console.log('[veille-collector] Aucune veille active.')
    return
  }

  // 2. Filtrer celles qui sont dues
  const dueWatches = watches.filter((w: any) => {
    const interval = FREQUENCY_INTERVALS[w.frequency] ?? FREQUENCY_INTERVALS.daily
    const lastRun = w.last_run_at ? new Date(w.last_run_at).getTime() : 0
    return (now - lastRun) >= interval
  }) as unknown as WatchRow[]

  if (!dueWatches.length) {
    console.log('[veille-collector] Aucune veille due pour ce cycle.')
    return
  }

  console.log(`[veille-collector] ${dueWatches.length} veille(s) à traiter.`)

  let totalInserted = 0

  for (const watch of dueWatches) {
    const startTime = Date.now()
    console.log(`[veille-collector] >> Veille "${watch.name}" (${watch.id.slice(0, 8)})`)

    const companies = (watch.watch_companies ?? [])
      .map(wc => wc.companies)
      .filter(Boolean)
    const companyNames = companies.map(c => c!.name)
    const sectors = watch.sectors ?? []
    const countries = watch.countries ?? []

    // Charger les titres récents pour déduplication
    const { data: recentSignals } = await supabase
      .from('signals')
      .select('title')
      .eq('watch_id', watch.id)
      .gt('collected_at', dedupWindow)

    const recentFingerprints = new Set(
      (recentSignals ?? []).map((s: { title: string | null }) => titleFingerprint(s.title ?? ''))
    )

    // Construire et exécuter le prompt
    const { systemInstruction, prompt } = buildCollectionPrompt(watch)

    try {
      const { text, sources: groundingSources } = await callGeminiWithSearch(prompt, { systemInstruction })

      const parsed = parseGeminiJson<CollectedSignalsResponse>(text)
      const signals = parsed?.signals ?? []

      if (!signals.length) {
        console.log(`[veille-collector] Veille "${watch.name}" — aucun signal parsé.`)
        await updateWatchLastRun(supabase, watch.id, 0, startTime)
        continue
      }

      // Filtrer doublons
      const filtered = signals.filter(s => {
        if (!s.title || !s.summary) return false
        const fp = titleFingerprint(s.title)
        if (recentFingerprints.has(fp)) return false
        recentFingerprints.add(fp)
        return true
      })

      // Enrichir avec extraction d'article + image
      const toInsert = await Promise.all(
        filtered.map(async (s) => {
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
              const { extractArticle } = await import('../../../../../lib/article-extractor')
              const extracted = await extractArticle(url)
              imageUrl = extracted.imageUrl
              articleBody = extracted.body
              articleAuthor = extracted.author
              articlePublishedAt = extracted.publishedAt
              articlePublisher = extracted.publisher
            } catch {
              imageUrl = await fetchOgImage(url)
            }
          }

          // Match company_name to an actual company_id
          let companyId: string | null = null
          if (s.company_name) {
            const match = companies.find(c =>
              c!.name.toLowerCase().includes(s.company_name!.toLowerCase()) ||
              s.company_name!.toLowerCase().includes(c!.name.toLowerCase())
            )
            if (match) companyId = match!.id
          }

          const severity = (['high', 'medium', 'low'] as const).includes(s.severity as any)
            ? s.severity : 'medium'

          return {
            watch_id:        watch.id,
            company_id:      companyId,
            title:           s.title.slice(0, 200),
            raw_content:     s.summary.slice(0, 1000),
            url:             url,
            source_name:     s.source_hint ?? null,
            signal_type:     s.signal_type ?? 'news',
            category:        s.category ?? null,
            relevance_score: severity === 'high' ? 0.9 : severity === 'medium' ? 0.6 : 0.3,
            severity,
            region:          s.region ?? null,
            published_at:    articlePublishedAt ?? new Date().toISOString(),
            data: {
              summary:           s.summary,
              region:            s.region ?? null,
              source_hint:       s.source_hint ?? null,
              source_url:        url,
              image_url:         imageUrl,
              article_body:      articleBody,
              article_author:    articleAuthor,
              article_published: articlePublishedAt,
              article_publisher: articlePublisher ?? s.source_hint ?? null,
              grounding_sources: groundingSources.slice(0, 5).map(gs => ({ title: gs.title, url: gs.url })),
              generated_by:      'gemini-veille-collector',
            },
          }
        })
      )

      if (!toInsert.length) {
        console.log(`[veille-collector] Veille "${watch.name}" — tous doublons, skip.`)
        await updateWatchLastRun(supabase, watch.id, 0, startTime)
        continue
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('signals')
        .insert(toInsert)
        .select('id, title, raw_content, data')

      if (insertErr) {
        console.error(`[veille-collector] Erreur insert veille "${watch.name}":`, insertErr.message)
        await updateWatchLastRun(supabase, watch.id, 0, startTime)
        continue
      }

      const insertedCount = inserted?.length ?? toInsert.length
      totalInserted += insertedCount
      console.log(`[veille-collector] Veille "${watch.name}" — ${insertedCount} signal(s) insérés. Génération analyses...`)

      // Générer l'analyse IA structurée pour chaque signal
      for (const sig of (inserted ?? [])) {
        const sigData = (sig.data ?? {}) as Record<string, unknown>
        await generateSignalAnalysis(
          sig.id,
          sig.title ?? '',
          sig.raw_content ?? '',
          (sigData.article_body as string) ?? null,
          companyNames,
          sectors,
          countries,
          supabase,
        )
        await new Promise(r => setTimeout(r, 1500))
      }

      await updateWatchLastRun(supabase, watch.id, insertedCount, startTime)
    } catch (err) {
      console.error(`[veille-collector] Erreur Gemini veille "${watch.name}":`, err)
      await updateWatchLastRun(supabase, watch.id, 0, startTime)
    }

    // Pause entre veilles pour respecter les rate limits
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log(`[veille-collector] Terminé — ${totalInserted} signal(s) insérés au total.`)
}

async function updateWatchLastRun(
  supabase: ReturnType<typeof createWorkerSupabase>,
  watchId: string,
  signalsCount: number,
  startTime: number,
): Promise<void> {
  const durationMs = Date.now() - startTime

  await supabase
    .from('watches')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', watchId)

  try {
    await supabase
      .from('agent_jobs')
      .insert({
        watch_id:     watchId,
        agent_number: 1,
        status:       signalsCount > 0 ? 'completed' : 'completed_empty',
        started_at:   new Date(startTime).toISOString(),
        finished_at:  new Date().toISOString(),
        duration_ms:  durationMs,
        metadata: {
          collector:     'gemini-search-grounding',
          signals_count: signalsCount,
        },
      })
  } catch (err: any) {
    console.error(`[veille-collector] Erreur log agent_job:`, err?.message)
  }
}
