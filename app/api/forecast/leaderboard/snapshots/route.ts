import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const periodType = searchParams.get('period') ?? 'monthly'
  const periodKey = searchParams.get('key')
  const category = searchParams.get('category')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

  const db = createAdminClient()

  let query = db
    .from('leaderboard_snapshots')
    .select('user_id, rank, score, questions_scored, accuracy_pct, data, snapshot_at')
    .eq('period_type', periodType)
    .order('rank', { ascending: true })
    .limit(limit)

  if (periodKey) {
    query = query.eq('period_key', periodKey)
  } else {
    query = query.order('snapshot_at', { ascending: false })
  }

  if (category) {
    query = query.eq('category', category)
  } else {
    query = query.is('category', null)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with display names
  const userIds = [...new Set((data ?? []).map(r => r.user_id))]
  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  const enriched = (data ?? []).map(row => ({
    ...row,
    display_name: profileMap.get(row.user_id)?.full_name ?? 'Anonyme',
    avatar_url: profileMap.get(row.user_id)?.avatar_url ?? null,
  }))

  return NextResponse.json({ leaderboard: enriched })
}
