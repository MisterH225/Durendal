import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditWatchContent from './EditWatchContent'

export default async function EditWatchPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: watch } = await supabase
    .from('watches')
    .select('*, watch_companies(companies(id, name, country, sector))')
    .eq('id', params.id)
    .single()

  if (!watch) notFound()

  const companies = (watch.watch_companies ?? []).map((wc: any) => wc.companies).filter(Boolean)

  return <EditWatchContent watch={watch} initialCompanies={companies} />
}
