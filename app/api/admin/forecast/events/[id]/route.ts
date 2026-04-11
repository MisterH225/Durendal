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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await assertSuperadmin()) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const body = await req.json()
  const db = createAdminClient()
  const { data, error } = await db.from('forecast_events').update({ ...body, updated_at: new Date().toISOString() }).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await assertSuperadmin()) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const db = createAdminClient()

  const { count: linkedQuestions } = await db
    .from('forecast_questions')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', params.id)

  const { count: adminQuestions } = await db
    .from('forecast_questions')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', params.id)
    .not('created_by', 'is', null)

  const url = new URL(req.url)
  const forceConfirm = url.searchParams.get('confirm') === 'true'

  if ((linkedQuestions ?? 0) > 0 && !forceConfirm) {
    return NextResponse.json({
      warning: true,
      linkedQuestions: linkedQuestions ?? 0,
      adminQuestions: adminQuestions ?? 0,
      message: `Cet événement a ${linkedQuestions} question(s) liée(s) (dont ${adminQuestions ?? 0} créée(s) manuellement). La suppression les supprimera TOUTES en cascade. Ajoutez ?confirm=true pour confirmer.`,
    }, { status: 409 })
  }

  const { error } = await db.from('forecast_events').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deletedQuestions: linkedQuestions ?? 0 })
}
