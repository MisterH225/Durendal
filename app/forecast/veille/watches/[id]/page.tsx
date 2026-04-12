import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Plus } from 'lucide-react'
import RunAgentsButton from './RunAgentsButton'
import WatchTabs from './WatchTabs'

export const dynamic = 'force-dynamic'

export default async function WatchDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: watch } = await supabase
    .from('watches')
    .select('*, watch_companies(companies(id, name, country, sector, website))')
    .eq('id', params.id)
    .single()

  if (!watch) notFound()

  const [
    { data: signals, count: totalSignals },
    { data: reports },
    { data: jobs },
  ] = await Promise.all([
    supabase
      .from('signals')
      .select('id, title, raw_content, url, source_name, category, severity, region, signal_type, relevance_score, is_processed, company_id, data, collected_at, published_at, companies(name)', { count: 'exact' })
      .eq('watch_id', params.id)
      .order('published_at', { ascending: false })
      .limit(50),
    supabase
      .from('reports')
      .select('*')
      .eq('watch_id', params.id)
      .order('generated_at', { ascending: false })
      .limit(20),
    supabase
      .from('agent_jobs')
      .select('*')
      .eq('watch_id', params.id)
      .order('started_at', { ascending: false })
      .limit(10),
  ])

  const companies = (watch.watch_companies ?? []).map((wc: any) => wc.companies).filter(Boolean)
  const noCompanies = companies.length === 0
  const breakdown = (jobs ?? []).find((j: any) => j.agent_number === 1)?.metadata?.breakdown_agents as Record<string, number> | undefined

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <Link
            href="/forecast/veille/watches"
            className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 mb-2 transition-colors"
          >
            <ArrowLeft size={12} /> Mes veilles
          </Link>
          <h2 className="text-lg font-bold text-white">{watch.name}</h2>
          <p className="text-xs text-neutral-500 mt-1">
            {watch.sectors?.join(', ')} · {watch.countries?.join(', ')} ·{' '}
            {watch.frequency === 'realtime' ? 'Temps réel' : watch.frequency === 'daily' ? 'Quotidienne' : 'Hebdomadaire'}
          </p>
        </div>
        <RunAgentsButton watchId={watch.id} hasCompanies={!noCompanies} />
      </div>

      {/* No companies warning */}
      {noCompanies && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-400">Aucune entreprise liée à cette veille</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Sans entreprises, les recherches seront uniquement sectorielles.
            </p>
          </div>
          <Link
            href={`/forecast/veille/watches/${params.id}/edit`}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors flex-shrink-0"
          >
            <Plus size={12} /> Ajouter
          </Link>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Entreprises',       value: companies.length },
          { label: 'Signaux collectés', value: totalSignals ?? 0 },
          { label: 'Rapports générés',  value: reports?.length ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-center">
            <div className="text-xl font-bold text-white">{value}</div>
            <div className="text-xs text-neutral-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <WatchTabs
        watchId={watch.id}
        watch={watch}
        companies={companies}
        signals={signals ?? []}
        totalSignals={totalSignals ?? 0}
        reports={reports ?? []}
        jobs={jobs ?? []}
        breakdown={breakdown}
      />
    </div>
  )
}
