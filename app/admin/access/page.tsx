import { createClient } from '@/lib/supabase/server'
import AccessClient from './AccessClient'

export default async function AdminAccessPage() {
  const supabase = createClient()

  const [{ data: promoCodes }, { data: specialAccess }, { data: referrals }, { data: plans }] = await Promise.all([
    supabase.from('promo_codes').select('*').order('created_at', { ascending: false }),
    supabase.from('special_access').select('*, accounts(profiles(full_name, email))').order('created_at', { ascending: false }),
    supabase.from('referrals').select('*, profiles!referrer_id(full_name)').order('created_at', { ascending: false }),
    supabase.from('plans').select('id, name, display_name').eq('is_active', true).order('price_monthly'),
  ])

  return (
    <AccessClient
      initialPromoCodes={promoCodes || []}
      initialSpecialAccess={(specialAccess || []) as any}
      initialReferrals={(referrals || []) as any}
      plans={plans || []}
    />
  )
}
