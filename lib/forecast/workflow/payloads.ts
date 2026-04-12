/**
 * Typed payloads for workflow events (outbox + forecast_event_queue integration).
 * IntelWorkflowEventName is re-exported from packages/contracts (single source of truth).
 */

import type { UUID } from './types'
export type { IntelWorkflowEventName, IngestionEventType, UnifiedEventType } from '@/packages/contracts/src/intel-workflow'

export interface IntelEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: UUID
  type: IntelWorkflowEventName
  occurredAt: string
  correlationId: UUID
  causationId?: UUID
  producer: 'web' | 'worker' | 'system'
  version: 1
  payload: TPayload
}

export interface SignalIngestedPayload {
  signalId: UUID
  sourceId: UUID | null
  contentHash: string
  ingestedAt: string
}

export interface SignalEnrichedPayload {
  signalId: UUID
  enrichmentVersion: number
  qualityScore: number | null
}

export interface SignalLinkedPayload {
  signalId: UUID
  intelEventId: UUID
  linkConfidence: number
}

export interface SignalRejectedPayload {
  signalId: UUID
  reasonCode: string
  detail?: string
}

export interface IntelEventCreatedPayload {
  intelEventId: UUID
  slug: string
  title: string
  origin: 'manual' | 'cluster' | 'import'
}

export interface IntelEventContextUpdatedPayload {
  intelEventId: UUID
  snapshotId: UUID
  diffSummary?: string
}

export interface IntelEventSeverityChangedPayload {
  intelEventId: UUID
  previousSeverity: number
  newSeverity: number
  reason: string
}

export interface MaterialChangeDetectedPayload {
  intelEventId: UUID
  snapshotId: UUID
  materialityScore: number
  factors: string[]
  signalIds: UUID[]
}

export interface QuestionRecalculationRequestedPayload {
  requestId: UUID
  questionIds: UUID[]
  intelEventId: UUID
  contextSnapshotId: UUID
  triggerSignalIds: UUID[]
  materialityScore: number
  reason: string
}

export interface ForecastAiUpdatedPayload {
  questionId: UUID
  requestId: UUID
  aiProbability: number
  model: string
  confidence: 'low' | 'medium' | 'high'
}

export interface ForecastBlendedUpdatedPayload {
  questionId: UUID
  requestId: UUID
  blendedProbability: number
  crowdProbability: number | null
  aiProbability: number
}

export interface AlertTriggeredPayload {
  alertId: UUID
  userId: UUID | null
  accountId: UUID | null
  dedupeKey: string
  kind: string
  payload: Record<string, unknown>
}

export interface VeilleExportRequestedPayload {
  exportId: UUID
  intelEventIds: UUID[]
  watchId: UUID | null
  requestedBy: UUID
}

export interface AnalystReviewCreatedPayload {
  taskId: UUID
  taskType: string
  refTable: string | null
  refId: UUID | null
  priority: number
}
