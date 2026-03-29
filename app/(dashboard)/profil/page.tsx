import { createClient } from '@/lib/supabase/server'
import ProfilClient from './ProfilClient'

export default async function ProfilPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, accounts(*, plans(*))')
    .eq('id', user.id)
    .single()

  return (
    <ProfilClient
      user={{ id: user.id, email: user.email ?? '' }}
      profile={profile}
    />
  )
}
