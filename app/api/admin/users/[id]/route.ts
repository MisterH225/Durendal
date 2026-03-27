import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (adminProfile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { role, planId, status, accountId } = await req.json()

  const db = createAdminClient()

  const { error: profileError } = await db
    .from('profiles')
    .update({ role })
    .eq('id', params.id)

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  if (accountId) {
    const updateData: Record<string, any> = { subscription_status: status }
    if (planId) updateData.plan_id = planId

    const { error: accountError } = await db
      .from('accounts')
      .update(updateData)
      .eq('id', accountId)

    if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
