/**
 * Canonical event name unions for the unified queue and outbox.
 * Single source of truth — imported by both lib/forecast/workflow and worker.
 */

export type IntelWorkflowEventName =
  | 'intel.signal.ingested'
  | 'intel.signal.enriched'
  | 'intel.signal.linked'
  | 'intel.signal.rejected'
  | 'intel.event.created'
  | 'intel.event.context.updated'
  | 'intel.event.severity.changed'
  | 'intel.event.material_change.detected'
  | 'intel.question.recalculation.requested'
  | 'intel.forecast.ai.updated'
  | 'intel.forecast.blended.updated'
  | 'intel.alert.triggered'
  | 'intel.veille_export.requested'
  | 'intel.analyst_review.created'

export type IngestionEventType =
  | 'ingestion.signal.ready_for_enrichment'
  | 'ingestion.signal.linked_to_event'
  | 'ingestion.signal.link_needs_review'
  | 'ingestion.market.move.detected'

export type UnifiedEventType =
  | import('./events').ForecastEventType
  | IntelWorkflowEventName
  | IngestionEventType
