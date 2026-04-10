/**
 * news-signal.job.ts
 *
 * Troisième déclencheur de signaux : actualités éditoriales générées par IA.
 *
 * Contrairement aux deux autres déclencheurs (probability_shift et resolution),
 * ce job ne dépend pas de l'existence de questions dans la DB.
 * Il utilise Gemini avec Google Search Grounding pour générer des signaux
 * d'actualité informatifs par canal et par région.
 *
 * Pipeline :
 *   1. Charger les canaux actifs
 *   2. Pour chaque canal, appeler Gemini avec un prompt contextualisé
 *   3. Parser les signaux JSON retournés
 *   4. Filtrer les doublons (< 4h) sur title fingerprint
 *   5. Insérer dans forecast_signal_feed avec signal_type = 'news'
 */

import { createWorkerSupabase } from '../../supabase'
import { callGeminiWithSearch, parseGeminiJson } from '../../../../../lib/ai/gemini'

// ─── Channel-specific prompt adapters ────────────────────────────────────────

interface NewsAdapter {
  regionContext: string
  topicFocus: string
  sourcesHint: string
}

const CHANNEL_NEWS_ADAPTERS: Record<string, NewsAdapter> = {
  'macro-commodities': {
    regionContext: 'couverture MONDIALE — décisions de la Fed, BCE, BoE, BoJ, banques centrales des pays émergents. Impact sur les marchés africains et les économies en développement',
    topicFocus: 'guerres et conflits géopolitiques affectant les prix (ex: conflit Iran/Israël/USA → pétrole), sanctions économiques, décisions OPEP+, taux directeurs (Fed, BCE), prix matières premières (pétrole, gaz, or, cuivre, céréales), inflation mondiale, crises de dette souveraine, flux de capitaux vers les émergents',
    sourcesHint: 'Bloomberg, Reuters, Financial Times, CNBC, Wall Street Journal, The Economist',
  },
  'politics-policy': {
    regionContext: 'géopolitique MONDIALE — grandes puissances (USA, Chine, Russie, UE), conflits en cours, et leurs répercussions sur l\'Afrique et les marchés émergents',
    topicFocus: 'guerres et tensions (Moyen-Orient, Ukraine-Russie, mer de Chine), sommets G7/G20/BRICS, sanctions internationales, élections majeures (USA, UE, Inde, Nigeria), accords commerciaux, politique étrangère US/Chine en Afrique, décisions ONU/UA/CEDEAO',
    sourcesHint: 'BBC World News, Al Jazeera, Reuters, CNN International, France 24, Foreign Affairs, The Guardian',
  },
  'tech-ai': {
    regionContext: 'innovation technologique MONDIALE — Silicon Valley, Chine, Europe, et adoption dans les marchés émergents',
    topicFocus: 'lancements majeurs IA (OpenAI, Google, Meta, Anthropic), régulations (EU AI Act, executive orders US), semi-conducteurs et guerre des puces (TSMC, Nvidia), fintech mondiale, cybersécurité, adoption numérique Afrique/Asie/LATAM',
    sourcesHint: 'Bloomberg, Financial Times, TechCrunch, The Verge, Reuters, Wired',
  },
  'agriculture-risk': {
    regionContext: 'sécurité alimentaire MONDIALE — production agricole, chaînes d\'approvisionnement, impact des conflits et du climat sur les prix alimentaires',
    topicFocus: 'prix mondiaux des céréales (blé, maïs, riz, soja), perturbations d\'exportation (Ukraine/Russie/mer Noire), rapports FAO/USDA, sécheresses et inondations (El Niño, La Niña), embargo et restrictions d\'exportation, impact des conflits sur l\'approvisionnement alimentaire',
    sourcesHint: 'Reuters, Bloomberg, FAO, USDA, Al Jazeera, Financial Times',
  },
  'climate': {
    regionContext: 'changement climatique MONDIAL — événements extrêmes, transitions énergétiques, politiques environnementales des grandes puissances',
    topicFocus: 'catastrophes naturelles majeures, décisions énergétiques (pétrole vs renouvelable), COP et accords climatiques, marché carbone, transition énergétique (hydrogène vert, solaire), impact des guerres sur la politique énergétique, nouvelles centrales nucléaires',
    sourcesHint: 'BBC World News, Reuters, The Guardian, Euronews, Bloomberg Green, Financial Times',
  },
  'logistics': {
    regionContext: 'chaînes d\'approvisionnement MONDIALES — routes maritimes, corridors commerciaux, perturbations géopolitiques',
    topicFocus: 'tensions en mer Rouge/Bab-el-Mandeb/détroit d\'Hormuz, canal de Suez/Panama, guerre commerciale USA-Chine (tarifs douaniers), perturbations portuaires, prix du fret mondial, corridors africains (AfCFTA), restrictions d\'exportation',
    sourcesHint: 'Reuters, Bloomberg, Lloyd\'s List, Financial Times, Wall Street Journal, CNBC',
  },
  'regional-business-events': {
    regionContext: 'événements économiques MONDIAUX ayant un impact sur les affaires en Afrique et dans les marchés émergents',
    topicFocus: 'IDE et investissements majeurs, fusions-acquisitions internationales, réformes économiques, accords commerciaux bilatéraux, expansions d\'entreprises multinationales en Afrique/Asie/LATAM, crises bancaires, politiques monétaires des pays émergents',
    sourcesHint: 'Reuters, Bloomberg, Financial Times, RFI, Al Jazeera, The Economist, Africa Report',
  },
}

const DEFAULT_NEWS_ADAPTER: NewsAdapter = {
  regionContext: 'couverture mondiale avec impact sur les marchés émergents et l\'Afrique',
  topicFocus: 'développements géopolitiques, économiques et sectoriels majeurs à l\'échelle mondiale',
  sourcesHint: 'Reuters, Bloomberg, BBC World News, Financial Times',
}

// ─── Gemini response type ─────────────────────────────────────────────────────

interface NewsSignalItem {
  title: string
  summary: string
  severity: 'low' | 'medium' | 'high'
  region?: string
  source_hint?: string
  source_url?: string
}

// Wrapper object so parseGeminiJson (regex \{…\}) can extract the array
interface NewsSignalResponse {
  signals: NewsSignalItem[]
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-zàâéèêëîïôùûüç0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      },
      redirect: 'follow',
    })
    clearTimeout(timeout)
    if (!res.ok) return null

    // Only read the first 50KB to find the og:image meta tag (usually in <head>)
    const reader = res.body?.getReader()
    if (!reader) return null
    let html = ''
    const decoder = new TextDecoder()
    while (html.length < 50_000) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      // Early exit if we've passed the </head> tag
      if (html.includes('</head>')) break
    }
    reader.cancel().catch(() => {})

    // Multiple regex patterns to match og:image in various formats
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']og:image["']/i,
      /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
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

// ─── Main job ──────────────────────────────────────────────────────────────────

export async function runNewsSignalJob(): Promise<void> {
  const supabase = createWorkerSupabase()
  const now = new Date()
  const dedupWindow = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()

  // 1. Charger les canaux actifs
  const { data: channels, error: chErr } = await supabase
    .from('forecast_channels')
    .select('id, slug, name')
    .eq('is_active', true)

  if (chErr || !channels?.length) {
    console.log('[news-signal] Aucun canal actif trouvé.')
    return
  }

  // 2. Charger les titres des signaux récents pour déduplication
  const { data: recentSignals } = await supabase
    .from('forecast_signal_feed')
    .select('title')
    .eq('signal_type', 'news')
    .gt('created_at', dedupWindow)

  const recentFingerprints = new Set(
    (recentSignals ?? []).map((s: { title: string }) => titleFingerprint(s.title))
  )

  // 3. Traiter chaque canal
  let totalInserted = 0

  for (const channel of channels) {
    const adapter = CHANNEL_NEWS_ADAPTERS[channel.slug] ?? DEFAULT_NEWS_ADAPTER

    // Bug 2 fix: systemInstruction is passed via the options object (named property),
    // NOT as a raw string second argument. callGeminiWithSearch now supports it.
    const systemInstruction = [
      `Tu es un analyste senior en intelligence économique et géopolitique couvrant l'actualité MONDIALE pour le canal "${channel.name}".`,
      `Ta mission : identifier les événements mondiaux les plus significatifs des dernières 24-48h qui affectent les marchés, les entreprises et les décideurs économiques.`,
      `IMPORTANT : ne te limite PAS à l'Afrique. Couvre les événements MONDIAUX (USA, Europe, Chine, Moyen-Orient, Asie) et explique leur impact potentiel sur les marchés émergents et l'Afrique quand c'est pertinent.`,
      `Contexte : ${adapter.regionContext}.`,
      `Focus thématique : ${adapter.topicFocus}.`,
      `Sources de référence : ${adapter.sourcesHint}.`,
      `IMPORTANT : retourne UNIQUEMENT un objet JSON valide avec une clé "signals", sans markdown ni texte autour.`,
    ].join('\n')

    // Bug 1 fix: prompt asks for {"signals":[...]} wrapper object so parseGeminiJson
    // (which uses the regex \{[\s\S]*\}) can extract it — bare arrays [..] are not matched.
    const prompt = [
      `Identifie les 3 développements MONDIAUX les plus importants et actionnables des dernières 24-48h pour le canal "${channel.name}".`,
      ``,
      `Critères de sélection :`,
      `- Événements d'envergure MONDIALE ou régionale ayant un impact économique concret`,
      `- Inclure au minimum 1 événement hors Afrique (USA, Europe, Moyen-Orient, Asie, LATAM)`,
      `- Basé sur des faits vérifiables récents (pas de rumeurs)`,
      `- Expliquer l'impact potentiel sur les marchés, les investisseurs et les entreprises`,
      ``,
      `Pour chaque développement, crée un objet avec ces champs :`,
      `- "title" : titre court et percutant (max 90 caractères)`,
      `- "summary" : explication de l'enjeu économique en 1-2 phrases (max 220 caractères)`,
      `- "severity" : "high" | "medium" | "low" selon l'impact potentiel`,
      `- "region" : région géographique principale concernée (ex: "Afrique de l'Ouest", "Mondial", "Sahel")`,
      `- "source_hint" : source/publication de référence principale`,
      `- "source_url" : URL directe vers l'article ou la source (le plus précis possible)`,
      ``,
      `Format attendu (objet JSON uniquement, sans markdown) :`,
      `{`,
      `  "signals": [`,
      `    {`,
      `      "title": "...",`,
      `      "summary": "...",`,
      `      "severity": "high",`,
      `      "region": "...",`,
      `      "source_hint": "...",`,
      `      "source_url": "https://..."`,
      `    }`,
      `  ]`,
      `}`,
    ].join('\n')

    try {
      // Bug 2 fix: pass systemInstruction as a named option, not a bare string
      // Bug 3 fix: destructure { text } — callGeminiWithSearch returns { text, sources, tokensUsed }
      const { text, sources: groundingSources } = await callGeminiWithSearch(prompt, { systemInstruction })

      const parsed = parseGeminiJson<NewsSignalResponse>(text)
      const signals: NewsSignalItem[] = parsed?.signals ?? []

      if (!signals.length) {
        console.log(`[news-signal] Canal ${channel.slug} — aucun signal parsé.`)
        continue
      }

      // 4. Filtrer doublons
      const filtered = signals.filter((s) => {
        if (!s.title || !s.summary) return false
        const fp = titleFingerprint(s.title)
        if (recentFingerprints.has(fp)) return false
        recentFingerprints.add(fp)
        return true
      })

      // 5. Enrichir avec image OG (en parallèle, max 3 signaux)
      const toInsert = await Promise.all(
        filtered.map(async (s) => {
          const url = s.source_url
            || groundingSources.find(gs => gs.url && gs.title)?.url
            || null

          const imageUrl = url ? await fetchOgImage(url) : null
          if (url) console.log(`[news-signal] OG image ${imageUrl ? '✓' : '✗'} pour ${url.slice(0, 60)}…`)

          return {
            channel_id:  channel.id,
            signal_type: 'news' as const,
            title:       s.title.slice(0, 120),
            summary:     s.summary.slice(0, 280),
            severity:    (['high', 'medium', 'low'] as const).includes(s.severity) ? s.severity : 'medium',
            data: {
              region:            s.region      ?? null,
              source_hint:       s.source_hint ?? null,
              source_url:        url,
              image_url:         imageUrl,
              grounding_sources: groundingSources.slice(0, 5).map(gs => ({ title: gs.title, url: gs.url })),
              channel_slug:      channel.slug,
              generated_by:      'gemini-news-signal',
            },
          }
        })
      )

      if (!toInsert.length) {
        console.log(`[news-signal] Canal ${channel.slug} — tous doublons, skip.`)
        continue
      }

      const { error: insertErr } = await supabase
        .from('forecast_signal_feed')
        .insert(toInsert)

      if (insertErr) {
        console.error(`[news-signal] Erreur insert canal ${channel.slug} :`, insertErr.message)
      } else {
        totalInserted += toInsert.length
        console.log(`[news-signal] Canal ${channel.slug} — ${toInsert.length} signal(s) insérés.`)
      }

    } catch (err) {
      console.error(`[news-signal] Erreur Gemini canal ${channel.slug} :`, err)
    }

    // Pause 2 secondes entre canaux pour respecter les rate limits Gemini
    await new Promise((r) => setTimeout(r, 2000))
  }

  console.log(`[news-signal] Terminé — ${totalInserted} signal(s) informatifs insérés.`)
}
