import { createAdminClient } from '@/lib/supabase/admin'
import { AnalystQueueClient } from './AnalystQueueClient'

export const dynamic = 'force-dynamic'

export default async function IntelAnalystQueuePage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const status = searchParams.status ?? 'open'
  const db = createAdminClient()

  let q = db.from('intel_analyst_review_tasks').select('*').order('priority', { ascending: true }).order('created_at', { ascending: false })

  if (status !== 'all') {
    q = q.eq('status', status)
  }

  const { data: tasks, error } = await q

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Erreur chargement file analyste : {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">File analyste (Intel)</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Tâches liées aux signaux, contradictions et validations export.
        </p>
      </div>
      <AnalystQueueClient tasks={(tasks ?? []) as any} initialStatus={status} />
    </div>
  )
}
