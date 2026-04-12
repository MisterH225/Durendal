import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertSuperadmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'superadmin' ? user : null
}

/**
 * PATCH /api/admin/intel/analyst-tasks/[id]
 * Body: { status: 'in_progress' | 'resolved' | 'dismissed' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const status = body?.status as string | undefined
  if (!['in_progress', 'resolved', 'dismissed'].includes(status ?? '')) {
    return NextResponse.json({ error: 'status invalide' }, { status: 400 })
  }

  const db = createAdminClient()
  const now = new Date().toISOString()

  const updates: Record<string, unknown> = {
    status,
  }
  if (status === 'resolved' || status === 'dismissed') {
    updates.resolved_at = now
    updates.resolved_by = user.id
  }

  const { error } = await db.from('intel_analyst_review_tasks').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: params.id, status })
}
