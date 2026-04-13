// ============================================================================
// StorylineRefreshService
// Handles saved storyline updates: new events, probability changes,
// outcome verification, and change-since-last-visit detection.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { buildStoryline } from '../builder/storyline-builder'
import { loadStoryline, saveStoryline } from '../persistence/storyline-persistence'
import type { Storyline, StorylineCard } from '../types'

export interface RefreshResult {
  storylineId: string
  newCards: number
  updatedCards: number
  probabilityChanges: number
  outcomesResolved: number
  changeSummary: string
}

/**
 * Refresh a saved storyline by re-running the build pipeline and merging
 * new events with the existing storyline.
 */
export async function refreshStoryline(storylineId: string): Promise<RefreshResult> {
  const existing = await loadStoryline(storylineId)
  if (!existing) throw new Error(`Storyline ${storylineId} not found`)

  const db = createAdminClient()

  // Re-run the build pipeline with the same input
  const { storyline: fresh } = await buildStoryline({
    type: existing.inputType,
    value: existing.inputValue,
    userId: existing.userId,
    options: {
      regions: existing.region ? [existing.region] : [],
      sectors: existing.sectors ?? [],
    },
  })

  // Diff: find new cards not in the existing storyline
  const existingLabels = new Set(existing.cards.map(c => c.label.toLowerCase()))
  const newCards = fresh.cards.filter(c => !existingLabels.has(c.label.toLowerCase()))

  // Detect probability changes on outcome cards
  let probabilityChanges = 0
  const existingOutcomes = existing.cards.filter(c => c.cardType === 'outcome')
  const freshOutcomes = fresh.cards.filter(c => c.cardType === 'outcome')

  for (const eo of existingOutcomes) {
    const matching = freshOutcomes.find(fo =>
      fo.label.toLowerCase() === eo.label.toLowerCase(),
    )
    if (matching && matching.probability !== eo.probability) {
      probabilityChanges++
    }
  }

  // Log update event
  await db.from('storyline_update_events').insert({
    storyline_id: storylineId,
    event_type: 'refresh_complete',
    payload: {
      new_cards: newCards.length,
      probability_changes: probabilityChanges,
      refreshed_at: new Date().toISOString(),
    },
  })

  // Update storyline version
  const newVersion = existing.version + 1
  await db.from('storylines').update({
    version: newVersion,
    last_refreshed: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', storylineId)

  // Create snapshot
  await db.from('storyline_snapshots').insert({
    storyline_id: storylineId,
    version: newVersion,
    snapshot_data: JSON.stringify({
      cards: existing.cards.length + newCards.length,
      edges: existing.edges.length,
      new_cards: newCards.map(c => c.label),
    }),
    cards_count: existing.cards.length + newCards.length,
    edges_count: existing.edges.length,
    change_summary: `+${newCards.length} événements, ${probabilityChanges} changements de probabilité`,
  })

  return {
    storylineId,
    newCards: newCards.length,
    updatedCards: 0,
    probabilityChanges,
    outcomesResolved: 0,
    changeSummary: newCards.length > 0
      ? `${newCards.length} nouveaux événements détectés, ${probabilityChanges} probabilités mises à jour`
      : 'Aucun nouvel événement, storyline à jour',
  }
}

/**
 * Get changes since user's last visit.
 */
export async function getChangesSinceLastVisit(
  storylineId: string,
  lastVisitedAt: string,
): Promise<{
  newEvents: number
  probabilityChanges: number
  summaries: string[]
}> {
  const db = createAdminClient()

  const { data: updates } = await db
    .from('storyline_update_events')
    .select('event_type, payload, created_at')
    .eq('storyline_id', storylineId)
    .gt('created_at', lastVisitedAt)
    .order('created_at', { ascending: false })

  let newEvents = 0
  let probabilityChanges = 0
  const summaries: string[] = []

  for (const update of updates ?? []) {
    const payload = update.payload as any
    if (update.event_type === 'card_added') {
      newEvents++
      if (payload?.label) summaries.push(`Nouvel événement: ${payload.label}`)
    }
    if (update.event_type === 'probability_changed') {
      probabilityChanges++
      if (payload?.card_label) {
        summaries.push(`Probabilité mise à jour: ${payload.card_label}`)
      }
    }
    if (update.event_type === 'refresh_complete') {
      newEvents += payload?.new_cards ?? 0
      probabilityChanges += payload?.probability_changes ?? 0
    }
  }

  return { newEvents, probabilityChanges, summaries }
}
