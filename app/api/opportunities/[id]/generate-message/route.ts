import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateMessage, type MessageFormat } from '@/lib/opportunities/message-generator'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { format = 'email', contactId } = await req.json() as { format?: MessageFormat; contactId?: string }

    const { data: opp } = await supabase
      .from('lead_opportunities')
      .select(`
        *,
        companies!inner(name, sector, country, website)
      `)
      .eq('id', params.id)
      .single()

    if (!opp) return NextResponse.json({ error: 'Opportunité introuvable' }, { status: 404 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, company, job_title')
      .eq('id', user.id)
      .single()

    let contactName: string | undefined
    let contactTitle: string | undefined
    if (contactId) {
      const { data: contact } = await supabase
        .from('contact_candidates')
        .select('full_name, job_title')
        .eq('id', contactId)
        .single()
      contactName = contact?.full_name
      contactTitle = contact?.job_title
    }

    const company = opp.companies as any

    const message = await generateMessage({
      companyName: company.name,
      contactName,
      contactTitle,
      signalSummary: opp.summary || 'activité récente détectée',
      signalType: opp.title || '',
      approachAngle: opp.recommended_angle || 'Approche généraliste',
      userCompanyName: profile?.company || undefined,
      userFullName: profile?.full_name || undefined,
      sector: company.sector || undefined,
      format,
    })

    await supabase.from('opportunity_activity').insert({
      opportunity_id: params.id,
      type: 'message_generated',
      payload: { format, contactId },
      actor_user_id: user.id,
    })

    return NextResponse.json({ message })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
