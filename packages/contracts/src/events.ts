export type ForecastEventType =
  | 'forecast.question.created'
  | 'forecast.user.forecast.submitted'
  | 'forecast.blended.recompute.requested'
  | 'forecast.blended.updated'
  | 'forecast.ai.forecast.requested'
  | 'forecast.ai.forecast.updated'
  | 'forecast.signal.export.requested'
  | 'forecast.signal.exported'
  | 'forecast.question.closed'
  | 'forecast.resolution.ready'
  | 'forecast.resolution.job.created'
  | 'forecast.resolution.evidence.ready'
  | 'forecast.resolution.approved'
  | 'forecast.resolution.disputed'
  | 'forecast.resolution.finalized'

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  id: string
  type: ForecastEventType
  occurredAt: string
  correlationId: string
  causationId?: string
  producer: 'web' | 'worker'
  version: 1
  payload: TPayload
}

export interface UserForecastSubmittedPayload {
  questionId: string
  userId: string
  probability: number
  revision: number
  hasReasoning: boolean
}

export interface BlendedRecomputeRequestedPayload {
  questionId: string
  reason: 'user_forecast' | 'ai_forecast' | 'manual' | 'market_move'
}

export interface AIForecastRequestedPayload {
  questionId: string
  channelSlug: string
  requestedBy: 'scheduler' | 'admin' | 'on_update'
  force?: boolean
}

export interface AIForecastUpdatedPayload {
  questionId: string
  aiProbability: number
  confidence: 'low' | 'medium' | 'high'
  briefId?: string
  evidenceCount?: number
  model: string
}

export interface SignalExportRequestedPayload {
  questionId: string
  trigger: 'probability_shift' | 'resolution' | 'manual'
}
