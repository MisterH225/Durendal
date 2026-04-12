import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale } from '@/lib/i18n/server'
import { VeilleOnboardingClient } from './VeilleOnboardingClient'

export const dynamic = 'force-dynamic'

export default async function VeilleOnboardingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/forecast/veille')

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('id', user.id)
    .single()

  if (profile?.account_id) {
    redirect('/dashboard')
  }

  const locale = getLocale()

  return <VeilleOnboardingClient locale={locale} />
}
