/**
 * Génère automatiquement des événements + questions de prévision « chaudes »
 * par canal (actualités du moment), style binaire type Polymarket/Metaculus.
 *
 * Pipeline :
 *   1. Par canal actif, Gemini + Search identifie UN sujet d'actualité majeur
 *   2. Création d'un forecast_event (tags: auto, hot-topic)
 *   3. Création de 1–2 forecast_questions en brouillon (admin publie)
 */

import { createWorkerSupabase } from '../../supabase'
import { callGeminiWithSearch, parseGeminiJson } from '../../../../../lib/ai/gemini'

interface HotQuestionItem {
  title: string
  slug_hint: string
  close_date_days: number
  resolution_source: string
  resolution_criteria: string
  resolution_url?: string
}

interface HotEventItem {
  event_title: string
  event_slug_hint: string
  event_description?: string
  tags?: string[]
  questions: HotQuestionItem[]
}

interface HotTopicsResponse {
  events: HotEventItem[]
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

export async function runHotTopicsQuestionsJob(): Promise<void> {
  const supabase = createWorkerSupabase()

  const { data: channels, error: chErr } = await supabase
    .from('forecast_channels')
    .select('id, slug, name')
    .eq('is_active', true)
    .order('sort_order')

  if (chErr || !channels?.length) {
    console.log('[hot-topics] Aucun canal actif.')
    return
  }

  const { data: recentEvents } = await supabase
    .from('forecast_events')
    .select('id, title, slug, channel_id, created_at, tags')
    .contains('tags', ['auto-hot-topic'])
    .gt('created_at', new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString())

  const recentFingerprints = new Set(
    (recentEvents ?? []).map((e: { title: string }) => titleFingerprint(e.title)),
  )

  let createdEvents = 0
  let createdQuestions = 0

  for (const channel of channels) {
    const systemInstruction = [
      `Tu es un rédacteur senior pour une plateforme de prévision collective (style Metaculus, sans paris).`,
      `Canal thématique : "${channel.name}" (slug: ${channel.slug}).`,
      `Ta mission : identifier UN sujet d'actualité brûlante des dernières 24–72h (géopolitique, marchés, tech, climat, etc.)`,
      `qui mérite un « board » d'événement avec des questions OUI/NON claires pour le grand public.`,
      `Les titres de questions doivent être en français, engageants, commençant souvent par « Pensez-vous que… ».`,
      `Chaque question doit être résolvable objectivement par des sources vérifiables (presse majeure, institutions).`,
      `Retourne UNIQUEMENT un JSON valide avec une clé "events" : un tableau d'UN seul élément (un événement) contenant 1 ou 2 questions maximum.`,
    ].join('\n')

    const prompt = [
      `Pour le canal "${channel.name}", propose UN événement d'actualité et 1 à 2 questions de prévision binaires (oui/non).`,
      ``,
      `Exemples de style pour les questions :`,
      `- « Pensez-vous que le cessez-le-feu entre les États-Unis et l'Iran sera respecté dans les deux semaines à venir ? »`,
      `- « Pensez-vous que les États-Unis engageront des actions militaires au sol en Iran dans les quatre semaines à venir ? »`,
      ``,
      `Contraintes :`,
      `- Sujet réellement dans l'actualité récente (vérifiable via recherche).`,
      `- close_date_days : entier entre 7 et 45 (horizon de résolution).`,
      `- resolution_criteria : préciser ce qui compte comme Oui vs Non (factuel).`,
      `- resolution_source : ex. « Reuters, AFP, BBC, déclarations officielles des gouvernements concernés ».`,
      `- slug_hint : court, sans espaces, ASCII (sera préfixé côté serveur).`,
      ``,
      `Format JSON strict (pas de markdown) :`,
      `{`,
      `  "events": [`,
      `    {`,
      `      "event_title": "Titre court de l'événement thématique",`,
      `      "event_slug_hint": "ex-iran-usa-tensions",`,
      `      "event_description": "1-2 phrases de contexte",`,
      `      "tags": ["tag1", "tag2"],`,
      `      "questions": [`,
      `        {`,
      `          "title": "Pensez-vous que … ?",`,
      `          "slug_hint": "question-courte",`,
      `          "close_date_days": 14,`,
      `          "resolution_source": "…",`,
      `          "resolution_criteria": "Oui si … Non si …",`,
      `          "resolution_url": "https://..."`,
      `        }`,
      `      ]`,
      `    }`,
      `  ]`,
      `}`,
    ].join('\n')

    try {
      const { text } = await callGeminiWithSearch(prompt, { systemInstruction })
      const parsed = parseGeminiJson<HotTopicsResponse>(text)
      const events = parsed?.events ?? []
      const bundle = events[0]

      if (!bundle?.event_title || !bundle.questions?.length) {
        console.log(`[hot-topics] Canal ${channel.slug} — rien de parsé.`)
        continue
      }

      const fp = titleFingerprint(bundle.event_title)
      if (recentFingerprints.has(fp)) {
        console.log(`[hot-topics] Canal ${channel.slug} — doublon récent (fingerprint), skip.`)
        continue
      }
      recentFingerprints.add(fp)

      const uid = crypto.randomUUID().slice(0, 8)
      const eventSlug = slugify(`auto-${channel.slug}-${bundle.event_slug_hint}-${uid}`)
      const eventTags = ['auto-hot-topic', ...(bundle.tags ?? []).map((t) => t.slice(0, 40))].slice(0, 12)

      const { data: evRow, error: evErr } = await supabase
        .from('forecast_events')
        .insert({
          channel_id: channel.id,
          slug: eventSlug,
          title: bundle.event_title.slice(0, 200),
          description: bundle.event_description?.slice(0, 2000) ?? null,
          status: 'active',
          tags: eventTags,
        })
        .select('id')
        .single()

      if (evErr || !evRow) {
        console.error(`[hot-topics] Insert événement ${channel.slug}:`, evErr?.message)
        continue
      }

      createdEvents += 1

      const now = Date.now()
      for (const q of bundle.questions.slice(0, 2)) {
        if (!q.title || !q.resolution_source || !q.resolution_criteria) continue
        const days = Math.min(45, Math.max(7, Number(q.close_date_days) || 14))
        const closeDate = new Date(now + days * 86_400_000).toISOString()
        const qSlug = slugify(`auto-${channel.slug}-${q.slug_hint}-${crypto.randomUUID().slice(0, 6)}`)

        const { error: qErr } = await supabase.from('forecast_questions').insert({
          event_id: evRow.id,
          channel_id: channel.id,
          slug: qSlug,
          title: q.title.slice(0, 240),
          description: null,
          close_date: closeDate,
          resolution_source: q.resolution_source.slice(0, 500),
          resolution_criteria: q.resolution_criteria.slice(0, 4000),
          resolution_url: q.resolution_url?.slice(0, 2000) ?? null,
          status: 'draft',
          tags: ['auto', channel.slug],
          featured: false,
        })

        if (qErr) {
          console.error(`[hot-topics] Insert question ${channel.slug}:`, qErr.message)
        } else {
          createdQuestions += 1
        }
      }

      console.log(`[hot-topics] Canal ${channel.slug} — événement + questions créés (brouillon).`)
    } catch (err) {
      console.error(`[hot-topics] Erreur canal ${channel.slug}:`, err)
    }

    await new Promise((r) => setTimeout(r, 2500))
  }

  console.log(`[hot-topics] Terminé — ${createdEvents} événement(s), ${createdQuestions} question(s) brouillon.`)
}
