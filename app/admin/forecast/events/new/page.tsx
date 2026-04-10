import { createAdminClient } from '@/lib/supabase/admin'
import { NewEventForm } from './NewEventForm'

export const dynamic = 'force-dynamic'

export default async function NewForecastEventPage() {
  const db = createAdminClient()
  const { data: channels } = await db
    .from('forecast_channels')
    .select('id, slug, name')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-neutral-900">Nouvel événement forecast</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Un événement regroupe plusieurs questions liées à un même sujet ou calendrier.
        </p>
      </div>
      <NewEventForm channels={channels ?? []} />
    </div>
  )
}
