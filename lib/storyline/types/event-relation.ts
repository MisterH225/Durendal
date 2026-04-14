import type {
  RelationCategory,
  RelationSubtype,
  TemporalSubtype,
} from '@/lib/graph/types'

export interface EventRelation {
  id: string
  sourceClusterId: string
  targetClusterId: string

  temporalRelation: TemporalSubtype
  semanticCategory: RelationCategory
  semanticSubtype: RelationSubtype

  confidence: number
  mechanismEvidence: string
  counterfactualScore?: number

  wasDowngraded: boolean
  originalLlmLabel?: string
  explanation: string
}
