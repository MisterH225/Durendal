import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isAuthUiBypassEnabled } from '@/lib/auth/ui-bypass'
import PredictionClient from './PredictionClient'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function PredictionPage() {
  if (!isAuthUiBypassEnabled()) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (p?.role !== 'superadmin') redirect('/dashboard')
  }

  return (
    <div>
      <Link
        href="/admin/agents"
        className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors mb-4"
      >
        <ArrowLeft size={13} />
        Retour aux agents
      </Link>
      <PredictionClient />
    </div>
  )
}
