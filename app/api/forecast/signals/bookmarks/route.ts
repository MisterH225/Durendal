import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET — List current user's bookmarked signal IDs (or full signals with ?expand=true)
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const expand = req.nextUrl.searchParams.get('expand') === 'true'
  const db = createAdminClient()

  if (expand) {
    const { data, error } = await db
      .from('signal_bookmarks')
      .select(`
        id, created_at,
        forecast_signal_feed (
          id, signal_type, title, summary, severity, data, created_at,
          forecast_questions ( id, slug, title, blended_probability ),
          forecast_channels  ( id, slug, name, name_fr, name_en )
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ bookmarks: data ?? [] })
  }

  const { data, error } = await db
    .from('signal_bookmarks')
    .select('signal_id')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ signalIds: (data ?? []).map(b => b.signal_id) })
}

/**
 * POST — Toggle bookmark: { signalId: string }
 * Returns { bookmarked: boolean }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const signalId = body.signalId
  if (!signalId || typeof signalId !== 'string') {
    return NextResponse.json({ error: 'signalId required' }, { status: 400 })
  }

  const db = createAdminClient()

  // Check if already bookmarked
  const { data: existing } = await db
    .from('signal_bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('signal_id', signalId)
    .maybeSingle()

  if (existing) {
    await db.from('signal_bookmarks').delete().eq('id', existing.id)
    return NextResponse.json({ bookmarked: false })
  }

  const { error } = await db
    .from('signal_bookmarks')
    .insert({ user_id: user.id, signal_id: signalId })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookmarked: true })
}
