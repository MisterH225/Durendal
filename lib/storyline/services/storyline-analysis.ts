import { callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'
import type { CandidateItem, StorylineAnalysis, TemporalPosition, CausalRole } from '@/lib/graph/types'
import type { AnchorContext } from './hybrid-retrieval'

export async function analyzeStoryline(
  anchor: AnchorContext,
  candidates: CandidateItem[],
): Promise<StorylineAnalysis> {
  const candidateList = candidates
    .slice(0, 35)
    .map((c, i) => `[${i}] "${c.title}" (${c.date ?? 'no date'}) — ${c.summary?.slice(0, 150) ?? ''}`)
    .join('\n')

  const systemInstruction = [
    'You are a senior intelligence analyst specialized in geopolitical, economic, and strategic analysis.',
    'You build structured storylines that explain how situations evolved over time.',
    'You identify causal chains, not just chronological sequences.',
    'You distinguish between direct causes, triggers, parallel events, corollaries, and consequences.',
    'You assign confidence scores honestly — do not overclaim causality.',
    'You propose realistic outcome scenarios with calibrated probabilities.',
  ].join(' ')

  const prompt = [
    `## Anchor event/article`,
    `Title: "${anchor.title}"`,
    anchor.summary ? `Summary: ${anchor.summary.slice(0, 300)}` : '',
    anchor.date ? `Date: ${anchor.date}` : '',
    ``,
    `## Candidate events/articles`,
    candidateList,
    ``,
    `## Your task`,
    `Analyze ALL candidates and build a structured storyline around the anchor.`,
    ``,
    `For EACH relevant candidate, determine:`,
    `- temporalPosition: "deep_past" | "past" | "recent" | "concurrent" | "consequence" | "future"`,
    `- causalRole: "root_cause" | "precursor" | "trigger" | "parallel" | "effect" | "corollary" | "reaction"`,
    `- causalConfidence: 0.0-1.0 (be honest, don't overclaim)`,
    `- explanation: 1-2 sentences on WHY this is connected`,
    `- entities: key actors involved`,
    ``,
    `IMPORTANT RULES:`,
    `- Include deep historical precursors even if they are old. If a treaty, policy, or conflict from years ago directly explains the current situation, include it.`,
    `- Do NOT bias toward recent events only. The "past" chain must reach as far back as needed.`,
    `- If a candidate is not meaningfully connected, exclude it (don't force weak links).`,
    `- Suggest 2-4 realistic outcome scenarios with probabilities (sum should be roughly 0.7-1.0).`,
    ``,
    `## Required JSON output`,
    `Return ONLY valid JSON, no markdown:`,
    `{`,
    `  "anchor": { "title": "...", "summary": "..." },`,
    `  "timeline": [`,
    `    { "candidateRef": "[0] title...", "temporalPosition": "...", "causalRole": "...", "causalConfidence": 0.8, "explanation": "...", "entities": ["..."] }`,
    `  ],`,
    `  "outcomes": [`,
    `    { "title": "...", "probability": 0.4, "reasoning": "...", "timeHorizon": "1-3 months", "supportingEvidence": ["..."] }`,
    `  ],`,
    `  "narrative": "3-5 paragraph chronological narrative in French explaining how the situation evolved, using cause-and-effect language."`,
    `}`,
  ].filter(Boolean).join('\n')

  try {
    const { text } = await callGeminiWithSearch(prompt, {
      systemInstruction,
      maxOutputTokens: 8000,
    })

    const parsed = parseGeminiJson<StorylineAnalysis>(text)
    if (!parsed) {
      console.error('[storyline-analysis] Failed to parse Gemini response')
      return buildFallbackAnalysis(anchor, candidates)
    }

    return sanitizeAnalysis(parsed, candidates)
  } catch (err) {
    console.error('[storyline-analysis] Gemini call failed:', err)
    return buildFallbackAnalysis(anchor, candidates)
  }
}

const VALID_POSITIONS: TemporalPosition[] = ['deep_past', 'past', 'recent', 'concurrent', 'consequence', 'future']
const VALID_ROLES: CausalRole[] = ['root_cause', 'precursor', 'trigger', 'parallel', 'effect', 'corollary', 'reaction']

function sanitizeAnalysis(
  raw: StorylineAnalysis,
  candidates: CandidateItem[],
): StorylineAnalysis {
  const timeline = (raw.timeline ?? [])
    .filter(t => t.candidateRef && t.explanation)
    .map(t => ({
      ...t,
      temporalPosition: VALID_POSITIONS.includes(t.temporalPosition) ? t.temporalPosition : 'concurrent' as TemporalPosition,
      causalRole: VALID_ROLES.includes(t.causalRole) ? t.causalRole : 'parallel' as CausalRole,
      causalConfidence: Math.max(0, Math.min(1, t.causalConfidence ?? 0.5)),
      entities: t.entities ?? [],
    }))

  const outcomes = (raw.outcomes ?? [])
    .filter(o => o.title && o.probability != null)
    .map(o => ({
      ...o,
      probability: Math.max(0, Math.min(1, o.probability)),
      supportingEvidence: o.supportingEvidence ?? [],
    }))

  return {
    anchor: raw.anchor ?? { title: '', summary: '' },
    timeline,
    outcomes,
    narrative: raw.narrative ?? '',
  }
}

function buildFallbackAnalysis(
  anchor: AnchorContext,
  candidates: CandidateItem[],
): StorylineAnalysis {
  const sorted = [...candidates]
    .filter(c => c.date)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const anchorDate = anchor.date ?? new Date().toISOString().slice(0, 10)

  const timeline = sorted.slice(0, 20).map(c => {
    let position: TemporalPosition = 'concurrent'
    if (c.date && c.date < anchorDate) position = 'past'
    if (c.date && c.date > anchorDate) position = 'consequence'

    return {
      candidateRef: c.title,
      temporalPosition: position,
      causalRole: 'parallel' as CausalRole,
      causalConfidence: 0.3,
      explanation: c.summary?.slice(0, 150) ?? 'Événement temporellement proche.',
      entities: c.entities ?? [],
    }
  })

  return {
    anchor: { title: anchor.title, summary: anchor.summary ?? '' },
    timeline,
    outcomes: [],
    narrative: '',
  }
}
