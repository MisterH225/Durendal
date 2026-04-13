// ============================================================================
// OutcomeGenerationService
// Generates possible future outcomes with AI-estimated probabilities.
// Later integrates with platform forecast system for crowd/blended probabilities.
// ============================================================================

import { callGemini } from '@/lib/ai/gemini'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NormalizedEvent, StorylineCard, SourceEvidence, StorylineAnchor } from '../types'

export interface GeneratedOutcome {
  title: string
  description: string
  probability: number
  probabilitySource: 'ai_estimate' | 'community' | 'blended' | 'platform'
  reasoning: string
  evidenceFor: string[]
  evidenceAgainst: string[]
  forecastQuestionId?: string
}

export async function generateOutcomes(
  anchorEvent: NormalizedEvent,
  allEvents: NormalizedEvent[],
  anchor: StorylineAnchor,
  maxOutcomes: number = 5,
): Promise<GeneratedOutcome[]> {
  // First check if platform already has forecast questions linked to this topic
  const platformOutcomes = await findPlatformForecasts(anchor)

  const eventContext = allEvents
    .slice(0, 10)
    .map(e => `- ${e.title} (${e.happenedAt ?? 'date inconnue'}) — ${e.summary?.slice(0, 100) ?? ''}`)
    .join('\n')

  const prompt = `Tu es un analyste en intelligence stratégique.

ÉVÉNEMENT PRINCIPAL:
${anchorEvent.title}
${anchorEvent.summary ?? ''}

CONTEXTE (événements liés):
${eventContext}

Génère ${maxOutcomes} scénarios/issues possibles pour les prochaines semaines/mois.

Pour chaque scénario:
- title: titre court et factuel
- description: 2-3 phrases explicatives
- probability: estimation entre 0.05 et 0.95
- reasoning: pourquoi cette probabilité
- evidence_for: 2-3 éléments factuels qui soutiennent ce scénario
- evidence_against: 1-2 éléments qui vont à l'encontre

RÈGLES:
- Les probabilités doivent être calibrées : la somme des probabilités mutuellement exclusives doit être cohérente
- Inclure au moins un scénario à haute probabilité (>0.6) et un à faible probabilité (<0.3)
- Être factuel et nuancé, éviter les scénarios sensationnalistes
- Les evidence_for et evidence_against doivent être des faits vérifiables

Retourne un JSON strict:
{"outcomes": [{"title": "...", "description": "...", "probability": 0.0, "reasoning": "...", "evidence_for": ["..."], "evidence_against": ["..."]}]}
Retourne uniquement le JSON.`

  try {
    const { text } = await callGemini(prompt, {
      temperature: 0.3,
      maxOutputTokens: 3000,
    })

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return platformOutcomes

    const parsed = JSON.parse(jsonMatch[0])

    const aiOutcomes: GeneratedOutcome[] = (parsed.outcomes ?? []).map((o: any) => ({
      title: o.title ?? 'Scénario inconnu',
      description: o.description ?? '',
      probability: Math.min(Math.max(o.probability ?? 0.5, 0.01), 0.99),
      probabilitySource: 'ai_estimate' as const,
      reasoning: o.reasoning ?? '',
      evidenceFor: o.evidence_for ?? [],
      evidenceAgainst: o.evidence_against ?? [],
    }))

    // Merge with platform forecasts (platform data takes precedence)
    return mergeWithPlatformForecasts(aiOutcomes, platformOutcomes).slice(0, maxOutcomes)
  } catch (err) {
    console.warn('[outcome-generation] AI generation failed:', err)
    return platformOutcomes.slice(0, maxOutcomes)
  }
}

async function findPlatformForecasts(anchor: StorylineAnchor): Promise<GeneratedOutcome[]> {
  const db = createAdminClient()
  const keywords = anchor.keywords.slice(0, 3)
  if (keywords.length === 0) return []

  const orFilter = keywords.map(k => `title.ilike.%${k}%`).join(',')

  const { data: questions } = await db
    .from('forecast_questions')
    .select('id, title, description, blended_probability, status')
    .or(orFilter)
    .in('status', ['active', 'closed'])
    .order('created_at', { ascending: false })
    .limit(5)

  return (questions ?? []).map(q => ({
    title: q.title,
    description: q.description ?? '',
    probability: q.blended_probability ?? 0.5,
    probabilitySource: q.blended_probability ? 'blended' as const : 'platform' as const,
    reasoning: 'Prévision existante de la plateforme',
    evidenceFor: [],
    evidenceAgainst: [],
    forecastQuestionId: q.id,
  }))
}

function mergeWithPlatformForecasts(
  aiOutcomes: GeneratedOutcome[],
  platformOutcomes: GeneratedOutcome[],
): GeneratedOutcome[] {
  // Platform forecasts take priority
  const result = [...platformOutcomes]
  const platformTitles = new Set(platformOutcomes.map(p => p.title.toLowerCase()))

  for (const ai of aiOutcomes) {
    if (!platformTitles.has(ai.title.toLowerCase())) {
      result.push(ai)
    }
  }

  return result
}

export function outcomesToCards(
  outcomes: GeneratedOutcome[],
  storylineId: string,
  startPosition: number,
): { cards: StorylineCard[]; evidence: Map<string, SourceEvidence[]> } {
  const cards: StorylineCard[] = []
  const evidence = new Map<string, SourceEvidence[]>()

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i]
    const cardId = crypto.randomUUID()

    cards.push({
      id: cardId,
      storylineId,
      cardType: 'outcome',
      trunkPosition: startPosition + i,
      label: outcome.title,
      summary: outcome.description,
      probability: outcome.probability,
      probabilitySource: outcome.probabilitySource,
      outcomeStatus: 'pending',
      importance: Math.round(outcome.probability * 10),
      confidence: outcome.probability,
      evidence: [],
    })

    // Build evidence from reasoning
    const evidenceItems: SourceEvidence[] = []
    for (const ef of outcome.evidenceFor) {
      evidenceItems.push({
        title: ef,
        trustScore: 0.5,
        excerpt: ef,
      })
    }
    evidence.set(cardId, evidenceItems)
  }

  return { cards, evidence }
}
