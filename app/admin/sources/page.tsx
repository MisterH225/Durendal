import { createClient } from '@/lib/supabase/server'
import SourcesClient from './SourcesClient'

export default async function AdminSourcesPage() {
  const supabase = createClient()
  const { data: sources } = await supabase
    .from('sources')
    .select('*')
    .order('reliability_score', { ascending: false })

  return <SourcesClient initialSources={sources || []} />
}
