import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit       = Math.min(Number(searchParams.get('limit') ?? '20'), 50)
  const offset      = Math.max(0, Number(searchParams.get('offset') ?? '0'))
  const channelSlug = searchParams.get('channel')
  const signalType  = searchParams.get('type')
  const search      = searchParams.get('q')?.trim() ?? ''
  const period      = searchParams.get('period') // '24h' | '7d' | '30d' | 'all'

  const db = createAdminClient()

  let query = db
    .from('forecast_signal_feed')
    .select(`
      id, signal_type, title, summary, severity, data, created_at,
      forecast_questions ( id, slug, title, blended_probability ),
      forecast_channels  ( id, slug, name, name_fr, name_en )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (signalType) query = query.eq('signal_type', signalType)

  if (channelSlug) {
    const { data: ch } = await db
      .from('forecast_channels')
      .select('id')
      .eq('slug', channelSlug)
      .single()
    if (ch) query = query.eq('channel_id', ch.id)
  }

  if (period && period !== 'all') {
    const msMap: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '7d':  7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }
    const ms = msMap[period]
    if (ms) {
      query = query.gte('created_at', new Date(Date.now() - ms).toISOString())
    }
  }

  if (search) {
    const tsQuery = search
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.replace(/[^a-zA-ZÀ-ÿ0-9]/g, ''))
      .filter(w => w.length >= 2)
      .join(' & ')
    if (tsQuery) {
      query = query.textSearch('search_tsv', tsQuery, { config: 'french' })
    }
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ signals: data ?? [], total: count ?? 0 })
}
