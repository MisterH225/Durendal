/**
 * Génère automatiquement des événements + questions « chaudes ».
 * Utilisé par le worker PM2 et par la route GET /api/cron/forecast-questions.
 *
 * Chaque cycle : sélectionne 2-3 canaux ALÉATOIRES parmi les actifs,
 * génère 1-2 événement(s) + 2 questions par canal sélectionné.
 * Résultat : diversité thématique naturelle d'un cycle à l'autre.
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const DEDUP_DAYS = 7
const MAX_EVENTS_PER_CHANNEL = 2
const MAX_QUESTIONS_PER_EVENT = 2
const CHANNELS_PER_CYCLE = 3

async function columnExists(supabase: SupabaseClient, table: string, column: string): Promise<boolean> {
  const { data } = await supabase.from(table).select(column).limit(0)
  return data !== null
}

export type QuestionGeneratorRunResult = {
  createdEvents: number
  createdQuestions: number
  skippedNoChannels: boolean
  channelsConsidered: number
  channelsSelected: string[]
  channelLoadError?: string
}

export async function runQuestionGenerator(supabase: SupabaseClient): Promise<QuestionGeneratorRunResult> {
  const { data: allChannels, error: chErr } = await supabase
    .from('forecast_channels')
    .select('id, slug, name')
    .eq('is_active', true)
    .order('sort_order')

  if (chErr || !allChannels?.length) {
    console.log('[question-generator] Aucun canal actif.')
    return {
      createdEvents: 0,
      createdQuestions: 0,
      skippedNoChannels: true,
      channelsConsidered: 0,
      channelsSelected: [],
      channelLoadError: chErr?.message,
    }
  }

  // Sélectionner 2-3 canaux aléatoires pour ce cycle
  const selected = shuffle(allChannels).slice(0, Math.min(CHANNELS_PER_CYCLE, allChannels.length))
  console.log(`[question-generator] Canaux sélectionnés : ${selected.map(c => c.slug).join(', ')}`)

  // Vérifier si la colonne image_url existe (migration 026 peut ne pas être appliquée)
  const hasImageCol = await columnExists(supabase, 'forecast_questions', 'image_url')

  const since = new Date(Date.now() - DEDUP_DAYS * 86_400_000).toISOString()

  let createdEvents = 0
  let createdQuestions = 0

  for (const channel of selected) {
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
      ``,
      `RÈGLE ABSOLUE : ta réponse doit être EXCLUSIVEMENT du JSON valide.`,
      `PAS de texte avant, PAS de texte après, PAS d'explication, PAS de raisonnement.`,
      `Commence directement par { et termine par }.`,
      ``,
      `Identifie 2 à 3 sujets d'actualité brûlante (24–72h). Pour chaque sujet :`,
      `  - un événement avec une description DÉTAILLÉE (4-6 phrases : contexte factuel, chiffres clés, enjeux, parties prenantes, timeline)`,
      `  - 2 à 3 questions OUI/NON très lisibles`,
      `  - chaque question doit avoir une "description" riche (3-5 phrases) : contexte spécifique, données factuelles vérifiables, pourquoi c'est pertinent`,
      `  - chaque question doit inclure "ai_initial_probability" (float 0.01-0.99) basée sur les données factuelles`,
      `  - si possible, inclure "image_url" : URL d'une image réelle publiée par une agence de presse (Reuters, AFP, BBC, etc.) en rapport direct avec le sujet. Si tu n'as pas d'URL fiable, OMETS le champ.`,
    ].join('\n')

    const prompt = [
      `Canal "${channel.name}" : retourne un JSON de forme :`,
      `{`,
      `  "events": [`,
      `    {`,
      `      "title": "Titre court de l'événement",`,
      `      "slug": "evenement-slug-2026",`,
      `      "description": "Description DÉTAILLÉE (4-6 phrases). Contexte factuel, chiffres, acteurs principaux, enjeux. Citer des sources.",`,
      `      "questions": [`,
      `        {`,
      `          "title": "Question OUI/NON lisible et engageante ?",`,
      `          "description": "3-5 phrases. Contexte factuel, dates, chiffres, parties prenantes.",`,
      `          "close_date_days": 14,`,
      `          "resolution_source": "Reuters, BBC, déclarations officielles",`,
      `          "resolution_criteria": "OUI si [condition précise et mesurable]. NON si [condition opposée].",`,
      `          "resolution_url": "https://www.reuters.com/...",`,
      `          "slug_hint": "slug-court",`,
      `          "image_url": "https://...",`,
      `          "ai_initial_probability": 0.62`,
      `        }`,
      `      ]`,
      `    }`,
      `  ]`,
      `}`,
      ``,
      `Contraintes :`,
      `- 2 ou 3 événements ; chaque événement : 2 ou 3 questions`,
      `- close_date_days entre 7 et 45`,
      `- Descriptions factuelles, détaillées et vérifiables`,
      `- resolution_criteria PRÉCIS et mesurable`,
      `- ai_initial_probability basée sur des faits, pas de l'intuition`,
      `- image_url : uniquement des URLs HTTPS réelles de médias. Si indisponible, omets le champ`,
    ].join('\n')

    try {
      const { text } = await callGeminiWithSearch(prompt, {
        systemInstruction,
        maxOutputTokens: 8000,
      })

      if (!text || text.trim().length === 0) {
        console.warn(`[question-generator] Canal ${channel.slug} — réponse Gemini vide.`)
        continue
      }
      console.log(`[question-generator] Canal ${channel.slug} — réponse Gemini (${text.length} chars) : ${text.slice(0, 300)}…`)

      const parsed = parseGeminiJson<GeneratorResponse>(text)
      const rawEvents = parsed?.events ?? []

      if (!rawEvents.length) {
        console.warn(`[question-generator] Canal ${channel.slug} — aucun événement parsé. Début réponse brute : ${text.slice(0, 500)}`)
        continue
      }

      const eventsSlice = rawEvents.slice(0, MAX_EVENTS_PER_CHANNEL)

      for (const ev of eventsSlice) {
        if (!ev.title || !ev.slug || !ev.questions?.length) continue

        const eventSlug = slugify(`auto-${channel.slug}-${ev.slug}-${crypto.randomUUID().slice(0, 6)}`)

        const { data: evRow, error: evErr } = await supabase
          .from('forecast_events')
          .insert({
            channel_id: channel.id,
            slug: eventSlug,
            title: ev.title.slice(0, 200),
            description: ev.description?.slice(0, 2000) ?? null,
            status: 'active',
            tags: ['auto-hot-topic', channel.slug],
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
            console.log(`[question-generator] Skip doublon : ${fp.slice(0, 40)}…`)
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

          // Seulement si la colonne existe (migration 026)
          if (hasImageCol && q.image_url && q.image_url.startsWith('https://')) {
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

            // Enqueue AI forecast pour remplir les jauges rapidement
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

  console.log(`[question-generator] Terminé — ${createdEvents} événement(s), ${createdQuestions} question(s) ouvertes. Canaux: ${selected.map(c => c.slug).join(', ')}`)

  return {
    createdEvents,
    createdQuestions,
    skippedNoChannels: false,
    channelsConsidered: allChannels.length,
    channelsSelected: selected.map(c => c.slug),
  }
}
