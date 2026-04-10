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
 *   4. Filtrer les doublons (< 4h) sur (channel_id + title hash)
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
    regionContext: 'marchés mondiaux avec focus sur les économies émergentes et l\'Afrique subsaharienne',
    topicFocus: 'taux directeurs banques centrales, prix matières premières (pétrole, gaz, métaux, céréales), flux de capitaux, indicateurs macro (PMI, inflation)',
    sourcesHint: 'Bloomberg, Reuters, Financial Times, CNBC',
  },
  'politics-policy': {
    regionContext: 'géopolitique mondiale avec focus Afrique, Moyen-Orient et relations Europe-Afrique',
    topicFocus: 'élections, décisions de politique étrangère, sanctions, accords diplomatiques, instabilité politique',
    sourcesHint: 'BBC World News, Al Jazeera, RFI, France 24, Reuters',
  },
  'tech-ai': {
    regionContext: 'technologie mondiale avec impact sur les marchés africains et l\'adoption numérique',
    topicFocus: 'lancement de produits IA, régulation numérique (EU AI Act, US), fintech Afrique, infrastructures télécoms',
    sourcesHint: 'Bloomberg, Financial Times, Reuters',
  },
  'agriculture-risk': {
    regionContext: 'Afrique subsaharienne, Sahel, Afrique de l\'Est — production agricole et sécurité alimentaire',
    topicFocus: 'conditions météo extrêmes, prix des céréales (blé, maïs, riz, sorgho), rapports FAO/USDA, crises alimentaires',
    sourcesHint: 'FAO, Reuters, RFI, Al Jazeera',
  },
  'climate': {
    regionContext: 'impact climatique sur l\'Afrique, transitions énergétiques et engagements internationaux',
    topicFocus: 'événements météo extrêmes, COP/accords climatiques, transition énergétique solaire Afrique, sécheresses/inondations',
    sourcesHint: 'BBC World News, Reuters, Euronews, France 24',
  },
  'logistics': {
    regionContext: 'routes commerciales mondiales et corridors logistiques africains',
    topicFocus: 'tensions maritimes (Mer Rouge, Suez), ports africains, corridors CFTA, prix fret, délais douaniers',
    sourcesHint: 'Reuters, Bloomberg, Lloyd\'s List',
  },
  'regional-business-events': {
    regionContext: 'économies régionales africaines — Afrique de l\'Ouest, Centrale, de l\'Est, du Nord',
    topicFocus: 'investissements directs, annonces entreprises locales, réformes économiques nationales, IDE, partenariats commerciaux',
    sourcesHint: 'RFI, Al Jazeera, France 24, Reuters Africa',
  },
}

const DEFAULT_NEWS_ADAPTER: NewsAdapter = {
  regionContext: 'marchés émergents et Afrique subsaharienne',
  topicFocus: 'développements économiques, politiques et sectoriels significatifs',
  sourcesHint: 'Reuters, BBC World News, RFI',
}

// ─── Structured output ────────────────────────────────────────────────────────

interface NewsSignalItem {
  title: string
  summary: string
  severity: 'low' | 'medium' | 'high'
  region?: string
  source_hint?: string
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Génère un fingerprint court pour détecter les doublons proches */
function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-zàâéèêëîïôùûüç0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

// ─── Main job ──────────────────────────────────────────────────────────────────

export async function runNewsSignalJob(): Promise<void> {
  const supabase = createWorkerSupabase()
  const now = new Date()
  const dedupWindow = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString() // 4h

  // 1. Charger les canaux actifs
  const { data: channels, error: chErr } = await supabase
    .from('forecast_channels')
    .select('id, slug, name')
    .eq('is_active', true)

  if (chErr || !channels?.length) {
    console.log('[news-signal] Aucun canal actif trouvé.')
    return
  }

  // 2. Charger les titres des signaux récents pour déduplications
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

    const systemInstruction = `Tu es un analyste senior en intelligence économique spécialisé dans la surveillance des actualités pour le canal "${channel.name}".
Ta mission : identifier les développements les plus significatifs des dernières 24-48h dans ton domaine.
Contexte géographique prioritaire : ${adapter.regionContext}.
Focus thématique : ${adapter.topicFocus}.
Sources de référence : ${adapter.sourcesHint}.
IMPORTANT : retourne UNIQUEMENT un tableau JSON valide, sans markdown.`

    const prompt = `Identifie les 3 développements les plus importants et actionnables des dernières 24-48h pour le canal "${channel.name}".

Critères de sélection :
- Significatif pour les acteurs économiques (décisions d'investissement, gestion du risque)
- Basé sur des faits vérifiables récents (pas de rumeurs)
- Pertinent pour la région : ${adapter.regionContext}

Pour chaque développement, retourne un objet JSON avec ces champs :
- "title" : titre court et percutant (max 90 caractères)
- "summary" : explication de l'enjeu économique en 1-2 phrases (max 220 caractères)
- "severity" : "high" | "medium" | "low" selon l'impact potentiel
- "region" : région géographique principale concernée (ex: "Afrique de l'Ouest", "Mondial", "Sahel")
- "source_hint" : source/publication de référence principale

Format attendu (tableau JSON uniquement, sans markdown) :
[
  {
    "title": "...",
    "summary": "...",
    "severity": "high",
    "region": "...",
    "source_hint": "..."
  }
]`

    try {
      const raw = await callGeminiWithSearch(prompt, systemInstruction)
      const signals: NewsSignalItem[] = parseGeminiJson(raw)

      if (!Array.isArray(signals) || !signals.length) {
        console.log(`[news-signal] Canal ${channel.slug} — aucun signal parsé.`)
        continue
      }

      // 4. Filtrer doublons + préparer rows
      const toInsert = signals
        .filter((s) => {
          if (!s.title || !s.summary) return false
          const fp = titleFingerprint(s.title)
          if (recentFingerprints.has(fp)) return false
          recentFingerprints.add(fp)
          return true
        })
        .map((s) => ({
          channel_id:  channel.id,
          signal_type: 'news' as const,
          title:       s.title.slice(0, 120),
          summary:     s.summary.slice(0, 280),
          severity:    ['high', 'medium', 'low'].includes(s.severity) ? s.severity : 'medium',
          data: {
            region:      s.region ?? null,
            source_hint: s.source_hint ?? null,
            channel_slug: channel.slug,
            generated_by: 'gemini-news-signal',
          },
        }))

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
