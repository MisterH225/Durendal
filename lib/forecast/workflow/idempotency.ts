import { createHash } from 'crypto'
import type { UUID } from './types'

/**
 * Stable idempotency key for intel_recalculation_requests.idempotency_key
 */
export function buildRecalculationIdempotencyKey(
  intelEventId: UUID,
  contextSnapshotId: UUID,
  questionIds: UUID[],
): string {
  const sorted = [...questionIds].sort()
  const raw = `${intelEventId}|${contextSnapshotId}|${sorted.join(',')}`
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}
