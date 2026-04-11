import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import DisputesClient from './DisputesClient'

export default async function DisputesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') redirect('/dashboard')

  const { data: disputes } = await db
    .from('resolution_disputes')
    .select(`
      *,
      forecast_questions (id, title, slug, status, resolution_criteria)
    `)
    .in('status', ['open', 'under_review'])
    .order('created_at', { ascending: true })
    .limit(50)

  return <DisputesClient initialDisputes={disputes ?? []} />
}
