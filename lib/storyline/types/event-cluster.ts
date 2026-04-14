import type { SourceArticle } from '@/lib/graph/types'

export interface EventCluster {
  clusterId: string
  canonicalTitle: string
  eventDate: string | null
  eventDateConfidence: 'high' | 'medium' | 'low'
  summary: string
  entities: string[]
  geography: string[]

  sourceArticles: SourceArticle[]

  clusterSize: number
  representativeEventIdx: number

  // Preserved for downstream: the best platformRef from the cluster
  platformRefType?: string
  platformRefId?: string
  regionTags: string[]
  sectorTags: string[]
  sourceType: 'internal' | 'perplexity' | 'gemini'
}
