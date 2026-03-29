import { createClient } from '@/lib/supabase/server'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('id', user.id)
    .single()

  let notifications: any[] = []
  if (profile?.account_id) {
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .eq('account_id', profile.account_id)
      .order('created_at', { ascending: false })
      .limit(50)
    notifications = data || []
  }

  return <NotificationsClient initialNotifications={notifications} />
}
