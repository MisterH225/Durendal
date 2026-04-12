import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditWatchContent from './EditWatchContent'

export const dynamic = 'force-dynamic'

export default async function EditWatchPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: watch } = await supabase
    .from('watches')
    .select('*, watch_companies(aspects, companies(id, name, country, sector, logo_url))')
    .eq('id', params.id)
    .single()
  if (!watch) notFound()
  const companies = (watch.watch_companies ?? []).map((wc: any) => ({ ...wc.companies, aspects: wc.aspects ?? [] })).filter(Boolean)
  return <EditWatchContent watch={watch} initialCompanies={companies} />
}
