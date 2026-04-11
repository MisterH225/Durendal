import { createClient } from '@/lib/supabase/server'
import RegionsClient from './RegionsClient'

export default async function AdminRegionsPage() {
  const supabase = createClient()
  const { data: regions } = await supabase
    .from('forecast_region_weights')
    .select('*')
    .order('sort_order')

  return <RegionsClient initialRegions={regions || []} />
}
