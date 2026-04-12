/**
 * Logs structurés minimalistes pour le workflow intel (métriques texte → agrégation externe).
 */

export type IntelLogOutcome = 'ok' | 'skipped' | 'failed' | 'retry' | 'dead'

export function logIntelMetric(event: {
  name: string
  correlationId?: string | null
  intelEventId?: string | null
  questionId?: string | null
  requestId?: string | null
  jobId?: string | null
  durationMs?: number
  outcome: IntelLogOutcome
  extra?: Record<string, unknown>
}) {
  const line = {
    ts: new Date().toISOString(),
    scope: 'intel_workflow',
    ...event,
  }
  console.log(JSON.stringify(line))
}
