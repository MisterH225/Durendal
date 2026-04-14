import { callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'
import type { StorylineOutcome, StorylineCard } from '@/lib/graph/types'
import type { AnchorContext } from './hybrid-retrieval'

interface OutcomeGeneratorInput {
  anchor: AnchorContext
  causalDrivers: StorylineCard[]
  corollaryEvents: StorylineCard[]
  recentSignals: StorylineCard[]
  narrative: string
}

interface OutcomeGeneratorResult {
  outcomes: StorylineOutcome[]
}

const MIN_OUTCOMES = 2
const TARGET_OUTCOMES = 3

export async function generateOutcomes(
  input: OutcomeGeneratorInput,
): Promise<StorylineOutcome[]> {
  const causalSummary = input.causalDrivers
    .slice(0, 5)
    .map(c => `- ${c.title} (${c.date ?? '?'})`)
    .join('\n')

  const corollarySummary = input.corollaryEvents
    .slice(0, 5)
    .map(c => `- ${c.title} (${c.date ?? '?'})`)
    .join('\n')

  const recentSummary = input.recentSignals
    .slice(0, 5)
    .map(c => `- ${c.title} (${c.date ?? '?'})`)
    .join('\n')

  const systemInstruction = [
    'You are a senior geopolitical and economic forecasting analyst.',
    'You generate realistic, specific outcome scenarios based on available evidence.',
    'Your probabilities are calibrated: you assign lower probabilities when evidence is weak.',
    'You always consider contradicting evidence.',
    'You avoid generic or vague outcomes.',
  ].join(' ')

  const prompt = [
    `## Current situation`,
    `Anchor: "${input.anchor.title}"`,
    input.anchor.summary ? `Summary: ${input.anchor.summary.slice(0, 400)}` : '',
    input.anchor.date ? `Date: ${input.anchor.date}` : '',
    ``,
    causalSummary ? `## Causal drivers\n${causalSummary}` : '',
    corollarySummary ? `## Corollary / parallel events\n${corollarySummary}` : '',
    recentSummary ? `## Recent signals\n${recentSummary}` : '',
    input.narrative ? `## Narrative context\n${input.narrative.slice(0, 600)}` : '',
    ``,
    `## Your task`,
    `Generate exactly ${TARGET_OUTCOMES} plausible, specific outcome scenarios for the NEAR FUTURE of this situation.`,
    ``,
    `Requirements:`,
    `- Each outcome must be SPECIFIC, not generic (e.g. "Iran accepts nuclear inspections under IAEA framework" not "tensions decrease")`,
    `- Probabilities across all outcomes should sum to 0.7-1.0`,
    `- If evidence is weak, assign lower probabilities and note uncertainty in reasoning`,
    `- Each outcome must cite specific supporting AND contradicting evidence`,
    `- Include at least one outcome that represents a significant escalation or change`,
    `- Include at least one outcome that represents stabilization or de-escalation`,
    `- Avoid outcomes that are trivially obvious ("the situation continues")`,
    ``,
    `## Required JSON output`,
    `Return ONLY valid JSON, no markdown:`,
    `{`,
    `  "outcomes": [`,
    `    {`,
    `      "title": "Specific outcome description",`,
    `      "probability": 0.35,`,
    `      "reasoning": "2-3 sentences explaining why this is plausible, citing specific evidence",`,
    `      "timeHorizon": "weeks",`,
    `      "supportingEvidence": ["specific fact 1", "specific event 2"],`,
    `      "contradictingEvidence": ["specific counter-evidence 1"]`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Time horizon options: "days" | "weeks" | "1-3 months" | "3-12 months"`,
  ].filter(Boolean).join('\n')

  try {
    const { text } = await callGeminiWithSearch(prompt, {
      systemInstruction,
      maxOutputTokens: 4000,
    })

    const parsed = parseGeminiJson<OutcomeGeneratorResult>(text)
    if (!parsed?.outcomes || parsed.outcomes.length === 0) {
      console.error('[outcome-generator] Failed to parse outcomes, using fallback')
      return buildFallbackOutcomes(input)
    }

    return sanitizeOutcomes(parsed.outcomes)
  } catch (err) {
    console.error('[outcome-generator] Gemini call failed:', err)
    return buildFallbackOutcomes(input)
  }
}

function sanitizeOutcomes(raw: StorylineOutcome[]): StorylineOutcome[] {
  const outcomes = raw
    .filter(o => o.title && o.probability != null)
    .map(o => ({
      title: o.title,
      probability: Math.max(0.05, Math.min(0.95, o.probability)),
      reasoning: o.reasoning ?? '',
      timeHorizon: o.timeHorizon ?? 'weeks',
      supportingEvidence: o.supportingEvidence ?? [],
      contradictingEvidence: o.contradictingEvidence ?? [],
      probabilitySource: 'ai_estimate' as const,
    }))

  if (outcomes.length < MIN_OUTCOMES) {
    while (outcomes.length < MIN_OUTCOMES) {
      outcomes.push({
        title: `Scénario alternatif ${outcomes.length + 1}`,
        probability: 0.15,
        reasoning: 'Scénario généré par défaut en raison d\'un manque de données. Confiance faible.',
        timeHorizon: 'weeks',
        supportingEvidence: [],
        contradictingEvidence: [],
        probabilitySource: 'ai_estimate',
      })
    }
  }

  return outcomes.slice(0, TARGET_OUTCOMES)
}

function buildFallbackOutcomes(input: OutcomeGeneratorInput): StorylineOutcome[] {
  const topic = input.anchor.title
  return [
    {
      title: `Escalade ou intensification autour de "${topic}"`,
      probability: 0.30,
      reasoning: `Basé sur la dynamique actuelle, une escalade reste plausible. Confiance faible en raison du manque de données précises.`,
      timeHorizon: 'weeks',
      supportingEvidence: input.causalDrivers.slice(0, 2).map(c => c.title),
      contradictingEvidence: [],
      probabilitySource: 'ai_estimate',
    },
    {
      title: `Stabilisation ou statu quo de la situation "${topic}"`,
      probability: 0.40,
      reasoning: `Le statu quo est souvent le scénario le plus probable à court terme. Les acteurs impliqués n'ont pas encore montré de signaux forts de changement.`,
      timeHorizon: '1-3 months',
      supportingEvidence: [],
      contradictingEvidence: input.recentSignals.slice(0, 2).map(c => c.title),
      probabilitySource: 'ai_estimate',
    },
    {
      title: `Désescalade ou résolution partielle de "${topic}"`,
      probability: 0.20,
      reasoning: `Une résolution partielle est possible mais dépend de négociations ou de pressions extérieures. Confiance faible.`,
      timeHorizon: '1-3 months',
      supportingEvidence: [],
      contradictingEvidence: [],
      probabilitySource: 'ai_estimate',
    },
  ]
}
