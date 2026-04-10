import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const db = createAdminClient()

  const { data, error } = await db
    .from('forecast_leaderboard')
    .select('user_id, display_name, avg_brier_score, questions_scored, good_predictions, accuracy_pct, rank, last_updated')
    .not('avg_brier_score', 'is', null)
    .gte('questions_scored', 1)
    .order('avg_brier_score', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leaderboard: data ?? [] })
}
