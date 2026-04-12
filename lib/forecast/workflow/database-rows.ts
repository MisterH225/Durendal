/**
 * Alignement schéma Postgres (snake_case) pour inserts/updates Supabase.
 * À rapprocher de `types.ts` (camelCase) lors du mapping applicatif.
 * Génération Supabase : remplacer par `Database['public']['Tables']['intel_events']['Row']` quand disponible.
 */

export type IntelEventRow = {
  id: string
  slug: string
  title: string
  summary: string | null
  status: string
  severity: number
  primary_region: string | null
  sectors: string[]
  timeline_anchor: string | null
  tags: string[]
  forecast_channel_slug: string | null
  created_at: string
  updated_at: string
}

export type IntelRecalculationRequestRow = {
  id: string
  idempotency_key: string
  status: string
  intel_event_id: string | null
  context_snapshot_id: string | null
  correlation_id: string | null
  question_ids: string[]
  trigger_signal_ids: string[]
  materiality_score: number | null
  materiality_factors: unknown
  reason: string | null
  skip_reason: string | null
  requested_by: string | null
  created_at: string
  processed_at: string | null
  last_error: string | null
}

export type IntelRecalculationJobRow = {
  id: string
  request_id: string
  question_id: string
  status: string
  attempts: number
  max_attempts: number
  available_at: string
  last_error: string | null
  created_at: string
  updated_at: string
}
