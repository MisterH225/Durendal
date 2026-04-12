/**
 * Noms d'événements intel (queue / outbox). Aligné sur lib/forecast/workflow/payloads.ts */
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
