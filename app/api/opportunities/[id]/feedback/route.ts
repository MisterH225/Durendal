import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { feedbackType, comment } = await req.json()
    const validTypes = ['good_fit', 'bad_fit', 'too_early', 'won', 'lost', 'duplicate']
    if (!validTypes.includes(feedbackType)) {
      return NextResponse.json({ error: 'Type de feedback invalide' }, { status: 400 })
    }

    const { error } = await supabase.from('opportunity_feedback').insert({
      opportunity_id: params.id,
      user_id: user.id,
      feedback_type: feedbackType,
      comment: comment || null,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('opportunity_activity').insert({
      opportunity_id: params.id,
      type: 'feedback',
      payload: { feedbackType, comment },
      actor_user_id: user.id,
    })

    // Auto-update status based on feedback
    const statusMap: Record<string, string> = {
      bad_fit: 'dismissed',
      won: 'won',
      lost: 'lost',
      too_early: 'too_early',
    }
    if (statusMap[feedbackType]) {
      await supabase
        .from('lead_opportunities')
        .update({ status: statusMap[feedbackType], updated_at: new Date().toISOString() })
        .eq('id', params.id)
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
