// ============================================================================
// StorylinePersistenceService
// Save, load, update, and delete storylines from Supabase.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { Storyline, StorylineCard, StorylineEdge, SourceEvidence } from '../types'

// ── Save a new storyline ─────────────────────────────────────────────────────

export async function saveStoryline(storyline: Storyline): Promise<{ id: string }> {
  const db = createAdminClient()

  // Insert storyline
  const { error: slError } = await db.from('storylines').insert({
    id: storyline.id,
    user_id: storyline.userId ?? null,
    title: storyline.title,
    description: storyline.description,
    anchor_event_id: storyline.anchorEventId ?? null,
    input_type: storyline.inputType,
    input_value: storyline.inputValue,
    status: storyline.status,
    region: storyline.region,
    sectors: storyline.sectors,
    tags: storyline.tags,
    version: storyline.version,
  })
  if (slError) throw new Error(`Failed to save storyline: ${slError.message}`)

  // Insert cards
  if (storyline.cards.length > 0) {
    const cardRows = storyline.cards.map(c => ({
      id: c.id,
      storyline_id: storyline.id,
      event_id: c.eventId ?? null,
      card_type: c.cardType,
      trunk_position: c.trunkPosition ?? null,
      branch_id: c.branchId ?? null,
      label: c.label,
      summary: c.summary,
      happened_at: c.happenedAt ?? null,
      probability: c.probability ?? null,
      probability_source: c.probabilitySource ?? null,
      outcome_status: c.outcomeStatus ?? null,
      importance: c.importance,
      confidence: c.confidence,
    }))

    const { error: cardError } = await db.from('storyline_cards').insert(cardRows)
    if (cardError) console.error('[persistence] Failed to save cards:', cardError.message)
  }

  // Insert edges
  if (storyline.edges.length > 0) {
    const edgeRows = storyline.edges.map(e => ({
      id: e.id,
      storyline_id: storyline.id,
      source_card_id: e.sourceCardId,
      target_card_id: e.targetCardId,
      edge_type: e.edgeType,
      confidence: e.confidence,
      label: e.label,
    }))

    const { error: edgeError } = await db.from('storyline_edges').insert(edgeRows)
    if (edgeError) console.error('[persistence] Failed to save edges:', edgeError.message)
  }

  // Insert card evidence
  for (const card of storyline.cards) {
    if (card.evidence.length > 0) {
      const evidenceRows = card.evidence.map(ev => ({
        card_id: card.id,
        url: ev.url,
        title: ev.title,
        source_name: ev.sourceName,
        excerpt: ev.excerpt,
        published_at: ev.publishedAt ?? null,
        trust_score: ev.trustScore,
        platform_type: ev.platformType ?? null,
        platform_id: ev.platformId ?? null,
      }))

      const { error: evError } = await db.from('card_evidence').insert(evidenceRows)
      if (evError) console.error('[persistence] Failed to save evidence:', evError.message)
    }
  }

  // Create initial snapshot
  await db.from('storyline_snapshots').insert({
    storyline_id: storyline.id,
    version: 1,
    snapshot_data: JSON.stringify({
      cards: storyline.cards.length,
      edges: storyline.edges.length,
    }),
    cards_count: storyline.cards.length,
    edges_count: storyline.edges.length,
    change_summary: 'Storyline initiale créée',
  })

  return { id: storyline.id }
}

// ── Load a storyline ─────────────────────────────────────────────────────────

export async function loadStoryline(id: string): Promise<Storyline | null> {
  const db = createAdminClient()

  const { data: sl } = await db
    .from('storylines')
    .select('*')
    .eq('id', id)
    .single()

  if (!sl) return null

  const { data: cards } = await db
    .from('storyline_cards')
    .select('*')
    .eq('storyline_id', id)
    .order('trunk_position', { ascending: true, nullsFirst: false })

  const { data: edges } = await db
    .from('storyline_edges')
    .select('*')
    .eq('storyline_id', id)

  const { data: evidence } = await db
    .from('card_evidence')
    .select('*')
    .in('card_id', (cards ?? []).map(c => c.id))

  // Group evidence by card
  const evidenceByCard = new Map<string, SourceEvidence[]>()
  for (const ev of evidence ?? []) {
    if (!evidenceByCard.has(ev.card_id)) evidenceByCard.set(ev.card_id, [])
    evidenceByCard.get(ev.card_id)!.push({
      url: ev.url,
      title: ev.title,
      sourceName: ev.source_name,
      excerpt: ev.excerpt,
      publishedAt: ev.published_at,
      trustScore: ev.trust_score ?? 0.5,
      platformType: ev.platform_type,
      platformId: ev.platform_id,
    })
  }

  return {
    id: sl.id,
    userId: sl.user_id,
    title: sl.title,
    description: sl.description,
    anchorEventId: sl.anchor_event_id,
    inputType: sl.input_type,
    inputValue: sl.input_value,
    status: sl.status,
    region: sl.region,
    sectors: sl.sectors,
    tags: sl.tags,
    version: sl.version,
    lastRefreshed: sl.last_refreshed,
    cards: (cards ?? []).map(c => ({
      id: c.id,
      storylineId: c.storyline_id,
      eventId: c.event_id,
      cardType: c.card_type,
      trunkPosition: c.trunk_position,
      branchId: c.branch_id,
      label: c.label,
      summary: c.summary,
      happenedAt: c.happened_at,
      probability: c.probability,
      probabilitySource: c.probability_source,
      outcomeStatus: c.outcome_status,
      importance: c.importance ?? 5,
      confidence: c.confidence ?? 0.7,
      evidence: evidenceByCard.get(c.id) ?? [],
    })),
    edges: (edges ?? []).map(e => ({
      id: e.id,
      storylineId: e.storyline_id,
      sourceCardId: e.source_card_id,
      targetCardId: e.target_card_id,
      edgeType: e.edge_type,
      confidence: e.confidence ?? 0.7,
      label: e.label,
    })),
    createdAt: sl.created_at,
    updatedAt: sl.updated_at,
  }
}

// ── List user's storylines ───────────────────────────────────────────────────

export async function listStorylines(
  userId?: string,
  limit: number = 20,
): Promise<Pick<Storyline, 'id' | 'title' | 'description' | 'status' | 'inputType' | 'inputValue' | 'version' | 'createdAt' | 'updatedAt'>[]> {
  const db = createAdminClient()

  let query = db
    .from('storylines')
    .select('id, title, description, status, input_type, input_value, version, created_at, updated_at')
    .neq('status', 'deleted')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (userId) {
    query = query.or(`user_id.eq.${userId},user_id.is.null`)
  }

  const { data } = await query

  return (data ?? []).map(s => ({
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status,
    inputType: s.input_type,
    inputValue: s.input_value,
    version: s.version,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }))
}

// ── Delete a storyline ───────────────────────────────────────────────────────

export async function deleteStoryline(id: string): Promise<void> {
  const db = createAdminClient()
  await db.from('storylines').update({ status: 'deleted' }).eq('id', id)
}
