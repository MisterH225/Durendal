/**
 * Génère automatiquement des événements + questions « chaudes ».
 * Utilisé par le worker PM2 et par la route GET /api/cron/forecast-questions.
 *
 * Chaque cycle : sélectionne 2-3 canaux avec le moins de questions récentes,
 * génère 1-2 événement(s) + 2 questions par canal.
 * ~30% des questions sont multi-choice, le reste binaire (OUI/NON).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callGeminiWithSearch, parseGeminiJson } from '../ai/gemini'

interface GeneratedOutcome {
  label: string
  ai_initial_probability: number
}

interface GeneratedQuestion {
  title: string
  description?: string
  question_type?: 'binary' | 'multi_choice'
  outcomes?: GeneratedOutcome[]
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

const OUTCOME_COLORS = ['#818cf8', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4']

interface RegionWeight {
  region_code: string
  label_fr: string
  label_en: string
  weight: number
}

function pickWeightedRegion(regions: RegionWeight[]): RegionWeight | null {
  const active = regions.filter(r => r.weight > 0)
  if (!active.length) return null
  const total = active.reduce((s, r) => s + r.weight, 0)
  let rand = Math.random() * total
  for (const r of active) {
    rand -= r.weight
    if (rand <= 0) return r
  }
  return active[active.length - 1]
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

  const recentCounts = new Map<string, number>()
  for (const ch of allChannels) recentCounts.set(ch.id, 0)

  const { data: recentByChannel } = await supabase
    .from('forecast_questions')
    .select('channel_id')
    .contains('tags', ['auto'])
    .gt('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString())

  for (const row of recentByChannel ?? []) {
    recentCounts.set(row.channel_id, (recentCounts.get(row.channel_id) ?? 0) + 1)
  }

  const ranked = shuffle(allChannels).sort((a, b) =>
    (recentCounts.get(a.id) ?? 0) - (recentCounts.get(b.id) ?? 0)
  )
  const selected = ranked.slice(0, Math.min(CHANNELS_PER_CYCLE, allChannels.length))
  console.log(`[question-generator] Canaux sélectionnés (rotation) : ${selected.map(c => `${c.slug}(${recentCounts.get(c.id) ?? 0})`).join(', ')}`)

  const hasImageCol = await columnExists(supabase, 'forecast_questions', 'image_url')
  const hasQuestionType = await columnExists(supabase, 'forecast_questions', 'question_type')
  const hasOutcomesTable = await columnExists(supabase, 'forecast_question_outcomes', 'id')
  const hasRegionCol = await columnExists(supabase, 'forecast_questions', 'region')

  // Load region weights for geographic content distribution
  const { data: regionWeightsRaw } = await supabase
    .from('forecast_region_weights')
    .select('region_code, label_fr, label_en, weight')
    .eq('is_active', true)
    .order('weight', { ascending: false })
  const regionWeights: RegionWeight[] = (regionWeightsRaw ?? []) as RegionWeight[]
  const hasRegionWeights = regionWeights.length > 0

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

    // Weighted region pick for this channel
    const pickedRegion = hasRegionWeights ? pickWeightedRegion(regionWeights) : null
    const regionLabel = pickedRegion?.label_fr ?? null
    const regionCode = pickedRegion?.region_code ?? null
    if (pickedRegion) {
      console.log(`[question-generator] Canal ${channel.slug} → région : ${pickedRegion.label_fr} (${pickedRegion.region_code})`)
    }

    const regionInstruction = regionLabel
      ? `\nRÉGION GÉOGRAPHIQUE PRINCIPALE pour cette génération : ${regionLabel}.\nLes événements et questions DOIVENT concerner cette région ou avoir un IMPACT DIRECT sur cette région.\nUtilise des sources et exemples de cette région en priorité.\n`
      : ''

    const systemInstruction = [
      `Tu es rédacteur senior pour une plateforme de prévision collective (sans paris).`,
      `Canal THÉMATIQUE : "${channel.name}" (slug: ${channel.slug}).`,
      ``,
      `RÈGLE CRITIQUE DE PERTINENCE THÉMATIQUE :`,
      `TOUS les événements et questions que tu génères DOIVENT être DIRECTEMENT liés à la thématique "${channel.name}".`,
      `NE GÉNÈRE JAMAIS un événement ou une question hors-sujet par rapport au canal "${channel.name}".`,
      `Exemples de respect thématique :`,
      `  - Canal "Macro & Commodities" → UNIQUEMENT macro-économie, matières premières, pétrole, taux, devises`,
      `  - Canal "Tech & IA" → UNIQUEMENT technologie, intelligence artificielle, startups tech`,
      `  - Canal "Art & Culture" → UNIQUEMENT art, culture, cinéma, musique, industries créatives, patrimoine`,
      `  - Canal "Politics & Policy" → UNIQUEMENT politique, géopolitique, élections, diplomatie`,
      `Un article sur le pétrole ou les conflits militaires N'A PAS SA PLACE dans un canal "Art & Culture".`,
      ``,
      regionInstruction,
      `RÈGLE ABSOLUE : ta réponse doit être EXCLUSIVEMENT du JSON valide.`,
      `PAS de texte avant, PAS de texte après, PAS d'explication, PAS de raisonnement.`,
      `Commence directement par { et termine par }.`,
      ``,
      `Identifie 2 à 3 sujets d'actualité brûlante (24–72h) dans le domaine "${channel.name}". Pour chaque sujet :`,
      `  - un événement LIEN DIRECT avec "${channel.name}", avec une description DÉTAILLÉE (4-6 phrases)`,
      `  - 2 à 3 questions : la MAJORITÉ en OUI/NON (question_type: "binary"), mais AU MOINS 1 question à CHOIX MULTIPLE (question_type: "multi_choice")`,
      `  - Pour les questions BINARY : inclure "ai_initial_probability" (float 0.01-0.99)`,
      `  - Pour les questions MULTI_CHOICE : inclure "outcomes" (tableau de 2-4 options), chacune avec "label" et "ai_initial_probability". La SOMME des probabilités doit faire ~1.0`,
      `  - Chaque question : "description" riche (3-5 phrases), "resolution_criteria" précis`,
      `  - Si possible, inclure "image_url" d'un média réel (Reuters, AFP, BBC)`,
    ].join('\n')

    const prompt = [
      `Canal "${channel.name}" : génère des événements et questions EXCLUSIVEMENT liés à la thématique "${channel.name}".`,
      `RAPPEL : aucun contenu hors-sujet. Chaque événement et question DOIT correspondre au domaine "${channel.name}".`,
      ``,
      `Retourne un JSON de forme :`,
      `{`,
      `  "events": [`,
      `    {`,
      `      "title": "Titre court",`,
      `      "slug": "evenement-slug-2026",`,
      `      "description": "Description DÉTAILLÉE (4-6 phrases).",`,
      `      "questions": [`,
      `        {`,
      `          "title": "Question binaire OUI/NON ?",`,
      `          "question_type": "binary",`,
      `          "description": "Contexte factuel 3-5 phrases.",`,
      `          "close_date_days": 14,`,
      `          "resolution_source": "Reuters, BBC",`,
      `          "resolution_criteria": "OUI si [...]. NON si [...].",`,
      `          "slug_hint": "slug-court",`,
      `          "ai_initial_probability": 0.62`,
      `        },`,
      `        {`,
      `          "title": "Un accord sera trouvé avant...",`,
      `          "question_type": "multi_choice",`,
      `          "description": "Contexte factuel 3-5 phrases.",`,
      `          "close_date_days": 30,`,
      `          "resolution_source": "Reuters, BBC",`,
      `          "resolution_criteria": "Résolution selon la date de l'annonce officielle.",`,
      `          "slug_hint": "accord-avant",`,
      `          "outcomes": [`,
      `            {"label": "Avant le 30 Avril", "ai_initial_probability": 0.22},`,
      `            {"label": "Avant le 31 Mai", "ai_initial_probability": 0.39},`,
      `            {"label": "Après Mai / Pas d'accord", "ai_initial_probability": 0.39}`,
      `          ]`,
      `        }`,
      `      ]`,
      `    }`,
      `  ]`,
      `}`,
      ``,
      `Contraintes :`,
      `- TOUS les événements et questions DOIVENT être liés à la thématique "${channel.name}" — AUCUN hors-sujet`,
      `- 2 ou 3 événements ; chaque événement : 2 ou 3 questions`,
      `- AU MOINS 1 question multi_choice par événement quand c'est pertinent`,
      `- Pour multi_choice : 2 à 4 outcomes, somme des probabilités = 1.0`,
      `- close_date_days entre 7 et 45`,
      `- Descriptions factuelles, détaillées et vérifiables`,
      `- resolution_criteria PRÉCIS et mesurable`,
      `- image_url : uniquement des URLs HTTPS réelles. Si indisponible, omets le champ`,
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

          const isMulti = q.question_type === 'multi_choice' && Array.isArray(q.outcomes) && q.outcomes.length >= 2
          const days = Math.min(45, Math.max(7, Number(q.close_date_days) || 14))
          const closeDate = new Date(now + days * 86_400_000).toISOString()
          const hint = q.slug_hint ? slugify(q.slug_hint) : slugify(q.title)
          const qSlug = slugify(`auto-${channel.slug}-${hint}-${crypto.randomUUID().slice(0, 5)}`)

          const aiInitProb = !isMulti && typeof q.ai_initial_probability === 'number'
            ? Math.max(0.01, Math.min(0.99, q.ai_initial_probability))
            : null

          const resolveAfterDate = new Date(now + (days + 1) * 86_400_000).toISOString()

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
            resolution_class: 'B',
            resolution_mode: 'assisted',
            resolve_after: resolveAfterDate,
          }

          if (hasImageCol && q.image_url && q.image_url.startsWith('https://')) {
            insertRow.image_url = q.image_url.slice(0, 2000)
          }
          if (hasQuestionType) {
            insertRow.question_type = isMulti ? 'multi_choice' : 'binary'
          }
          if (hasRegionCol && regionCode) {
            insertRow.region = regionCode
          }

          const { data: qRow, error: qErr } = await supabase
            .from('forecast_questions')
            .insert(insertRow)
            .select('id')
            .single()

          if (qErr || !qRow) {
            console.error(`[question-generator] Question ${channel.slug}:`, qErr?.message)
            continue
          }

          createdQuestions += 1

          // Insert outcomes for multi-choice
          if (isMulti && hasOutcomesTable && q.outcomes) {
            const outcomeRows = q.outcomes.slice(0, 6).map((o, idx) => ({
              question_id: qRow.id,
              label: o.label.slice(0, 200),
              sort_order: idx,
              color: OUTCOME_COLORS[idx % OUTCOME_COLORS.length],
              ai_probability: Math.max(0, Math.min(1, o.ai_initial_probability ?? 0)),
              blended_probability: Math.max(0, Math.min(1, o.ai_initial_probability ?? 0)),
            }))

            const { error: oErr } = await supabase
              .from('forecast_question_outcomes')
              .insert(outcomeRows)

            if (oErr) {
              console.error(`[question-generator] Outcomes ${channel.slug}:`, oErr.message)
            }
          }

          // Create resolution profile
          await supabase.from('resolution_profiles').insert({
            question_id: qRow.id,
            resolution_class: 'B',
            resolution_mode: 'assisted',
            outcome_type: isMulti ? 'multi_choice' : 'binary',
            primary_source_type: 'ai_search',
            primary_source_url: q.resolution_url?.slice(0, 2000) ?? null,
            resolve_after: resolveAfterDate,
            resolve_deadline: new Date(now + (days + 7) * 86_400_000).toISOString(),
            tie_break_rule: 'En cas d\'ambiguïté, la question sera examinée manuellement par un admin.',
            cancellation_rule: 'Si l\'événement sous-jacent est annulé ou ne se produit pas.',
            ambiguity_rule: 'Si les critères de résolution sont ambigus, annuler la question.',
            auto_resolve_eligible: false,
            requires_multi_source: false,
            min_source_confidence: 'high',
          }).then(({ error: rpErr }) => {
            if (rpErr) console.error(`[question-generator] Resolution profile:`, rpErr.message)
          })

          // Enqueue AI forecast
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
