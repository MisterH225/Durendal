/**
 * Génère automatiquement des événements + questions « chaudes » par canal.
 * Aligné sur le plan éditorial : 2–3 sujets / événements, questions binaires engageantes, publiées en `open`.
 *
 * - Déduplication : empreinte du titre de question sur 7 jours (par canal)
 * - created_by : null (source IA côté admin)
 */

import { createWorkerSupabase } from '../../supabase'
import { callGeminiWithSearch, parseGeminiJson } from '../../../../../lib/ai/gemini'

interface GeneratedQuestion {
  title: string
  description?: string
  close_date_days: number
  resolution_source: string
  resolution_criteria: string
  resolution_url?: string
  slug_hint?: string
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

export async function runQuestionGeneratorJob(): Promise<void> {
  const supabase = createWorkerSupabase()

  const { data: channels, error: chErr } = await supabase
    .from('forecast_channels')
    .select('id, slug, name')
    .eq('is_active', true)
    .order('sort_order')

  if (chErr || !channels?.length) {
    console.log('[question-generator] Aucun canal actif.')
    return
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
      `Tu es rédacteur pour une plateforme de prévision collective (sans paris).`,
      `Canal : "${channel.name}" (slug: ${channel.slug}).`,
      `Identifie 2 à 3 sujets d'actualité brûlante (24–72h) : guerre, épidémie, tech, macro, climat, etc.`,
      `Pour chaque sujet, un événement + 2 à 3 questions OUI/NON très lisibles (style : « Le cessez-le-feu … sera-t-il respecté dans les 2 prochaines semaines ? »).`,
      `JSON uniquement, clé racine "events", sans markdown.`,
    ].join('\n')

    const prompt = [
      `Canal "${channel.name}" : retourne un JSON de forme :`,
      `{`,
      `  "events": [`,
      `    {`,
      `      "title": "Guerre Iran-USA / Israël (exemple court)",`,
      `      "slug": "guerre-iran-usa-israel-2026",`,
      `      "description": "Contexte en 1-2 phrases.",`,
      `      "questions": [`,
      `        {`,
      `          "title": "Le cessez-le-feu USA-Iran sera-t-il respecté dans les 2 prochaines semaines ?",`,
      `          "description": "Contexte optionnel",`,
      `          "close_date_days": 14,`,
      `          "resolution_source": "Reuters, BBC, Al Jazeera, déclarations officielles",`,
      `          "resolution_criteria": "OUI si … NON si …",`,
      `          "resolution_url": "https://...",`,
      `          "slug_hint": "usa-iran-ceasefire-2w"`,
      `        }`,
      `      ]`,
      `    }`,
      `  ]`,
      `}`,
      ``,
      `Contraintes : 2 ou 3 entrées dans "events" ; chaque événement : 2 ou 3 questions ; close_date_days entre 7 et 45 ; slugs ASCII courts et uniques sémantiquement.`,
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

          const { error: qErr } = await supabase.from('forecast_questions').insert({
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
          })

          if (qErr) {
            console.error(`[question-generator] Question ${channel.slug}:`, qErr.message)
          } else {
            createdQuestions += 1
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
}
