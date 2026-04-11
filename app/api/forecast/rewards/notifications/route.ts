import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createAdminClient()

  const { data, error } = await db
    .from('reward_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count } = await db
    .from('reward_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('seen', false)

  return NextResponse.json({ notifications: data ?? [], unseenCount: count ?? 0 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createAdminClient()
  const body = await req.json()

  if (body.markAllSeen) {
    await db.from('reward_notifications')
      .update({ seen: true })
      .eq('user_id', user.id)
      .eq('seen', false)
  } else if (body.id) {
    await db.from('reward_notifications')
      .update({ seen: true })
      .eq('id', body.id)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ ok: true })
}
