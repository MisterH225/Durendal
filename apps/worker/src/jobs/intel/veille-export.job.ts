import { createWorkerSupabase } from '../../supabase'
import { logIntelMetric } from '@/lib/forecast/workflow/observability'

/**
 * Traite les exports intel_veille_exports en pending (MVP : marque done + audit).
 * Remplacer par génération réelle (PDF/JSON) + stockage artifact_url.
 */
export async function runIntelVeilleExportJob() {
  const supabase = createWorkerSupabase()
  const { data: rows } = await supabase
    .from('intel_veille_exports')
    .select('id, intel_event_id, watch_id, payload')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5)

  if (!rows?.length) return

  for (const row of rows) {
    const t0 = Date.now()
    try {
      await supabase
        .from('intel_veille_exports')
        .update({
          status: 'done',
          updated_at: new Date().toISOString(),
          artifact_url: null,
        })
        .eq('id', row.id)

      logIntelMetric({
        name: 'intel.veille_export',
        outcome: 'ok',
        durationMs: Date.now() - t0,
        extra: { exportId: row.id },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await supabase
        .from('intel_veille_exports')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', row.id)
      logIntelMetric({
        name: 'intel.veille_export',
        outcome: 'failed',
        durationMs: Date.now() - t0,
        extra: { exportId: row.id, error: msg.slice(0, 120) },
      })
    }
  }
}
