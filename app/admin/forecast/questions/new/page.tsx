import { createAdminClient } from '@/lib/supabase/admin'
import { NewQuestionForm } from './NewQuestionForm'

export const dynamic = 'force-dynamic'

export default async function NewForecastQuestionPage() {
  const db = createAdminClient()
  const [{ data: channels }, { data: events }] = await Promise.all([
    db.from('forecast_channels').select('id, slug, name').eq('is_active', true).order('sort_order'),
    db.from('forecast_events').select('id, slug, title, channel_id').in('status', ['draft', 'active']).order('created_at', { ascending: false }).limit(100),
  ])
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-neutral-900">Nouvelle question forecast</h2>
        <p className="text-sm text-neutral-500 mt-1">Créez une question de probabilité publique. Elle sera en brouillon jusqu&apos;à publication.</p>
      </div>
      <NewQuestionForm channels={channels ?? []} events={events ?? []} />
    </div>
  )
}
