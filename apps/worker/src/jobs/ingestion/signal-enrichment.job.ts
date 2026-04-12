import { createWorkerSupabase } from '../../supabase'
import { callGemini } from '@/lib/ai/gemini'

interface SignalEnrichmentPayload {
  signal_id: string
}

const LINK_CONFIDENCE_THRESHOLD = 0.70
const LINK_AUTO_THRESHOLD = 0.85

/**
 * Enriches an ingested signal: extracts entities/geography, then attempts
 * to link it to an existing forecast_event via LLM semantic matching.
 *
 * Flow:
 *   ingestion.signal.ready_for_enrichment → this job
 *   → writes event_link_candidates
 *   → if high confidence: auto-links + queues materiality check
 *   → if medium confidence: creates analyst review task
 */
export async function runSignalEnrichmentJob(payload: SignalEnrichmentPayload): Promise<void> {
  const supabase = createWorkerSupabase()
  const { signal_id } = payload

  const { data: signal } = await supabase
    .from('external_signals')
    .select('id, title, summary, body_excerpt, geography, entity_tags, category_tags, source_domain, provider_id')
    .eq('id', signal_id)
    .single()

  if (!signal) {
    console.warn(`[signal-enrichment] Signal ${signal_id} not found, skipping.`)
    return
  }

  const { data: activeEvents } = await supabase
    .from('forecast_events')
    .select('id, title, description, channel_id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!activeEvents?.length) {
    console.log(`[signal-enrichment] No active events to match against for signal ${signal_id}.`)
    return
  }

  const eventList = activeEvents.map((e, i) =>
    `[${i + 1}] ID: ${e.id}\n    Title: ${e.title}\n    Description: ${(e.description ?? '').slice(0, 200)}`
  ).join('\n')

  const prompt = `Tu es un analyste intelligence. Compare le signal suivant avec la liste d'événements existants.

SIGNAL:
Titre: ${signal.title}
Résumé: ${(signal.summary ?? '').slice(0, 500)}
Géographie: ${(signal.geography ?? []).join(', ')}
Entités: ${(signal.entity_tags ?? []).join(', ')}
Catégories: ${(signal.category_tags ?? []).join(', ')}

ÉVÉNEMENTS ACTIFS:
${eventList}

INSTRUCTIONS:
- Identifie si ce signal est fondamentalement lié à un événement existant (pas juste thématiquement proche).
- Si oui, retourne le JSON avec l'événement le plus pertinent.
- Si aucun match fondamental, retourne null.

Réponds UNIQUEMENT en JSON:
{ "match": { "event_id": "...", "confidence": 0.0-1.0, "reason": "..." } }
ou
{ "match": null }`

  let matchResult: { event_id: string; confidence: number; reason: string } | null = null

  try {
    const raw = await callGemini(prompt, { maxOutputTokens: 500 })
    const cleaned = raw.replace(/```json\s*|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    if (parsed?.match?.event_id && parsed.match.confidence >= LINK_CONFIDENCE_THRESHOLD) {
      const validEvent = activeEvents.find(e => e.id === parsed.match.event_id)
      if (validEvent) {
        matchResult = parsed.match
      }
    }
  } catch (e) {
    console.warn(`[signal-enrichment] Gemini matching failed for signal ${signal_id}:`, e instanceof Error ? e.message : e)
    return
  }

  if (!matchResult) {
    console.log(`[signal-enrichment] No event match for signal ${signal_id}.`)
    return
  }

  await supabase.from('event_link_candidates').insert({
    signal_id: signal.id,
    target_type: 'forecast_event',
    target_id: matchResult.event_id,
    confidence: matchResult.confidence,
    match_reason: matchResult.reason,
    status: matchResult.confidence >= LINK_AUTO_THRESHOLD ? 'auto_linked' : 'pending_review',
  }).catch(() => { /* table constraint or duplicate */ })

  if (matchResult.confidence >= LINK_AUTO_THRESHOLD) {
    await autoLinkSignalToEvent(supabase, signal, matchResult.event_id, matchResult.confidence)
  } else {
    await supabase.from('intel_analyst_review_tasks').insert({
      task_type: 'signal_event_link_review',
      ref_table: 'event_link_candidates',
      ref_id: signal.id,
      priority: 2,
      status: 'open',
      payload: {
        signal_title: signal.title,
        proposed_event_id: matchResult.event_id,
        confidence: matchResult.confidence,
        reason: matchResult.reason,
      },
    }).catch(() => { /* table may not exist */ })

    console.log(`[signal-enrichment] Signal ${signal_id} → event ${matchResult.event_id} (conf=${matchResult.confidence}) sent for review.`)
  }
}

async function autoLinkSignalToEvent(
  supabase: ReturnType<typeof createWorkerSupabase>,
  signal: { id: string; title: string; summary: string | null; source_domain: string | null },
  eventId: string,
  confidence: number,
) {
  await supabase.from('intel_event_signal_links').insert({
    intel_event_id: eventId,
    signal_id: signal.id,
    link_type: 'auto_ingestion',
    confidence,
  }).catch(() => { /* duplicate or FK error */ })

  await supabase.from('forecast_signal_feed').insert({
    event_id: eventId,
    signal_type: 'external_ingestion',
    title: signal.title,
    summary: signal.summary,
    source_name: signal.source_domain,
    data: { external_signal_id: signal.id, link_confidence: confidence },
    severity: 'info',
  }).catch(() => { /* ignore */ })

  console.log(`[signal-enrichment] Auto-linked signal ${signal.id} → event ${eventId} (conf=${confidence.toFixed(2)})`)
}
