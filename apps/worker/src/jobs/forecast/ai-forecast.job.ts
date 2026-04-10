/**
 * ai-forecast.job.ts
 *
 * Consumed when `forecast.ai.forecast.requested` is dequeued.
 *
 * Pipeline V1 (single-call grounded approach):
 *   1. Load question context from DB
 *   2. Build domain-aware prompt (channel adapter)
 *   3. Call Gemini with Google Search Grounding → evidence + probability
 *   4. Parse structured output
 *   5. Persist to forecast_ai_forecasts (archive previous, insert new)
 *   6. Queue blended recompute
 */

import { createWorkerSupabase } from '../../supabase'
import { callGeminiWithSearch, parseGeminiJson } from '../../../../../lib/ai/gemini'

interface AIForecastRequestedPayload {
  questionId: string
  channelSlug: string
  requestedBy: 'scheduler' | 'admin' | 'on_update'
  force?: boolean
}

// ─── Channel adapter ──────────────────────────────────────────────────────────

interface ChannelAdapter {
  systemContext: string
  evidenceFocus: string
  recencyHint: string
}

const CHANNEL_ADAPTERS: Record<string, ChannelAdapter> = {
  'macro-commodities': {
    systemContext: 'expert macroéconomiste et analyste de marchés de matières premières',
    evidenceFocus: 'données Fed/BCE/BRI, prix spot/futures, indices PMI, positions spéculatives, flux de capitaux',
    recencyHint: 'priorise les données des 30 derniers jours',
  },
  'politics-policy': {
    systemContext: 'analyste politologue et expert en régulation internationale',
    evidenceFocus: 'sondages électoraux, déclarations officielles, rapports parlementaires, agenda législatif',
    recencyHint: 'priorise les développements des 14 derniers jours',
  },
  'tech-ai': {
    systemContext: 'expert en technologie, IA et régulation numérique',
    evidenceFocus: 'annonces produits, publications académiques, décisions réglementaires EU/US, benchmarks publics',
    recencyHint: 'priorise les 60 derniers jours',
  },
  'agriculture-risk': {
    systemContext: 'expert en sécurité alimentaire, marchés agricoles et risques climatiques agricoles',
    evidenceFocus: 'rapports USDA/FAO, indices météo, prix contrats à terme agricoles, données récoltes',
    recencyHint: 'priorise les données saisonnières et les 30 derniers jours',
  },
  'climate': {
    systemContext: 'expert en politique climatique, transition énergétique et risques environnementaux',
    evidenceFocus: 'rapports GIEC/IEA, engagements gouvernementaux, données énergétiques, événements météo extrêmes',
    recencyHint: 'priorise les 90 derniers jours',
  },
  'logistics': {
    systemContext: 'expert en supply chain, transport maritime et commerce international',
    evidenceFocus: 'indices Drewry/Baltic, délais portuaires, tensions géopolitiques sur routes maritimes, données douanières',
    recencyHint: 'priorise les données des 21 derniers jours',
  },
  'regional-business-events': {
    systemContext: 'analyste en développement économique régional et intelligence d\'affaires locale',
    evidenceFocus: 'rapports CCI, données emploi régional, annonces d\'investissements, actualité entrepreneuriale locale',
    recencyHint: 'priorise les 30 derniers jours',
  },
}

const DEFAULT_ADAPTER: ChannelAdapter = {
  systemContext: 'analyste senior en intelligence économique et prévision probabiliste',
  evidenceFocus: 'faits vérifiables, données chiffrées, sources primaires fiables',
  recencyHint: 'priorise les informations récentes',
}

// ─── Structured output type ───────────────────────────────────────────────────

interface AIForecastOutput {
  probability: number
  confidence: 'low' | 'medium' | 'high'
  summary: string
  bullish_factors: string[]
  bearish_factors: string[]
  key_uncertainties: string[]
  base_rate_note: string
  next_catalyst: string
  evidence_quality: 'weak' | 'moderate' | 'strong'
}

// ─── Main job ─────────────────────────────────────────────────────────────────

export async function runAIForecastJob(payload: AIForecastRequestedPayload): Promise<void> {
  const supabase = createWorkerSupabase()

  // 1. Load question
  const { data: question, error: qErr } = await supabase
    .from('forecast_questions')
    .select('id, title, description, close_date, resolution_criteria, resolution_source, status')
    .eq('id', payload.questionId)
    .single()

  if (qErr || !question) {
    throw new Error(`Question ${payload.questionId} introuvable : ${qErr?.message}`)
  }

  if (['resolved_yes', 'resolved_no', 'annulled'].includes(question.status) && !payload.force) {
    console.log(`[ai-forecast] Question ${payload.questionId} déjà résolue — skip.`)
    return
  }

  // 2. Build prompt with channel adapter
  const adapter = CHANNEL_ADAPTERS[payload.channelSlug] ?? DEFAULT_ADAPTER
  const closeDate = new Date(question.close_date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  const prompt = `
Tu es un ${adapter.systemContext}.
Ta mission : estimer la probabilité que la question de prévision suivante se réalise.

## QUESTION
${question.title}

## CONTEXTE
${question.description ?? 'Aucun contexte additionnel.'}

## CRITÈRES DE RÉSOLUTION
${question.resolution_criteria}

## SOURCE DE RÉSOLUTION
${question.resolution_source}

## DATE DE CLÔTURE
${closeDate}

## INSTRUCTIONS DE RECHERCHE
Effectue une recherche web approfondie en te concentrant sur :
- ${adapter.evidenceFocus}
- ${adapter.recencyHint}
- Toute donnée chiffrée pertinente (taux, prix, sondages, indices)
- Les précédents historiques comparables (base rate)

## FORMAT DE RÉPONSE REQUIS
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte autour.

{
  "probability": <float entre 0.01 et 0.99>,
  "confidence": <"low" | "medium" | "high">,
  "summary": "<2-4 phrases résumant ton raisonnement principal>",
  "bullish_factors": ["<facteur 1>", "<facteur 2>"],
  "bearish_factors": ["<facteur 1>", "<facteur 2>"],
  "key_uncertainties": ["<incertitude 1>", "<incertitude 2>"],
  "base_rate_note": "<référence historique chiffrée ou 'Aucun précédent direct identifié'>",
  "next_catalyst": "<prochain événement/donnée clé à surveiller>",
  "evidence_quality": <"weak" | "moderate" | "strong">
}
`.trim()

  // 3. Call Gemini with Google Search Grounding
  console.log(`[ai-forecast] Appel Gemini pour "${question.title.slice(0, 60)}…"`)

  const { text, sources, tokensUsed } = await callGeminiWithSearch(prompt, {
    model: 'gemini-2.5-flash',
    maxOutputTokens: 1500,
  })

  console.log(`[ai-forecast] Gemini répondu — ${tokensUsed} tokens, ${sources.length} sources`)

  // 4. Parse output
  const parsed = parseGeminiJson<AIForecastOutput>(text)

  if (!parsed || typeof parsed.probability !== 'number') {
    throw new Error(`Gemini output non parseable : ${text.slice(0, 300)}`)
  }

  const probability = Math.max(0.01, Math.min(0.99, parsed.probability))
  const confidence  = (['low', 'medium', 'high'] as const).includes(parsed.confidence)
    ? parsed.confidence
    : 'medium'

  const reasoning = {
    summary:           parsed.summary ?? '',
    bullish_factors:   parsed.bullish_factors ?? [],
    bearish_factors:   parsed.bearish_factors ?? [],
    key_uncertainties: parsed.key_uncertainties ?? [],
    base_rate_note:    parsed.base_rate_note ?? '',
    next_catalyst:     parsed.next_catalyst ?? '',
    evidence_quality:  parsed.evidence_quality ?? 'moderate',
    sources:           sources.map(s => ({ title: s.title, url: s.url })),
    model:             'gemini-2.5-flash',
    tokens_used:       tokensUsed,
    generated_at:      new Date().toISOString(),
  }

  // 5. Archive previous + insert new
  const { data: prevForecast } = await supabase
    .from('forecast_ai_forecasts')
    .select('revision')
    .eq('question_id', payload.questionId)
    .eq('is_current', true)
    .maybeSingle()

  const nextRevision = (prevForecast?.revision ?? 0) + 1

  if (prevForecast) {
    await supabase
      .from('forecast_ai_forecasts')
      .update({ is_current: false })
      .eq('question_id', payload.questionId)
      .eq('is_current', true)
  }

  const now = new Date().toISOString()

  const { error: insertErr } = await supabase
    .from('forecast_ai_forecasts')
    .insert({
      question_id: payload.questionId,
      probability,
      confidence,
      model: 'gemini-2.5-flash',
      reasoning,
      revision: nextRevision,
      is_current: true,
    })

  if (insertErr) throw new Error(`Impossible de persister le forecast IA : ${insertErr.message}`)

  await supabase
    .from('forecast_questions')
    .update({ ai_probability: probability, updated_at: now })
    .eq('id', payload.questionId)

  console.log(`[ai-forecast] Persisté — p=${(probability * 100).toFixed(1)}%, confidence=${confidence}`)

  // 6. Queue blended recompute
  await supabase.from('forecast_event_queue').insert({
    event_type:     'forecast.blended.recompute.requested',
    correlation_id: payload.questionId,
    payload: {
      id:            crypto.randomUUID(),
      type:          'forecast.blended.recompute.requested',
      occurredAt:    now,
      correlationId: payload.questionId,
      producer:      'worker',
      version:       1,
      payload: { questionId: payload.questionId, reason: 'ai_forecast' },
    },
    status:       'pending',
    attempts:     0,
    max_attempts: 3,
    available_at: now,
  })
}
