import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AgentsPipelineClient } from '@/components/agents/AgentsPipelineClient'

export const dynamic = 'force-dynamic'

export default async function VeilleAgentsPage() {
  const supabase = createClient()
  let user: { id: string } | null = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user as { id: string } | null
  } catch {}
  if (!user) redirect('/login?next=/forecast/veille/agents')

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('id', user.id)
    .single()

  if (!profile?.account_id) redirect('/forecast/veille/onboarding')

  return <AgentsPipelineClient variant="dark" />
}
