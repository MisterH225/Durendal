import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { EditQuestionForm } from './EditQuestionForm'

export const dynamic = 'force-dynamic'

export default async function EditForecastQuestionPage({ params }: { params: { id: string } }) {
  const db = createAdminClient()

  const [{ data: question }, { data: channels }, { data: events }] = await Promise.all([
    db.from('forecast_questions')
      .select('*')
      .eq('id', params.id)
      .single(),
    db.from('forecast_channels').select('id, slug, name').eq('is_active', true).order('sort_order'),
    db.from('forecast_events').select('id, slug, title, channel_id').order('created_at', { ascending: false }).limit(200),
  ])

  if (!question) notFound()

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-neutral-900">Éditer la question</h2>
        <p className="text-sm text-neutral-500 mt-1 truncate" title={question.title}>{question.title}</p>
      </div>
      <EditQuestionForm question={question} channels={channels ?? []} events={events ?? []} />
    </div>
  )
}
