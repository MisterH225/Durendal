import { callGemini } from '@/lib/ai/gemini'
import type { EventCluster } from '../types/event-cluster'
import type { EventRelation } from '../types/event-relation'
import type { OutcomePrediction } from '../types/outcome-prediction'
import type { AnchorContext } from './hybrid-retrieval'

export async function generateNarrative(
  anchor: AnchorContext,
  clusters: EventCluster[],
  relations: EventRelation[],
  outcomes: OutcomePrediction[],
): Promise<string> {
  const causalRelations = relations.filter(r => r.semanticCategory === 'causal')
  const corollaryRelations = relations.filter(r => r.semanticCategory === 'corollary')

  const clusterMap = new Map(clusters.map(c => [c.clusterId, c]))

  const trunkSummary = causalRelations
    .sort((a, b) => {
      const dateA = clusterMap.get(a.sourceClusterId)?.eventDate ?? ''
      const dateB = clusterMap.get(b.sourceClusterId)?.eventDate ?? ''
      return dateA.localeCompare(dateB)
    })
    .map(r => {
      const cluster = clusterMap.get(r.sourceClusterId)
      return cluster
        ? `- ${cluster.eventDate ?? '?'}: "${cluster.canonicalTitle}" (${r.semanticSubtype}, confiance ${r.confidence.toFixed(2)})`
        : null
    })
    .filter(Boolean)
    .join('\n')

  const corollarySummary = corollaryRelations
    .map(r => {
      const cluster = clusterMap.get(r.targetClusterId)
      return cluster
        ? `- "${cluster.canonicalTitle}" (${r.semanticSubtype})`
        : null
    })
    .filter(Boolean)
    .join('\n')

  const outcomesSummary = outcomes
    .map(o => `- ${o.title} (probabilité: ${(o.probability * 100).toFixed(0)}%)`)
    .join('\n')

  const prompt = [
    `Rédige un récit chronologique en français de 3 à 5 paragraphes expliquant la situation suivante.`,
    ``,
    `## Événement central`,
    `"${anchor.title}"`,
    anchor.summary ? `Résumé: ${anchor.summary.slice(0, 300)}` : '',
    anchor.date ? `Date: ${anchor.date}` : '',
    ``,
    `## Chaîne causale (les événements qui ont mené à la situation)`,
    trunkSummary || '(aucun événement causal identifié)',
    ``,
    `## Effets collatéraux et réactions`,
    corollarySummary || '(aucun)',
    ``,
    `## Scénarios projetés`,
    outcomesSummary || '(aucun)',
    ``,
    `## Consignes`,
    `- Le récit doit former une NARRATION cohérente, pas une simple liste.`,
    `- Explique les LIENS CAUSAUX entre les événements : pourquoi chaque étape a mené à la suivante.`,
    `- Mentionne les effets collatéraux dans le contexte narratif.`,
    `- Termine par les scénarios possibles et leurs probabilités.`,
    `- Style : briefing d'intelligence, factuel, concis, informé.`,
    `- Ne mets pas de titre ni de formatage markdown. Texte brut uniquement.`,
  ].filter(Boolean).join('\n')

  try {
    const { text } = await callGemini(prompt, {
      maxOutputTokens: 3000,
      temperature: 0.4,
    })
    return text.trim()
  } catch (err) {
    console.error('[narrative-generator] Failed:', err)
    return ''
  }
}
