/**
 * GET /api/cron/forecast-news
 *
 * Génère des signaux d'actualité pour tous les canaux actifs via Gemini Search Grounding.
 * Fonctionne directement (pas de queue worker) — utilisable depuis Hostinger cPanel cron
 * ou en appel manuel : GET /api/cron/forecast-news?secret=<CRON_SECRET>
 *
 * Timeout attendu : ~60-120s (7 canaux × 8-15s Gemini + pause inter-canal).
 * Sur Node.js (Hostinger), les routes Next.js n'ont pas de timeout HTTP forcé.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'

const CRON_SECRET = process.env.CRON_SECRET

// ─── Channel adapters ─────────────────────────────────────────────────────────

interface NewsAdapter {
  regionContext: string
  topicFocus: string
  sourcesHint: string
}

const CHANNEL_ADAPTERS: Record<string, NewsAdapter> = {
  'macro-commodities': {
    regionContext: 'marchés mondiaux avec focus sur les économies émergentes et l\'Afrique subsaharienne',
    topicFocus: 'taux directeurs banques centrales, prix matières premières (pétrole, gaz, métaux, céréales), indicateurs macro (PMI, inflation), annonces budgétaires des ministères des finances africains',
    sourcesHint: 'Bloomberg, Reuters, Financial Times, CNBC, mof.go.ke, treasury.gov.za, finances.gouv.sn, finance.gov.ng',
  },
  'politics-policy': {
    regionContext: 'géopolitique africaine et mondiale — présidences, gouvernements et sécurité régionale',
    topicFocus: 'élections, décisions des présidences africaines, accords diplomatiques (UA, CEDEAO, EAC, SADC), déclarations officielles des chefs d\'État',
    sourcesHint: 'BBC World News, Al Jazeera, RFI, France 24, Reuters, presidence.sn, statehouse.gov.ng, presidency.gov.za, president.go.ke',
  },
  'tech-ai': {
    regionContext: 'technologie mondiale avec impact sur les marchés africains et l\'adoption numérique',
    topicFocus: 'lancement de produits IA, régulation numérique (EU AI Act, US), fintech Afrique, infrastructures télécoms',
    sourcesHint: 'Bloomberg, Financial Times, Reuters, presidency.gov.rw',
  },
  'agriculture-risk': {
    regionContext: 'Afrique subsaharienne, Sahel, Afrique de l\'Est — production agricole et sécurité alimentaire',
    topicFocus: 'conditions météo extrêmes, prix céréales (blé, maïs, riz, sorgho), rapports FAO/USDA, crises alimentaires',
    sourcesHint: 'FAO, Reuters, RFI, Al Jazeera',
  },
  'climate': {
    regionContext: 'impact climatique sur l\'Afrique, transitions énergétiques et engagements internationaux',
    topicFocus: 'événements météo extrêmes, COP/accords climatiques, transition énergétique solaire Afrique, sécheresses/inondations',
    sourcesHint: 'BBC World News, Reuters, Euronews, France 24, op.gov.na',
  },
  'logistics': {
    regionContext: 'routes commerciales mondiales, corridors logistiques africains et ports stratégiques',
    topicFocus: 'tensions maritimes (Mer Rouge, Bab-el-Mandeb, Suez), ports africains, corridors CFTA, prix fret',
    sourcesHint: 'Reuters, Bloomberg, presidence.dj',
  },
  'regional-business-events': {
    regionContext: 'économies régionales africaines — Afrique de l\'Ouest, Centrale, de l\'Est, du Nord, Australe',
    topicFocus: 'investissements directs, annonces des présidences africaines, réformes économiques, IDE, partenariats commerciaux',
    sourcesHint: 'RFI, Al Jazeera, France 24, Reuters Africa, presidence.ci, statehouse.gov.ng, presidency.gov.za',
  },
}

const DEFAULT_ADAPTER: NewsAdapter = {
  regionContext: 'marchés émergents et Afrique subsaharienne',
  topicFocus: 'développements économiques, politiques et sectoriels significatifs',
  sourcesHint: 'Reuters, BBC World News, RFI',
}

interface NewsSignalItem {
  title: string
  summary: string
  severity: 'high' | 'medium' | 'low'
  region?: string
  source_hint?: string
}

interface NewsSignalResponse {
  signals: NewsSignalItem[]
}

function fingerprint(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9àâéèêëîïôùûüç]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')

  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const db  = createAdminClient()
  const now = new Date()
  const dedupWindow = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()

  // 1. Canaux actifs
  const { data: channels, error: chErr } = await db
    .from('forecast_channels')
    .select('id, slug, name')
    .eq('is_active', true)

  if (chErr || !channels?.length) {
    return NextResponse.json({ error: 'Aucun canal actif.', details: chErr?.message }, { status: 500 })
  }

  // 2. Fingerprints récents pour déduplications
  const { data: recentSignals } = await db
    .from('forecast_signal_feed')
    .select('title')
    .eq('signal_type', 'news')
    .gt('created_at', dedupWindow)

  const recentFps = new Set((recentSignals ?? []).map((s: { title: string }) => fingerprint(s.title)))

  // 3. Générer par canal
  const results: Record<string, number> = {}
  let totalInserted = 0

  for (const channel of channels) {
    const adapter = CHANNEL_ADAPTERS[channel.slug] ?? DEFAULT_ADAPTER

    const systemInstruction = [
      `Tu es un analyste senior en intelligence économique spécialisé pour le canal "${channel.name}".`,
      `Contexte géographique : ${adapter.regionContext}.`,
      `Focus thématique : ${adapter.topicFocus}.`,
      `Sources de référence : ${adapter.sourcesHint}.`,
      `Retourne UNIQUEMENT un objet JSON avec une clé "signals", sans markdown.`,
    ].join('\n')

    const prompt = [
      `Identifie les 3 développements les plus importants des dernières 24-48h pour le canal "${channel.name}".`,
      `Critères : significatif économiquement, fait vérifiable récent, pertinent pour : ${adapter.regionContext}.`,
      ``,
      `Format attendu (objet JSON, sans markdown) :`,
      `{`,
      `  "signals": [`,
      `    { "title": "...", "summary": "...", "severity": "high|medium|low", "region": "...", "source_hint": "..." }`,
      `  ]`,
      `}`,
      `- title : max 90 caractères`,
      `- summary : 1-2 phrases, max 220 caractères, focus sur l'enjeu économique`,
      `- severity : high = impact marché immédiat, medium = à surveiller, low = informatif`,
      `- region : zone géographique principale (ex: "Afrique de l'Ouest", "Mondial")`,
      `- source_hint : source principale (ex: "Reuters", "presidence.sn")`,
    ].join('\n')

    try {
      const { text } = await callGeminiWithSearch(prompt, { systemInstruction })
      const parsed = parseGeminiJson<NewsSignalResponse>(text)
      const signals: NewsSignalItem[] = parsed?.signals ?? []

      const toInsert = signals
        .filter(s => {
          if (!s.title || !s.summary) return false
          const fp = fingerprint(s.title)
          if (recentFps.has(fp)) return false
          recentFps.add(fp)
          return true
        })
        .map(s => ({
          channel_id:  channel.id,
          signal_type: 'news',
          title:       s.title.slice(0, 120),
          summary:     s.summary.slice(0, 280),
          severity:    (['high', 'medium', 'low'] as const).includes(s.severity) ? s.severity : 'medium',
          data: {
            region:       s.region      ?? null,
            source_hint:  s.source_hint ?? null,
            channel_slug: channel.slug,
            generated_by: 'gemini-news-signal',
          },
        }))

      if (toInsert.length) {
        const { error: insertErr } = await db.from('forecast_signal_feed').insert(toInsert)
        if (!insertErr) {
          totalInserted += toInsert.length
          results[channel.slug] = toInsert.length
        } else {
          results[channel.slug] = 0
          console.error(`[forecast-news] Insert error for ${channel.slug}:`, insertErr.message)
        }
      } else {
        results[channel.slug] = 0
      }
    } catch (err) {
      results[channel.slug] = -1
      console.error(`[forecast-news] Gemini error for ${channel.slug}:`, err)
    }

    // Pause entre canaux pour respecter les rate limits Gemini
    await new Promise(r => setTimeout(r, 1500))
  }

  return NextResponse.json({
    ok: true,
    totalInserted,
    channels: results,
    message: `${totalInserted} signaux générés pour ${channels.length} canaux.`,
  })
}
