/**
 * Remplit intel_events + intel_question_event_links à partir de forecast_events / forecast_questions.
 * Exécution : npx tsx scripts/backfill-intel-from-forecast-events.ts
 *
 * Idempotent : saute les questions déjà liées à un intel_event.
 */
import { config } from 'dotenv'
import path from 'node:path'

config({ path: path.resolve(process.cwd(), '.env.local') })
config({ path: path.resolve(process.cwd(), '.env') })

import { createAdminClient } from '../lib/supabase/admin'

async function main() {
  const db = createAdminClient()

  const { data: fevents, error: feErr } = await db
    .from('forecast_events')
    .select('id, slug, title, description, status, tags')
    .in('status', ['active', 'closed', 'archived'])

  if (feErr) throw new Error(feErr.message)
  if (!fevents?.length) {
    console.log('Aucun forecast_events à traiter.')
    return
  }

  const slugToIntelId = new Map<string, string>()

  for (const fe of fevents as any[]) {
    const intelSlug = `fe-${fe.slug}`.slice(0, 120)
    const { data: existing } = await db.from('intel_events').select('id').eq('slug', intelSlug).maybeSingle()
    if (existing?.id) {
      slugToIntelId.set(intelSlug, existing.id)
      continue
    }

    const { data: inserted, error: insErr } = await db
      .from('intel_events')
      .insert({
        slug: intelSlug,
        title: fe.title,
        summary: fe.description ?? null,
        status: fe.status === 'active' ? 'active' : 'archived',
        severity: 2,
        tags: fe.tags ?? [],
      })
      .select('id')
      .single()

    if (insErr || !inserted) {
      console.error('Insert intel_events', intelSlug, insErr?.message)
      continue
    }
    slugToIntelId.set(intelSlug, inserted.id)
    console.log('intel_event créé', intelSlug, inserted.id)
  }

  const { data: questions, error: qErr } = await db
    .from('forecast_questions')
    .select('id, event_id')
    .not('event_id', 'is', null)

  if (qErr) throw new Error(qErr.message)

  let linked = 0
  for (const q of (questions ?? []) as any[]) {
    const { data: fe } = await db.from('forecast_events').select('slug').eq('id', q.event_id).maybeSingle()
    if (!fe?.slug) continue
    const intelSlug = `fe-${fe.slug}`.slice(0, 120)
    const intelId = slugToIntelId.get(intelSlug)
    if (!intelId) continue

    const { data: already } = await db
      .from('intel_question_event_links')
      .select('id')
      .eq('question_id', q.id)
      .eq('intel_event_id', intelId)
      .maybeSingle()

    if (already) continue

    const { error: linkErr } = await db.from('intel_question_event_links').insert({
      question_id: q.id,
      intel_event_id: intelId,
      weight: 1,
    })
    if (!linkErr) linked++
  }

  console.log('Backfill terminé. Nouveaux liens question ↔ intel :', linked)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
