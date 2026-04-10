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
    regionContext: 'marchés mondiaux avec focus sur les économies émergentes et l\'Afrique subsaharienne',
    topicFocus: 'taux directeurs banques centrales, prix matières premières (pétrole, gaz, métaux, céréales), flux de capitaux, indicateurs macro (PMI, inflation), annonces budgétaires des ministères des finances africains',
    sourcesHint: 'Bloomberg, Reuters, Financial Times, CNBC, sites officiels des ministères des finances africains (mof.go.ke, treasury.gov.za, finances.gouv.sn, finance.gov.ng, mofep.gov.gh, minfi.gov.cm)',
  },
  'politics-policy': {
    regionContext: 'géopolitique africaine et mondiale — présidences, gouvernements et sécurité régionale',
    topicFocus: 'élections, décisions des présidences africaines, décrets présidentiels, accords diplomatiques inter-africains (UA, CEDEAO, EAC, SADC), déclarations officielles des chefs d\'État',
    sourcesHint: 'BBC World News, Al Jazeera, RFI, France 24, Reuters, sites officiels des présidences africaines (presidence.sn, statehouse.gov.ng, presidency.gov.za, president.go.ke, prc.cm, el-mouradia.dz)',
  },
  'tech-ai': {
    regionContext: 'technologie mondiale avec impact sur les marchés africains et l\'adoption numérique',
    topicFocus: 'lancement de produits IA, régulation numérique (EU AI Act, US), fintech Afrique, infrastructures télécoms, politiques numériques gouvernementales africaines',
    sourcesHint: 'Bloomberg, Financial Times, Reuters, presidency.gov.rw (Rwanda hub tech)',
  },
  'agriculture-risk': {
    regionContext: 'Afrique subsaharienne, Sahel, Afrique de l\'Est — production agricole et sécurité alimentaire',
    topicFocus: 'conditions météo extrêmes, prix des céréales (blé, maïs, riz, sorgho), rapports FAO/USDA, crises alimentaires, politiques agricoles des gouvernements africains',
    sourcesHint: 'FAO, Reuters, RFI, Al Jazeera, ministères de l\'agriculture africains, presidence.gov.mg (Madagascar/vanille)',
  },
  'climate': {
    regionContext: 'impact climatique sur l\'Afrique, transitions énergétiques et engagements internationaux',
    topicFocus: 'événements météo extrêmes, COP/accords climatiques, transition énergétique solaire Afrique, sécheresses/inondations, politiques énergétiques des présidences africaines',
    sourcesHint: 'BBC World News, Reuters, Euronews, France 24, op.gov.na (Namibie hydrogène vert)',
  },
  'logistics': {
    regionContext: 'routes commerciales mondiales, corridors logistiques africains et ports stratégiques',
    topicFocus: 'tensions maritimes (Mer Rouge, Bab-el-Mandeb, Suez), ports africains (Djibouti, Mombasa, Dar-es-Salam, Cotonou, Lomé, Durban), corridors CFTA, prix fret, délais douaniers',
    sourcesHint: 'Reuters, Bloomberg, Lloyd\'s List, presidence.dj (Djibouti hub logistique)',
  },
  'regional-business-events': {
    regionContext: 'économies régionales africaines — Afrique de l\'Ouest, Centrale, de l\'Est, du Nord, Australe',
    topicFocus: 'investissements directs, annonces des présidences et primatures africaines, réformes économiques, IDE, partenariats commerciaux, plans de développement nationaux',
    sourcesHint: 'RFI, Al Jazeera, France 24, Reuters Africa, presidence.ci (Côte d\'Ivoire), statehouse.gov.ng (Nigeria), presidency.gov.za (Afrique du Sud), pmo.gov.et (Éthiopie)',
  },
}

const DEFAULT_NEWS_ADAPTER: NewsAdapter = {
  regionContext: 'marchés émergents et Afrique subsaharienne',
  topicFocus: 'développements économiques, politiques et sectoriels significatifs',
  sourcesHint: 'Reuters, BBC World News, RFI',
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
      `Tu es un analyste senior en intelligence économique spécialisé dans la surveillance des actualités pour le canal "${channel.name}".`,
      `Ta mission : identifier les développements les plus significatifs des dernières 24-48h dans ton domaine.`,
      `Contexte géographique prioritaire : ${adapter.regionContext}.`,
      `Focus thématique : ${adapter.topicFocus}.`,
      `Sources de référence : ${adapter.sourcesHint}.`,
      `IMPORTANT : retourne UNIQUEMENT un objet JSON valide avec une clé "signals", sans markdown ni texte autour.`,
    ].join('\n')

    // Bug 1 fix: prompt asks for {"signals":[...]} wrapper object so parseGeminiJson
    // (which uses the regex \{[\s\S]*\}) can extract it — bare arrays [..] are not matched.
    const prompt = [
      `Identifie les 3 développements les plus importants et actionnables des dernières 24-48h pour le canal "${channel.name}".`,
      ``,
      `Critères de sélection :`,
      `- Significatif pour les acteurs économiques (décisions d'investissement, gestion du risque)`,
      `- Basé sur des faits vérifiables récents (pas de rumeurs)`,
      `- Pertinent pour la région : ${adapter.regionContext}`,
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

      // 4. Filtrer doublons + préparer rows
      const toInsert = signals
        .filter((s) => {
          if (!s.title || !s.summary) return false
          const fp = titleFingerprint(s.title)
          if (recentFingerprints.has(fp)) return false
          recentFingerprints.add(fp)
          return true
        })
        .map((s) => {
          // Priorité : URL fournie par Gemini > première URL du grounding Google
          const url = s.source_url
            || groundingSources.find(gs => gs.url && gs.title)?.url
            || null

          return {
            channel_id:  channel.id,
            signal_type: 'news' as const,
            title:       s.title.slice(0, 120),
            summary:     s.summary.slice(0, 280),
            severity:    (['high', 'medium', 'low'] as const).includes(s.severity) ? s.severity : 'medium',
            data: {
              region:           s.region      ?? null,
              source_hint:      s.source_hint ?? null,
              source_url:       url,
              grounding_sources: groundingSources.slice(0, 5).map(gs => ({ title: gs.title, url: gs.url })),
              channel_slug:     channel.slug,
              generated_by:     'gemini-news-signal',
            },
          }
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
