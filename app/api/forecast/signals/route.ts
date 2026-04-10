import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit       = Math.min(Number(searchParams.get('limit') ?? '20'), 50)
  const channelSlug = searchParams.get('channel')
  const signalType  = searchParams.get('type')

  const db = createAdminClient()

  let query = db
    .from('forecast_signal_feed')
    .select(`
      id, signal_type, title, summary, severity, data, created_at,
      forecast_questions ( id, slug, title, blended_probability ),
      forecast_channels  ( id, slug, name )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (signalType) query = query.eq('signal_type', signalType)

  if (channelSlug) {
    const { data: ch } = await db
      .from('forecast_channels')
      .select('id')
      .eq('slug', channelSlug)
      .single()
    if (ch) query = query.eq('channel_id', ch.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ signals: data ?? [] })
}
