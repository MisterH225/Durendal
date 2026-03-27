import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runSourceCategorizer, detectDuplicates } from '@/lib/agents/source-categorizer'

/**
 * POST  → Lancer l'agent (manual / bulk)
 * GET   → Récupérer la config + stats
 * PATCH → Modifier la config (prompt, status, model)
 */

async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  return profile?.role === 'superadmin' ? user : null
}

export async function GET() {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const db = createAdminClient()

  const [{ data: agent }, { data: runs }] = await Promise.all([
    db.from('admin_agents').select('*').eq('id', 'source_categorizer').single(),
    db.from('admin_agent_runs')
      .select('*')
      .eq('agent_id', 'source_categorizer')
      .order('started_at', { ascending: false })
      .limit(20),
  ])

  // Stats sources
  const [
    { count: totalSources },
    { count: categorized },
  ] = await Promise.all([
    db.from('sources').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('sources').select('*', { count: 'exact', head: true })
      .eq('is_active', true).not('ai_categorized_at', 'is', null),
  ])

  // Détection des doublons
  const duplicateGroups = await detectDuplicates(db)
  const duplicatesCount = duplicateGroups.reduce(
    (sum, g) => sum + g.sources.filter(s => s.is_active).length - 1, 0,
  )

  return NextResponse.json({
    agent,
    runs: runs ?? [],
    duplicateGroups,
    stats: {
      totalSources:  totalSources ?? 0,
      categorized:   categorized ?? 0,
      pending:       (totalSources ?? 0) - (categorized ?? 0),
      duplicates:    duplicatesCount,
    },
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { sourceIds, forceAll } = body as { sourceIds?: string[]; forceAll?: boolean }

  const db = createAdminClient()
  const logs: string[] = []

  const result = await runSourceCategorizer(db, {
    sourceIds,
    forceAll: forceAll ?? false,
    trigger: sourceIds?.length ? 'bulk' : 'manual',
  }, (msg) => logs.push(msg))

  return NextResponse.json({ ...result, logs })
}

export async function PATCH(req: NextRequest) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const allowed = ['prompt', 'status', 'model', 'config', 'name', 'description']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const db = createAdminClient()
  const { error, data } = await db
    .from('admin_agents')
    .update(updates)
    .eq('id', 'source_categorizer')
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data })
}

export async function DELETE() {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const db = createAdminClient()
  await db.from('admin_agent_runs').delete().eq('agent_id', 'source_categorizer')
  await db.from('admin_agents').delete().eq('id', 'source_categorizer')

  return NextResponse.json({ ok: true })
}
