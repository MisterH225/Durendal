import { callGeminiWithSearch, type GroundingSource } from '../ai/gemini'
import type { ResolutionProfile, ResolutionEvidence, SourceTrust, EvidenceConfidence } from './types'

interface FetchedEvidence {
  source_type: ResolutionEvidence['source_type']
  source_url: string | null
  source_trust: SourceTrust
  title: string
  extracted_text: string
  raw_data: Record<string, unknown>
  confidence: EvidenceConfidence
  supports_outcome: string | null
}

export interface SourceFetchResult {
  evidence: FetchedEvidence[]
  sources: GroundingSource[]
  tokensUsed: number
}

function inferSourceTrust(
  profileSourceType: string | null,
  sourceUrl: string,
): SourceTrust {
  const authoritative = ['government', 'central_bank', 'election_commission', 'exchange_feed', 'regulator']
  if (profileSourceType && authoritative.includes(profileSourceType)) return 'authoritative'

  const reliableDomains = [
    'reuters.com', 'bloomberg.com', 'ft.com', 'bbc.com', 'bbc.co.uk',
    'aljazeera.com', 'france24.com', 'nytimes.com', 'wsj.com',
    'cnbc.com', 'economist.com', 'theguardian.com',
  ]
  const lowerUrl = sourceUrl.toLowerCase()
  if (reliableDomains.some(d => lowerUrl.includes(d))) return 'reliable'

  return 'indicative'
}

export async function fetchResolutionSources(
  question: { title: string; resolution_criteria: string; resolution_source: string; description?: string | null },
  profile: ResolutionProfile,
): Promise<SourceFetchResult> {
  const systemInstruction = [
    `Tu es un analyste spécialisé dans la vérification de faits pour résoudre des questions de prévision.`,
    `Ta mission : déterminer si une question de prévision doit être résolue OUI, NON, ou ANNULÉE.`,
    ``,
    `RÈGLE ABSOLUE : base-toi UNIQUEMENT sur des faits vérifiables et des sources fiables.`,
    `NE SPÉCULE PAS. Si tu n'as pas assez d'information, dis-le clairement.`,
    ``,
    `Retourne ta réponse en JSON UNIQUEMENT (pas de markdown, pas de texte avant/après) :`,
    `{`,
    `  "outcome": "yes" | "no" | "unclear",`,
    `  "confidence": 0.0-1.0,`,
    `  "evidence": [`,
    `    {`,
    `      "title": "titre de la source",`,
    `      "text": "extrait pertinent (2-3 phrases max)",`,
    `      "supports": "yes" | "no" | "unclear",`,
    `      "confidence": "very_high" | "high" | "medium" | "low"`,
    `    }`,
    `  ],`,
    `  "rationale": "explication en 2-3 phrases de ta conclusion"`,
    `}`,
  ].join('\n')

  const prompt = [
    `Question de prévision à résoudre :`,
    `"${question.title}"`,
    ``,
    `Critères de résolution officiels :`,
    `"${question.resolution_criteria}"`,
    ``,
    `Source de résolution attendue : ${question.resolution_source}`,
    profile.primary_source_url ? `URL source primaire : ${profile.primary_source_url}` : '',
    ``,
    `Description de la question :`,
    `${question.description ?? 'Aucune description disponible.'}`,
    ``,
    `Analyse les faits actuels et détermine si cette question doit être résolue OUI ou NON.`,
    `Si les informations sont insuffisantes ou ambiguës, indique "unclear".`,
  ].filter(Boolean).join('\n')

  const { text, sources, tokensUsed } = await callGeminiWithSearch(prompt, {
    systemInstruction,
    maxOutputTokens: 4000,
  })

  const evidence: FetchedEvidence[] = []

  // Map grounding sources as evidence items
  for (const src of sources) {
    evidence.push({
      source_type: profile.primary_source_type ?? 'ai_search',
      source_url: src.url,
      source_trust: inferSourceTrust(profile.primary_source_type, src.url),
      title: src.title,
      extracted_text: '',
      raw_data: { grounding_source: true },
      confidence: 'medium',
      supports_outcome: null,
    })
  }

  // Parse Gemini JSON response for structured evidence
  try {
    const { parseGeminiJson } = await import('../ai/gemini')
    interface GeminiResolutionResult {
      outcome: 'yes' | 'no' | 'unclear'
      confidence: number
      evidence: Array<{ title: string; text: string; supports: string; confidence: string }>
      rationale: string
    }
    const parsed = parseGeminiJson<GeminiResolutionResult>(text)
    if (parsed?.evidence) {
      for (const item of parsed.evidence) {
        const matchingSource = sources.find(s =>
          s.title.toLowerCase().includes(item.title.toLowerCase().slice(0, 20)) ||
          item.title.toLowerCase().includes(s.title.toLowerCase().slice(0, 20))
        )
        evidence.push({
          source_type: profile.primary_source_type ?? 'ai_search',
          source_url: matchingSource?.url ?? null,
          source_trust: matchingSource
            ? inferSourceTrust(profile.primary_source_type, matchingSource.url)
            : 'indicative',
          title: item.title,
          extracted_text: item.text,
          raw_data: { parsed_from_gemini: true, raw_supports: item.supports },
          confidence: (['very_high', 'high', 'medium', 'low', 'very_low'].includes(item.confidence)
            ? item.confidence
            : 'medium') as EvidenceConfidence,
          supports_outcome: item.supports === 'yes'
            ? 'resolved_yes'
            : item.supports === 'no'
              ? 'resolved_no'
              : null,
        })
      }
    }

    // Attach the overall parsed result as metadata
    if (parsed) {
      evidence.push({
        source_type: 'ai_search',
        source_url: null,
        source_trust: 'indicative',
        title: 'AI Resolution Analysis',
        extracted_text: parsed.rationale ?? text.slice(0, 500),
        raw_data: { ai_outcome: parsed.outcome, ai_confidence: parsed.confidence, full_text: text },
        confidence: parsed.confidence >= 0.85 ? 'high' : parsed.confidence >= 0.6 ? 'medium' : 'low',
        supports_outcome: parsed.outcome === 'yes'
          ? 'resolved_yes'
          : parsed.outcome === 'no'
            ? 'resolved_no'
            : null,
      })
    }
  } catch {
    // If parsing fails, store raw text as a single evidence item
    evidence.push({
      source_type: 'ai_search',
      source_url: null,
      source_trust: 'indicative',
      title: 'AI Resolution Analysis (raw)',
      extracted_text: text.slice(0, 2000),
      raw_data: { raw_text: text, parse_error: true },
      confidence: 'low',
      supports_outcome: null,
    })
  }

  return { evidence, sources, tokensUsed }
}
