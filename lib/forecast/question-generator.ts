/**
 * Génère automatiquement des événements + questions « chaudes » par canal.
 * Utilisé par le worker PM2 et par la route GET /api/cron/forecast-questions.
 *
 * - Déduplication : empreinte du titre de question sur 7 jours (par canal)
 * - created_by : null (source IA côté admin)
 * - status : open (visible public + admin avec clé anon si RLS le permet)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callGeminiWithSearch, parseGeminiJson } from '../ai/gemini'

interface GeneratedQuestion {
  title: string
  description?: string
  close_date_days: number
  resolution_source: string
  resolution_criteria: string
  resolution_url?: string
  slug_hint?: string
  image_url?: string
  ai_initial_probability?: number
}

interface GeneratedEvent {
  title: string
  slug: string
  description?: string
  questions: GeneratedQuestion[]
}

interface GeneratorResponse {
  events: GeneratedEvent[]
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-zàâéèêëîïôùûüç0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
}

const DEDUP_DAYS = 7
const MAX_EVENTS_PER_CHANNEL = 2
const MAX_QUESTIONS_PER_EVENT = 2

export type QuestionGeneratorRunResult = {
  createdEvents: number
  createdQuestions: number
  skippedNoChannels: boolean
  channelsConsidered: number
  channelLoadError?: string
}

export async function runQuestionGenerator(supabase: SupabaseClient): Promise<QuestionGeneratorRunResult> {
  const { data: channels, error: chErr } = await supabase
    .from('forecast_channels')
    .select('id, slug, name')
    .eq('is_active', true)
    .order('sort_order')

  if (chErr || !channels?.length) {
    console.log('[question-generator] Aucun canal actif.')
    return {
      createdEvents: 0,
      createdQuestions: 0,
      skippedNoChannels: true,
      channelsConsidered: 0,
      channelLoadError: chErr?.message,
    }
  }

  const since = new Date(Date.now() - DEDUP_DAYS * 86_400_000).toISOString()

  let createdEvents = 0
  let createdQuestions = 0

  for (const channel of channels) {
    const { data: recentQs } = await supabase
      .from('forecast_questions')
      .select('title')
      .eq('channel_id', channel.id)
      .contains('tags', ['auto'])
      .gt('created_at', since)

    const recentQFp = new Set(
      (recentQs ?? []).map((q: { title: string }) => titleFingerprint(q.title)),
    )

    const systemInstruction = [
      `Tu es rédacteur senior pour une plateforme de prévision collective (sans paris).`,
      `Canal : "${channel.name}" (slug: ${channel.slug}).`,
      `Identifie 2 à 3 sujets d'actualité brûlante (24–72h). Pour chaque sujet :`,
      `  - un événement avec une description DÉTAILLÉE (4-6 phrases : contexte factuel, chiffres clés, enjeux, parties prenantes, timeline)`,
      `  - 2 à 3 questions OUI/NON très lisibles (style : « Le cessez-le-feu … sera-t-il respecté dans les 2 prochaines semaines ? »)`,
      `  - chaque question doit avoir une "description" riche (3-5 phrases) expliquant le contexte spécifique, les données factuelles vérifiables, et pourquoi la question est pertinente`,
      `  - chaque question doit inclure "ai_initial_probability" (float 0.01-0.99) : ta meilleure estimation initiale basée sur les données factuelles disponibles`,
      `  - si possible, inclure "image_url" : URL d'une image réelle publiée par une agence de presse ou un média de référence en rapport avec le sujet (pas d'image générée par IA)`,
      `JSON uniquement, clé racine "events", sans markdown ni commentaires.`,
    ].join('\n')

    const prompt = [
      `Canal "${channel.name}" : retourne un JSON de forme :`,
      `{`,
      `  "events": [`,
      `    {`,
      `      "title": "Titre court de l'événement",`,
      `      "slug": "evenement-slug-2026",`,
      `      "description": "Description DÉTAILLÉE de l'événement (4-6 phrases). Inclure : contexte géopolitique/économique, chiffres clés récents, acteurs principaux, enjeux concrets. Être factuel, citer des sources quand possible.",`,
      `      "questions": [`,
      `        {`,
      `          "title": "Le cessez-le-feu USA-Iran sera-t-il respecté dans les 2 prochaines semaines ?",`,
      `          "description": "Description enrichie (3-5 phrases). Contexte factuel : quand le cessez-le-feu a été annoncé, par qui, quelles sont les conditions, quels incidents récents menacent l'accord. Citer des chiffres ou dates précises.",`,
      `          "close_date_days": 14,`,
      `          "resolution_source": "Reuters, BBC, Al Jazeera, déclarations officielles des ministères des Affaires étrangères",`,
      `          "resolution_criteria": "OUI si aucune opération militaire majeure (frappe aérienne, offensive terrestre) n'est rapportée par au moins 2 agences de presse internationales durant la période. NON si une telle opération est confirmée.",`,
      `          "resolution_url": "https://www.reuters.com/...",`,
      `          "slug_hint": "usa-iran-ceasefire-2w",`,
      `          "image_url": "https://example.com/photo-from-reuters.jpg",`,
      `          "ai_initial_probability": 0.62`,
      `        }`,
      `      ]`,
      `    }`,
      `  ]`,
      `}`,
      ``,
      `IMPORTANT :`,
      `- 2 ou 3 entrées dans "events" ; chaque événement : 2 ou 3 questions`,
      `- close_date_days entre 7 et 45 ; slugs ASCII courts et uniques sémantiquement`,
      `- Les descriptions (événement ET questions) doivent être factuelles, détaillées et vérifiables`,
      `- resolution_criteria doit être PRÉCIS et mesurable (pas vague)`,
      `- resolution_source doit lister des sources concrètes (noms de médias, institutions)`,
      `- ai_initial_probability : base ton estimation sur les données factuelles, pas sur l'intuition`,
      `- image_url : uniquement des URLs d'images de médias réels (Reuters, AFP, BBC, etc.). Si tu n'en as pas, omets le champ`,
    ].join('\n')

    try {
      const { text } = await callGeminiWithSearch(prompt, { systemInstruction })
      const parsed = parseGeminiJson<GeneratorResponse>(text)
      const rawEvents = parsed?.events ?? []

      if (!rawEvents.length) {
        console.log(`[question-generator] Canal ${channel.slug} — aucun événement parsé.`)
        continue
      }

      const eventsSlice = rawEvents.slice(0, MAX_EVENTS_PER_CHANNEL)

      for (const ev of eventsSlice) {
        if (!ev.title || !ev.slug || !ev.questions?.length) continue

        const eventSlug = slugify(`auto-${channel.slug}-${ev.slug}-${crypto.randomUUID().slice(0, 6)}`)
        const eventTags = ['auto-hot-topic', channel.slug]

        const { data: evRow, error: evErr } = await supabase
          .from('forecast_events')
          .insert({
            channel_id: channel.id,
            slug: eventSlug,
            title: ev.title.slice(0, 200),
            description: ev.description?.slice(0, 2000) ?? null,
            status: 'active',
            tags: eventTags,
          })
          .select('id')
          .single()

        if (evErr || !evRow) {
          console.error(`[question-generator] Événement ${channel.slug}:`, evErr?.message)
          continue
        }
        createdEvents += 1

        const now = Date.now()
        const qs = ev.questions.slice(0, MAX_QUESTIONS_PER_EVENT)

        for (const q of qs) {
          if (!q.title || !q.resolution_source || !q.resolution_criteria) continue
          const fp = titleFingerprint(q.title)
          if (recentQFp.has(fp)) {
            console.log(`[question-generator] Skip doublon question : ${fp.slice(0, 40)}…`)
            continue
          }
          recentQFp.add(fp)

          const days = Math.min(45, Math.max(7, Number(q.close_date_days) || 14))
          const closeDate = new Date(now + days * 86_400_000).toISOString()
          const hint = q.slug_hint ? slugify(q.slug_hint) : slugify(q.title)
          const qSlug = slugify(`auto-${channel.slug}-${hint}-${crypto.randomUUID().slice(0, 5)}`)

          const aiInitProb = typeof q.ai_initial_probability === 'number'
            ? Math.max(0.01, Math.min(0.99, q.ai_initial_probability))
            : null

          const insertRow: Record<string, unknown> = {
            event_id: evRow.id,
            channel_id: channel.id,
            slug: qSlug,
            title: q.title.slice(0, 240),
            description: q.description?.slice(0, 4000) ?? null,
            close_date: closeDate,
            resolution_source: q.resolution_source.slice(0, 500),
            resolution_criteria: q.resolution_criteria.slice(0, 4000),
            resolution_url: q.resolution_url?.slice(0, 2000) ?? null,
            status: 'open',
            tags: ['auto', channel.slug],
            featured: false,
            created_by: null,
            ai_probability: aiInitProb,
            blended_probability: aiInitProb,
          }
          if (q.image_url && q.image_url.startsWith('https://')) {
            insertRow.image_url = q.image_url.slice(0, 2000)
          }

          const { data: qRow, error: qErr } = await supabase
            .from('forecast_questions')
            .insert(insertRow)
            .select('id')
            .single()

          if (qErr || !qRow) {
            console.error(`[question-generator] Question ${channel.slug}:`, qErr?.message)
          } else {
            createdQuestions += 1

            // Enqueue an AI forecast so jauges fill up quickly
            await supabase.from('forecast_event_queue').insert({
              event_type: 'forecast.ai.forecast.requested',
              correlation_id: qRow.id,
              payload: {
                id: crypto.randomUUID(),
                type: 'forecast.ai.forecast.requested',
                occurredAt: new Date().toISOString(),
                correlationId: qRow.id,
                producer: 'worker',
                version: 1,
                payload: {
                  questionId: qRow.id,
                  channelSlug: channel.slug,
                  requestedBy: 'scheduler',
                  force: false,
                },
              },
              status: 'pending',
              attempts: 0,
              max_attempts: 3,
              available_at: new Date(Date.now() + createdQuestions * 2 * 60_000).toISOString(),
            }).then(({ error: eqErr }) => {
              if (eqErr) console.error(`[question-generator] Queue AI forecast:`, eqErr.message)
            })
          }
        }
      }

      console.log(`[question-generator] Canal ${channel.slug} — traité.`)
    } catch (err) {
      console.error(`[question-generator] Erreur canal ${channel.slug}:`, err)
    }

    await new Promise((r) => setTimeout(r, 3000))
  }

  console.log(`[question-generator] Terminé — ${createdEvents} événement(s), ${createdQuestions} question(s) ouvertes.`)

  return {
    createdEvents,
    createdQuestions,
    skippedNoChannels: false,
    channelsConsidered: channels.length,
  }
}
