import { createAdminClient } from '@/lib/supabase/admin'
import type { IntelligenceGraphNode, IntelligenceGraphEdge } from './types'

const SEARCH_LIMIT_PER_TABLE = 30

function likeTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s\-_/,.;:!?']+/)
    .filter(t => t.length >= 2)
}

function buildOrFilter(tokens: string[], columns: string[]): string {
  const clauses: string[] = []
  for (const col of columns) {
    for (const t of tokens) {
      clauses.push(`${col}.ilike.%${t}%`)
    }
  }
  return clauses.join(',')
}

export async function loadGraphFromSupabase(
  query: string,
): Promise<{ nodes: IntelligenceGraphNode[]; edges: IntelligenceGraphEdge[] }> {
  const db = createAdminClient()
  const tokens = likeTokens(query)
  if (tokens.length === 0) return { nodes: [], edges: [] }

  const nodesMap = new Map<string, IntelligenceGraphNode>()
  const edges: IntelligenceGraphEdge[] = []
  const edgeSet = new Set<string>()

  function addNode(n: IntelligenceGraphNode) {
    if (!nodesMap.has(n.id)) nodesMap.set(n.id, n)
  }
  function addEdge(e: IntelligenceGraphEdge) {
    const key = `${e.source}__${e.target}__${e.type}`
    if (!edgeSet.has(key)) {
      edgeSet.add(key)
      edges.push(e)
    }
  }

  // ── 1. Search forecast_signal_feed (articles/signals) ──────────────────────
  const { data: signals } = await db
    .from('forecast_signal_feed')
    .select('id, title, summary, signal_type, severity, created_at, region, event_id, question_id, data')
    .or(buildOrFilter(tokens, ['title', 'summary']))
    .order('created_at', { ascending: false })
    .limit(SEARCH_LIMIT_PER_TABLE)

  const signalEventIds = new Set<string>()
  const signalQuestionIds = new Set<string>()

  for (const s of signals ?? []) {
    const isArticle = s.signal_type === 'news'
    const d = s.data as Record<string, unknown> | null
    const sourceUrl = d?.source_url ?? d?.url ?? null
    const publishedAt = d?.published_at ?? d?.pubDate ?? d?.pub_date ?? null
    const displayDate = typeof publishedAt === 'string'
      ? publishedAt.slice(0, 10)
      : s.created_at?.slice(0, 10)
    addNode({
      id: `sig-${s.id}`,
      type: isArticle ? 'article' : 'signal',
      label: s.title ?? 'Signal sans titre',
      subtitle: s.signal_type,
      summary: s.summary,
      createdAt: displayDate,
      regionTags: s.region ? [s.region] : [],
      importance: s.severity === 'high' || s.severity === 'critical' ? 8 : s.severity === 'medium' ? 5 : 3,
      url: typeof sourceUrl === 'string' ? sourceUrl : undefined,
    })
    if (s.event_id) signalEventIds.add(s.event_id)
    if (s.question_id) signalQuestionIds.add(s.question_id)
  }

  // ── 2. Search external_signals (ingested external articles) ────────────────
  const { data: extSignals } = await db
    .from('external_signals')
    .select('id, title, summary, url, published_at, source_name, geography, entity_tags, category_tags, signal_type, trust_score')
    .or(buildOrFilter(tokens, ['title', 'summary']))
    .order('published_at', { ascending: false })
    .limit(SEARCH_LIMIT_PER_TABLE)

  for (const es of extSignals ?? []) {
    addNode({
      id: `ext-${es.id}`,
      type: 'article',
      label: es.title ?? 'Article externe',
      subtitle: es.source_name,
      summary: es.summary,
      createdAt: es.published_at?.slice(0, 10),
      regionTags: es.geography ?? [],
      sectorTags: es.category_tags ?? [],
      url: es.url ?? undefined,
      importance: Math.round((es.trust_score ?? 0.5) * 10),
    })
  }

  // ── 3. Search forecast_events ──────────────────────────────────────────────
  const { data: fEvents } = await db
    .from('forecast_events')
    .select('id, title, description, status, tags, starts_at, created_at')
    .or(buildOrFilter(tokens, ['title', 'description']))
    .order('created_at', { ascending: false })
    .limit(SEARCH_LIMIT_PER_TABLE)

  for (const ev of fEvents ?? []) {
    addNode({
      id: `fev-${ev.id}`,
      type: 'event',
      label: ev.title,
      summary: ev.description,
      createdAt: (ev.starts_at ?? ev.created_at)?.slice(0, 10),
      sectorTags: ev.tags ?? [],
      importance: ev.status === 'active' ? 9 : 5,
    })
  }

  // ── 4. Search intel_events ─────────────────────────────────────────────────
  const { data: iEvents } = await db
    .from('intel_events')
    .select('id, title, summary, status, severity, primary_region, sectors, tags, timeline_anchor, created_at')
    .or(buildOrFilter(tokens, ['title', 'summary']))
    .order('created_at', { ascending: false })
    .limit(SEARCH_LIMIT_PER_TABLE)

  for (const ie of iEvents ?? []) {
    addNode({
      id: `iev-${ie.id}`,
      type: 'event',
      label: ie.title,
      summary: ie.summary,
      createdAt: (ie.timeline_anchor ?? ie.created_at)?.slice(0, 10),
      regionTags: ie.primary_region ? [ie.primary_region] : [],
      sectorTags: ie.sectors ?? [],
      importance: (ie.severity ?? 2) * 2,
    })
  }

  // ── 5. Search forecast_questions ───────────────────────────────────────────
  const { data: questions } = await db
    .from('forecast_questions')
    .select('id, title, description, blended_probability, status, event_id, region, tags, created_at')
    .or(buildOrFilter(tokens, ['title', 'description']))
    .order('created_at', { ascending: false })
    .limit(SEARCH_LIMIT_PER_TABLE)

  for (const q of questions ?? []) {
    addNode({
      id: `q-${q.id}`,
      type: 'question',
      label: q.title,
      summary: q.description,
      createdAt: q.created_at?.slice(0, 10),
      regionTags: q.region ? [q.region] : [],
      sectorTags: q.tags ?? [],
      probability: q.blended_probability,
      importance: q.status === 'active' ? 8 : 4,
    })

    if (q.event_id) {
      addEdge({
        id: `edge-q-fev-${q.id}`,
        source: `q-${q.id}`,
        target: `fev-${q.event_id}`,
        type: 'linked_to',
        confidence: 1.0,
        explanation: 'Question liée à cet événement',
      })
    }
  }

  // ── 6. Search intel_entities ───────────────────────────────────────────────
  const { data: entities } = await db
    .from('intel_entities')
    .select('id, canonical_name, entity_type, slug, metadata, created_at')
    .or(buildOrFilter(tokens, ['canonical_name']))
    .limit(SEARCH_LIMIT_PER_TABLE)

  for (const ent of entities ?? []) {
    addNode({
      id: `ent-${ent.id}`,
      type: 'entity',
      label: ent.canonical_name,
      subtitle: ent.entity_type,
      createdAt: ent.created_at?.slice(0, 10),
      importance: 6,
    })
  }

  // ── 7. Load linked forecast_events for signals with event_id ───────────────
  const missingEventIds = Array.from(signalEventIds).filter(id => !nodesMap.has(`fev-${id}`))
  if (missingEventIds.length > 0) {
    const { data: linkedEvents } = await db
      .from('forecast_events')
      .select('id, title, description, status, tags, starts_at, created_at')
      .in('id', missingEventIds)

    for (const ev of linkedEvents ?? []) {
      addNode({
        id: `fev-${ev.id}`,
        type: 'event',
        label: ev.title,
        summary: ev.description,
        createdAt: (ev.starts_at ?? ev.created_at)?.slice(0, 10),
        sectorTags: ev.tags ?? [],
        importance: ev.status === 'active' ? 9 : 5,
      })
    }
  }

  // ── 8. Load linked forecast_questions for signals with question_id ─────────
  const missingQIds = Array.from(signalQuestionIds).filter(id => !nodesMap.has(`q-${id}`))
  if (missingQIds.length > 0) {
    const { data: linkedQs } = await db
      .from('forecast_questions')
      .select('id, title, description, blended_probability, status, event_id, region, tags, created_at')
      .in('id', missingQIds)

    for (const q of linkedQs ?? []) {
      addNode({
        id: `q-${q.id}`,
        type: 'question',
        label: q.title,
        summary: q.description,
        createdAt: q.created_at?.slice(0, 10),
        regionTags: q.region ? [q.region] : [],
        probability: q.blended_probability,
        importance: q.status === 'active' ? 8 : 4,
      })
    }
  }

  // ── 9. Build edges: signal → event, signal → question ──────────────────────
  for (const s of signals ?? []) {
    if (s.event_id) {
      addEdge({
        id: `edge-sig-fev-${s.id}`,
        source: `sig-${s.id}`,
        target: `fev-${s.event_id}`,
        type: 'mentions',
        confidence: 0.85,
        explanation: 'Signal lié à cet événement',
      })
    }
    if (s.question_id) {
      addEdge({
        id: `edge-sig-q-${s.id}`,
        source: `sig-${s.id}`,
        target: `q-${s.question_id}`,
        type: 'updates',
        confidence: 0.8,
        explanation: 'Signal met à jour cette question',
      })
    }
  }

  // ── 10. Load intel_question_event_links (question ↔ intel_event) ────────────
  const questionIds = Array.from(nodesMap.keys())
    .filter(k => k.startsWith('q-'))
    .map(k => k.slice(2))
  const intelEventIds = Array.from(nodesMap.keys())
    .filter(k => k.startsWith('iev-'))
    .map(k => k.slice(4))

  if (questionIds.length > 0 || intelEventIds.length > 0) {
    let qelQuery = db
      .from('intel_question_event_links')
      .select('question_id, intel_event_id, weight')

    if (questionIds.length > 0 && intelEventIds.length > 0) {
      qelQuery = qelQuery.or(
        `question_id.in.(${questionIds.join(',')}),intel_event_id.in.(${intelEventIds.join(',')})`,
      )
    } else if (questionIds.length > 0) {
      qelQuery = qelQuery.in('question_id', questionIds)
    } else {
      qelQuery = qelQuery.in('intel_event_id', intelEventIds)
    }

    const { data: qeLinks } = await qelQuery.limit(100)
    for (const link of qeLinks ?? []) {
      addEdge({
        id: `edge-qel-${link.question_id}-${link.intel_event_id}`,
        source: `q-${link.question_id}`,
        target: `iev-${link.intel_event_id}`,
        type: 'impacts',
        confidence: Math.min(link.weight ?? 1, 1),
        explanation: 'Événement intel impacte cette question',
      })
    }
  }

  // ── 11. Load intel_event_signal_links (intel_event ↔ veille signal) ────────
  if (intelEventIds.length > 0) {
    const { data: esLinks } = await db
      .from('intel_event_signal_links')
      .select('intel_event_id, signal_id, link_confidence, link_reason')
      .in('intel_event_id', intelEventIds)
      .limit(100)

    for (const link of esLinks ?? []) {
      addEdge({
        id: `edge-iesl-${link.intel_event_id}-${link.signal_id}`,
        source: `iev-${link.intel_event_id}`,
        target: `sig-${link.signal_id}`,
        type: 'supports',
        confidence: link.link_confidence,
        explanation: link.link_reason ?? 'Signal lié à cet événement intel',
      })
    }
  }

  // ── 12. Load event_link_candidates (external_signal ↔ events/questions) ────
  const extIds = Array.from(nodesMap.keys())
    .filter(k => k.startsWith('ext-'))
    .map(k => k.slice(4))

  if (extIds.length > 0) {
    const { data: elcLinks } = await db
      .from('event_link_candidates')
      .select('signal_id, target_type, target_id, confidence, match_reason')
      .in('signal_id', extIds)
      .in('status', ['accepted', 'candidate'])
      .gte('confidence', 0.5)
      .limit(100)

    for (const link of elcLinks ?? []) {
      let targetNodeId: string | null = null
      if (link.target_type === 'forecast_event') targetNodeId = `fev-${link.target_id}`
      else if (link.target_type === 'intel_event') targetNodeId = `iev-${link.target_id}`
      else if (link.target_type === 'forecast_question') targetNodeId = `q-${link.target_id}`
      if (!targetNodeId) continue

      addEdge({
        id: `edge-elc-${link.signal_id}-${link.target_id}`,
        source: `ext-${link.signal_id}`,
        target: targetNodeId,
        type: 'linked_to',
        confidence: link.confidence,
        explanation: link.match_reason ?? 'Lien candidat',
      })
    }
  }

  // ── 13. Load intel_signal_entity_links ──────────────────────────────────────
  const entityIds = Array.from(nodesMap.keys())
    .filter(k => k.startsWith('ent-'))
    .map(k => k.slice(4))

  if (entityIds.length > 0) {
    const { data: selLinks } = await db
      .from('intel_signal_entity_links')
      .select('signal_id, entity_id, confidence, role')
      .in('entity_id', entityIds)
      .limit(100)

    for (const link of selLinks ?? []) {
      addEdge({
        id: `edge-sel-${link.signal_id}-${link.entity_id}`,
        source: `sig-${link.signal_id}`,
        target: `ent-${link.entity_id}`,
        type: 'mentions',
        confidence: link.confidence,
        explanation: link.role ?? 'Mention d\'entité',
      })
    }
  }

  // ── 14. Cross-link: questions sharing the same forecast event ──────────────
  const eventToQuestions = new Map<string, string[]>()
  for (const q of questions ?? []) {
    if (q.event_id) {
      const arr = eventToQuestions.get(q.event_id) ?? []
      arr.push(q.id)
      eventToQuestions.set(q.event_id, arr)
    }
  }
  eventToQuestions.forEach((qIds, eventId) => {
    if (qIds.length <= 1) return
    for (let i = 0; i < qIds.length - 1; i++) {
      addEdge({
        id: `edge-qq-${qIds[i]}-${qIds[i + 1]}`,
        source: `q-${qIds[i]}`,
        target: `q-${qIds[i + 1]}`,
        type: 'related_to',
        confidence: 0.7,
        explanation: `Questions liées au même événement`,
      })
    }
  })

  // Filter out edges referencing nodes we don't have
  const nodeIds = new Set(nodesMap.keys())
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

  return {
    nodes: Array.from(nodesMap.values()),
    edges: validEdges,
  }
}

export async function getSuggestionsFromSupabase(
  partial: string,
): Promise<IntelligenceGraphNode[]> {
  if (partial.length < 2) return []
  const db = createAdminClient()
  const tokens = likeTokens(partial)
  if (tokens.length === 0) return []

  const results: IntelligenceGraphNode[] = []

  const [{ data: sig }, { data: evt }, { data: q }, { data: ent }] = await Promise.all([
    db.from('forecast_signal_feed')
      .select('id, title, signal_type')
      .or(buildOrFilter(tokens, ['title']))
      .order('created_at', { ascending: false })
      .limit(4),
    db.from('forecast_events')
      .select('id, title')
      .or(buildOrFilter(tokens, ['title']))
      .order('created_at', { ascending: false })
      .limit(3),
    db.from('forecast_questions')
      .select('id, title')
      .or(buildOrFilter(tokens, ['title']))
      .order('created_at', { ascending: false })
      .limit(3),
    db.from('intel_entities')
      .select('id, canonical_name, entity_type')
      .or(buildOrFilter(tokens, ['canonical_name']))
      .limit(3),
  ])

  for (const s of sig ?? []) {
    results.push({ id: `sig-${s.id}`, type: s.signal_type === 'news' ? 'article' : 'signal', label: s.title })
  }
  for (const e of evt ?? []) {
    results.push({ id: `fev-${e.id}`, type: 'event', label: e.title })
  }
  for (const qq of q ?? []) {
    results.push({ id: `q-${qq.id}`, type: 'question', label: qq.title })
  }
  for (const en of ent ?? []) {
    results.push({ id: `ent-${en.id}`, type: 'entity', label: en.canonical_name })
  }

  return results.slice(0, 8)
}
