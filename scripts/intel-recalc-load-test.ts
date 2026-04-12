/**
 * Charge minimale sur intel_recalculation_requests (dev/staging uniquement).
 * Usage :
 *   INTEL_LOAD_TEST_QUESTION_IDS=id1,id2 INTEL_LOAD_TEST_N=20 npx tsx scripts/intel-recalc-load-test.ts
 *
 * Crée N requêtes distinctes (idempotency) sans appeler Gemini.
 */
import { config } from 'dotenv'
import path from 'node:path'

config({ path: path.resolve(process.cwd(), '.env.local') })
config({ path: path.resolve(process.cwd(), '.env') })

import { createAdminClient } from '../lib/supabase/admin'

async function main() {
  const raw = process.env.INTEL_LOAD_TEST_QUESTION_IDS ?? ''
  const questionIds = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (!questionIds.length) {
    console.error('Définir INTEL_LOAD_TEST_QUESTION_IDS (uuid séparés par des virgules).')
    process.exit(1)
  }

  const n = Math.max(1, Math.min(500, Number(process.env.INTEL_LOAD_TEST_N ?? '20')))
  const db = createAdminClient()

  for (let i = 0; i < n; i++) {
    const idempotencyKey = `loadtest:${Date.now()}:${i}:${Math.random().toString(36).slice(2)}`
    const correlationId = crypto.randomUUID()

    const { data: req, error: rErr } = await db
      .from('intel_recalculation_requests')
      .insert({
        idempotency_key: idempotencyKey,
        status: 'pending',
        correlation_id: correlationId,
        question_ids: questionIds,
        trigger_signal_ids: [],
        materiality_score: 50,
        materiality_factors: [{ key: 'load_test', value: i }],
        reason: 'load_test',
        requested_by: 'script:intel-recalc-load-test',
      })
      .select('id')
      .single()

    if (rErr || !req) {
      console.error('insert request', rErr?.message)
      continue
    }

    const jobs = questionIds.map(qid => ({
      request_id: req.id,
      question_id: qid,
      status: 'pending' as const,
    }))
    await db.from('intel_recalculation_jobs').insert(jobs)
  }

  console.log('Load test :', n, 'requêtes créées pour', questionIds.length, 'question(s).')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
