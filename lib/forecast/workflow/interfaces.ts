/**
 * Service / worker interfaces (implementations live in services/ and apps/worker).
 */

import type { UUID } from './types'
import type { MaterialityFactors } from './scoring'

export interface IngestSignalInput {
  rawContent: string
  title?: string
  url?: string | null
  publishedAt?: string | null
  sourceKey?: string
  watchId: UUID
  contentHash?: string
}

export interface ISignalIngestionService {
  ingest(input: IngestSignalInput): Promise<{ signalId: UUID; alreadyExisted: boolean }>
}

export interface ISignalEnrichmentWorker {
  run(signalId: UUID): Promise<void>
}

export type LinkSignalResult =
  | {
      signalId: UUID
      intelEventId: UUID
      linkConfidence: number
    }
  | null

export interface IEventLinkingService {
  /** Propose or create link; may return null when ambiguous → analyst queue */
  linkSignalToEvent(signalId: UUID): Promise<LinkSignalResult>
}

export interface IMaterialChangeDetector {
  evaluate(intelEventId: UUID, snapshotId: UUID, factors: Partial<MaterialityFactors>): Promise<{
    score: number
    decision: 'suppress' | 'review' | 'recalculate'
    factors: MaterialityFactors
  }>
}

export interface IRecalculationScheduler {
  /** Returns null if duplicate idempotency or rate-limited */
  enqueue(
    input: {
      intelEventId: UUID
      contextSnapshotId: UUID
      questionIds: UUID[]
      triggerSignalIds: UUID[]
      materialityScore: number
      reason: string
      idempotencyKey: string
    },
  ): Promise<{ requestId: UUID } | null>
}

export interface IForecastEngineWorker {
  processJob(jobId: UUID): Promise<void>
}

export interface IProbabilityProjectionUpdater {
  onBlendedUpdated(questionId: UUID, requestId: UUID): Promise<void>
}

export interface IAlertingWorker {
  dispatchForQuestion(questionId: UUID, payload: Record<string, unknown>): Promise<void>
}

export interface IVeilleExportWorker {
  run(exportId: UUID): Promise<void>
}

export interface IAnalystReviewWorker {
  createTask(input: {
    taskType: string
    refTable?: string
    refId?: UUID
    priority: number
    payload: Record<string, unknown>
  }): Promise<UUID>
}

export interface IAuditLogger {
  append(topic: string, eventName: string, payload: Record<string, unknown>, opts?: { correlationId?: UUID; idempotencyKey?: string }): Promise<void>
}
