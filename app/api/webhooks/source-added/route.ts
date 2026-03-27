import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runSourceCategorizer } from '@/lib/agents/source-categorizer'

/**
 * Webhook POST /api/webhooks/source-added
 *
 * Appelé automatiquement chaque fois qu'une source est ajoutée à la bibliothèque.
 * Déclenche l'agent catégoriseur uniquement pour la/les source(s) concernée(s).
 *
 * Body attendu : { sourceIds: string[] }
 *
 * Sécurisé par un token secret (WEBHOOK_SECRET dans .env).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET
  const authHeader = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '')

  if (secret && authHeader !== secret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { sourceIds } = await req.json().catch(() => ({ sourceIds: [] as string[] }))

  if (!sourceIds?.length) {
    return NextResponse.json({ error: 'sourceIds requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const result = await runSourceCategorizer(db, {
    sourceIds,
    trigger: 'auto_insert',
  })

  return NextResponse.json(result)
}
