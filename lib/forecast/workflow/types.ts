/**
 * Domain types for intel workflow (aligns with supabase/migrations/035_intel_workflow_architecture.sql).
 * IDs are UUID strings at the application boundary.
 */

export type UUID = string

export type IntelEventStatus = 'draft' | 'active' | 'cooling' | 'resolved' | 'archived'

export type IntelEntityType =
  | 'organization'
  | 'country'
  | 'person'
  | 'institution'
  | 'commodity'
  | 'other'

export interface IntelEntity {
  id: UUID
  entityType: IntelEntityType
  canonicalName: string
  slug: string | null
  externalIds: Record<string, string>
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface IntelEvent {
  id: UUID
  slug: string
  title: string
  summary: string | null
  status: IntelEventStatus
  severity: 1 | 2 | 3 | 4 | 5
  primaryRegion: string | null
  sectors: string[]
  timelineAnchor: string | null
  tags: string[]
  forecastChannelSlug: string | null
  createdAt: string
  updatedAt: string
}

export interface IntelEventState {
  id: UUID
  intelEventId: UUID
  version: number
  state: Record<string, unknown>
  createdAt: string
}

export interface IntelEventContextSnapshot {
  id: UUID
  intelEventId: UUID
  snapshot: Record<string, unknown>
  summary: string | null
  structuredFacts: Record<string, unknown>
  embeddingId: string | null
  createdAt: string
}

export interface IntelEventSignalLink {
  id: UUID
  intelEventId: UUID
  signalId: UUID
  linkConfidence: number
  linkReason: string | null
  createdAt: string
}

export interface IntelQuestionEventLink {
  id: UUID
  questionId: UUID
  intelEventId: UUID
  weight: number
  createdAt: string
}

export type RecalculationStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'skipped'
  | 'failed'
  | 'cancelled'

export interface IntelRecalculationRequest {
  id: UUID
  idempotencyKey: string
  status: RecalculationStatus
  intelEventId: UUID | null
  contextSnapshotId: UUID | null
  correlationId: UUID | null
  questionIds: UUID[]
  triggerSignalIds: UUID[]
  materialityScore: number | null
  materialityFactors: unknown[]
  reason: string | null
  skipReason: string | null
  requestedBy: string
  createdAt: string
  processedAt: string | null
  lastError: string | null
}

export type RecalculationJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead'

export interface IntelRecalculationJob {
  id: UUID
  requestId: UUID
  questionId: UUID
  status: RecalculationJobStatus
  attempts: number
  maxAttempts: number
  availableAt: string
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface IntelProbabilityChangeLog {
  id: UUID
  questionId: UUID
  recalculationRequestId: UUID | null
  contextSnapshotId: UUID | null
  triggerSignalIds: UUID[]
  aiPrev: number | null
  aiNew: number | null
  crowdPrev: number | null
  crowdNew: number | null
  blendedPrev: number | null
  blendedNew: number | null
  changeReason: string
  blendFormulaVersion: string | null
  createdAt: string
}

export type AnalystTaskType =
  | 'signal_link_ambiguous'
  | 'probability_spike'
  | 'contradiction'
  | 'export_approval'
  | 'manual_merge'
  | 'other'

export type AnalystTaskStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed'

export interface IntelAnalystReviewTask {
  id: UUID
  taskType: AnalystTaskType
  status: AnalystTaskStatus
  priority: number
  refTable: string | null
  refId: UUID | null
  payload: Record<string, unknown>
  createdAt: string
  resolvedAt: string | null
  resolvedBy: UUID | null
}

export interface IntelVeilleExport {
  id: UUID
  watchId: UUID | null
  intelEventId: UUID | null
  status: 'pending' | 'approved' | 'processing' | 'failed' | 'done'
  format: string
  artifactUrl: string | null
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface IntelSourceProfile {
  id: UUID
  sourceKey: string
  trustTier: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface IntelWorkflowEventRow {
  id: UUID
  topic: string
  eventName: string
  payload: Record<string, unknown>
  correlationId: UUID | null
  idempotencyKey: string | null
  producer: string
  occurredAt: string
}
