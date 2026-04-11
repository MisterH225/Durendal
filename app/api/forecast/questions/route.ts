import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const channelSlug = searchParams.get('channel')
  const status      = searchParams.get('status') ?? 'open'
  const limit       = Math.min(Number(searchParams.get('limit') ?? '20'), 100)

  const db = createAdminClient()
  let query = db
    .from('forecast_questions')
    .select(`
      id, slug, title, close_date, status, forecast_count, featured, tags,
      crowd_probability, ai_probability, blended_probability,
      forecast_channels ( id, slug, name ),
      forecast_events   ( id, slug, title )
    `)
    .neq('status', 'draft')
    .neq('status', 'paused')
    .order('featured', { ascending: false })
    .order('close_date', { ascending: true })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)

  if (channelSlug) {
    const { data: ch } = await db.from('forecast_channels').select('id').eq('slug', channelSlug).single()
    if (ch) query = query.eq('channel_id', ch.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data })
}
