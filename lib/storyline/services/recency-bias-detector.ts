import type { EventCluster } from '../types/event-cluster'

const RECENCY_WINDOW_DAYS = 7
const RECENCY_CLUSTER_RATIO = 0.75
const MIN_DATE_SPAN_DAYS = 14

export interface RecencyBiasResult {
  hasRecencyBias: boolean
  reason: string
  oldestDate: string | null
  newestDate: string | null
  spanDays: number
  recentRatio: number
}

export function detectRecencyBias(clusters: EventCluster[]): RecencyBiasResult {
  const withDate = clusters.filter(c => c.eventDate)
  if (withDate.length < 3) {
    return {
      hasRecencyBias: true,
      reason: 'Trop peu de clusters datés pour évaluer la profondeur temporelle',
      oldestDate: null,
      newestDate: null,
      spanDays: 0,
      recentRatio: 1,
    }
  }

  const dates = withDate.map(c => c.eventDate!).sort()
  const oldest = dates[0]
  const newest = dates[dates.length - 1]
  const spanDays = Math.round(
    (new Date(newest).getTime() - new Date(oldest).getTime()) / 86_400_000,
  )

  const now = new Date()
  const recentThreshold = new Date(now.getTime() - RECENCY_WINDOW_DAYS * 86_400_000)
    .toISOString().slice(0, 10)

  const recentCount = withDate.filter(c => c.eventDate! >= recentThreshold).length
  const recentRatio = recentCount / withDate.length

  const hasRecencyBias = recentRatio >= RECENCY_CLUSTER_RATIO || spanDays < MIN_DATE_SPAN_DAYS

  let reason: string
  if (recentRatio >= RECENCY_CLUSTER_RATIO) {
    reason = `${Math.round(recentRatio * 100)}% des événements datent de moins de ${RECENCY_WINDOW_DAYS} jours`
  } else if (spanDays < MIN_DATE_SPAN_DAYS) {
    reason = `L'écart temporel total n'est que de ${spanDays} jours (< ${MIN_DATE_SPAN_DAYS})`
  } else {
    reason = 'Distribution temporelle suffisante'
  }

  console.log(`[recency-bias] span=${spanDays}d, recentRatio=${(recentRatio * 100).toFixed(0)}%, bias=${hasRecencyBias} — ${reason}`)

  return { hasRecencyBias, reason, oldestDate: oldest, newestDate: newest, spanDays, recentRatio }
}
