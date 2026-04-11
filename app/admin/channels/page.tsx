import { createClient } from '@/lib/supabase/server'
import ChannelsClient from './ChannelsClient'

export default async function AdminChannelsPage() {
  const supabase = createClient()
  const { data: channels } = await supabase
    .from('forecast_channels')
    .select('*')
    .order('sort_order')

  return <ChannelsClient initialChannels={channels || []} />
}
