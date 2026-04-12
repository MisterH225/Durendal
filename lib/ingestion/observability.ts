// ============================================================================
// Observability for the ingestion layer.
// Structured JSON logs compatible with the existing logIntelMetric pattern.
// ============================================================================

import type { ProviderId, FlowType, IngestionRunStats } from './types'

interface IngestionMetric {
  scope: 'ingestion'
  provider: ProviderId
  flow?: FlowType
  name: string
  run_id?: string
  outcome?: 'ok' | 'partial' | 'failed' | 'skipped'
  duration_ms?: number
  extra?: Record<string, unknown>
}

export function logIngestionMetric(m: IngestionMetric): void {
  console.log(JSON.stringify({
    ...m,
    ts: new Date().toISOString(),
  }))
}

export function logRunComplete(
  provider: ProviderId,
  flow: FlowType,
  runId: string,
  stats: IngestionRunStats,
  durationMs: number,
): void {
  logIngestionMetric({
    scope: 'ingestion',
    provider,
    flow,
    name: 'ingestion.run.completed',
    run_id: runId,
    outcome: stats.errors.length > 0 ? 'partial' : 'ok',
    duration_ms: durationMs,
    extra: {
      fetched: stats.items_fetched,
      normalized: stats.items_normalized,
      deduped: stats.items_deduped,
      persisted: stats.items_persisted,
      error_count: stats.errors.length,
      dedup_rate: stats.items_fetched > 0
        ? ((stats.items_deduped / stats.items_fetched) * 100).toFixed(1) + '%'
        : '0%',
    },
  })
}

export function logProviderUnhealthy(provider: ProviderId, flow: FlowType): void {
  logIngestionMetric({
    scope: 'ingestion',
    provider,
    flow,
    name: 'ingestion.provider.unhealthy',
    outcome: 'skipped',
  })
}

export function logProviderError(provider: ProviderId, flow: FlowType, error: string): void {
  logIngestionMetric({
    scope: 'ingestion',
    provider,
    flow,
    name: 'ingestion.provider.error',
    outcome: 'failed',
    extra: { error: error.slice(0, 500) },
  })
}
