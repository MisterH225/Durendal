export interface ExtractedEvent {
  articleId?: string
  articleUrl?: string
  articleTitle: string
  articleSource: string

  eventDate: string | null
  eventDateConfidence: 'high' | 'medium' | 'low'
  canonicalEventTitle: string
  eventSummary: string
  entities: string[]
  geography: string[]

  extractedAt: string
  rawSnippet: string

  // Preserved from CandidateItem for downstream use
  sourceType: 'internal' | 'perplexity' | 'gemini'
  platformRefType?: string
  platformRefId?: string
  regionTags?: string[]
  sectorTags?: string[]
  relevanceScore?: number
}
