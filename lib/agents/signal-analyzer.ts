/**
 * signal-analyzer.ts
 *
 * Analyse IA structurée pour les signaux de veille concurrentielle.
 * Reprend le pattern generateAnalysis / buildAnalysisPrompt du module forecast
 * mais adapté au contexte concurrentiel (entreprises, secteurs, recommandations).
 */

import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export interface VeilleAnalysis {
  executiveTakeaway: string
  competitiveImpact: string
  affectedCompanies: { name: string; impact: string; riskLevel: 'high' | 'medium' | 'low' }[]
  marketImplications: string[]
  strategicRecommendations: string[]
  whatToWatch: string[]
  confidenceNote: string
}

function buildVeilleAnalysisPrompt(
  title: string,
  body: string | null,
  summary: string,
  companies: string[],
  sectors: string[],
  countries: string[],
): string {
  const content = body
    ? `TITRE : ${title}\n\nCONTENU COMPLET DE L'ARTICLE :\n${body.slice(0, 12000)}`
    : `TITRE : ${title}\n\nRÉSUMÉ : ${summary}`

  const depth = body
    ? 'Tu as accès au contenu COMPLET de l\'article. Fournis une analyse détaillée.'
    : 'Tu n\'as que le résumé. Utilise tes connaissances pour enrichir l\'analyse.'

  const companiesList = companies.length > 0
    ? `Entreprises surveillées : ${companies.join(', ')}`
    : ''
  const sectorsList = sectors.length > 0
    ? `Secteurs : ${sectors.join(', ')}`
    : ''
  const countriesList = countries.length > 0
    ? `Pays ciblés : ${countries.join(', ')}`
    : ''

  return [
    `Tu es un analyste en veille concurrentielle senior. ${depth}`,
    companiesList,
    sectorsList,
    countriesList,
    ``,
    `--- CONTENU ---`,
    content,
    `--- FIN ---`,
    ``,
    `Génère une analyse concurrentielle structurée en français.`,
    `Chaque section doit être SUBSTANTIELLE et actionnable pour un décideur.`,
    `NE LAISSE AUCUNE SECTION VIDE. Minimum 2-3 éléments détaillés par tableau.`,
    `Retourne UNIQUEMENT un objet JSON valide (pas de markdown, pas de \`\`\`) :`,
    `{`,
    `  "executiveTakeaway": "Synthèse 2-3 phrases pour un décideur — quel impact concret ?",`,
    `  "competitiveImpact": "Analyse de l'impact sur le paysage concurrentiel (3-4 phrases)",`,
    `  "affectedCompanies": [`,
    `    {"name": "Nom entreprise", "impact": "Description de l'impact (2-3 phrases)", "riskLevel": "high|medium|low"}`,
    `  ],`,
    `  "marketImplications": ["Implication marché 1 (2-3 phrases)", "Implication 2 (2-3 phrases)"],`,
    `  "strategicRecommendations": ["Recommandation 1 — action concrète", "Recommandation 2"],`,
    `  "whatToWatch": ["Indicateur à surveiller 1", "Indicateur 2"],`,
    `  "confidenceNote": "Niveau de confiance de l'analyse et biais potentiels (2 phrases)"`,
    `}`,
  ].filter(Boolean).join('\n')
}

export async function analyzeVeilleSignal(
  signalId: string,
  title: string,
  summary: string,
  articleBody: string | null,
  companies: string[],
  sectors: string[],
  countries: string[],
  supabase: any,
): Promise<VeilleAnalysis | null> {
  try {
    const prompt = buildVeilleAnalysisPrompt(title, articleBody, summary, companies, sectors, countries)

    const { text } = await callGemini(prompt, {
      maxOutputTokens: 3000,
      temperature: 0.2,
    })

    const analysis = parseGeminiJson<VeilleAnalysis>(text)

    if (!analysis || !analysis.executiveTakeaway) {
      console.log(`[signal-analyzer] Analyse vide pour signal ${signalId}, skip.`)
      return null
    }

    const { data: current } = await supabase
      .from('signals')
      .select('data')
      .eq('id', signalId)
      .single()

    const existingData = (current?.data ?? {}) as Record<string, unknown>

    await supabase
      .from('signals')
      .update({ data: { ...existingData, ai_analysis: analysis } })
      .eq('id', signalId)

    console.log(`[signal-analyzer] ✓ Analyse AI pour signal ${signalId}`)
    return analysis
  } catch (err) {
    console.error(`[signal-analyzer] ✗ Échec analyse pour signal ${signalId}:`, err)
    return null
  }
}
