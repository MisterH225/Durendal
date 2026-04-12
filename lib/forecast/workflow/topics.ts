/**
 * Queue / topic constants for the intel workflow layer.
 * Reuses Postgres table `forecast_event_queue` with `event_type` = INTEL_* names,
 * or dedicated polling on `intel_recalculation_jobs` + `intel_workflow_events`.
 */

/** Prefix for event_type values stored in forecast_event_queue (optional integration) */
export const INTEL_QUEUE_PREFIX = 'intel.' as const

export const IntelTopics = {
  /** Enrichment pipeline */
  SIGNAL_ENRICH: 'intel.signal.enrich',
  /** Link signal to intel_event(s) */
  SIGNAL_LINK: 'intel.signal.link',
  /** Rebuild context snapshot after link/state change */
  EVENT_CONTEXT_REBUILD: 'intel.event.context.rebuild',
  /** Materiality evaluation */
  EVENT_MATERIALITY: 'intel.event.materiality',
  /** Fan-out to forecast questions */
  RECALCULATION_SCHEDULE: 'intel.recalculation.schedule',
  /** Per-question AI + blend */
  FORECAST_RECALCULATE: 'intel.forecast.recalculate',
  /** Dispatch user/account alerts */
  ALERT_DISPATCH: 'intel.alert.dispatch',
  /** Veille export jobs */
  VEILLE_EXPORT: 'intel.veille.export',
  /** Analyst review queue */
  ANALYST_REVIEW: 'intel.analyst.review',
  /** Dead-letter / poison (also use intel_workflow_failures) */
  DLQ: 'intel.dlq',
} as const

export type IntelTopic = (typeof IntelTopics)[keyof typeof IntelTopics]

/** Polling sources for workers (table names) */
export const IntelJobTables = {
  RECALCULATION_JOBS: 'intel_recalculation_jobs',
  WORKFLOW_EVENTS: 'intel_workflow_events',
  FORECAST_QUEUE: 'forecast_event_queue',
} as const
