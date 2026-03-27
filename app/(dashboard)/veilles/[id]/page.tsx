import { createClient } from '@/lib/supabase/server'
import { notFound }     from 'next/navigation'
import Link             from 'next/link'
import { ArrowLeft, AlertTriangle, Plus } from 'lucide-react'
import RunAgentsButton  from './RunAgentsButton'
import WatchTabs        from './WatchTabs'

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
      .select('*, companies(name)', { count: 'exact' })
      .eq('watch_id', params.id)
      .order('published_at', { ascending: false })
      .limit(30),
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

  const companies =
    (watch.watch_companies ?? []).map((wc: any) => wc.companies).filter(Boolean)
  const noCompanies = companies.length === 0

  const lastScrapeJob = (jobs ?? []).find((j: any) => j.agent_number === 1)
  const breakdown = lastScrapeJob?.metadata?.breakdown_agents as Record<string, number> | undefined

  return (
    <div className="max-w-5xl mx-auto pb-20 lg:pb-0">

      {/* ── En-tête ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <Link href="/veilles"
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 mb-2 transition-colors">
            <ArrowLeft size={12} /> Mes veilles
          </Link>
          <h2 className="text-lg font-bold text-neutral-900">{watch.name}</h2>
          <p className="text-xs text-neutral-500 mt-1">
            {watch.sectors?.join(', ')} · {watch.countries?.join(', ')} ·{' '}
            {watch.frequency === 'realtime' ? 'Temps réel'
              : watch.frequency === 'daily' ? 'Quotidienne' : 'Hebdomadaire'}
          </p>
        </div>
        <RunAgentsButton watchId={watch.id} hasCompanies={!noCompanies} />
      </div>

      {/* ── Alerte : aucune entreprise ────────────────────────── */}
      {noCompanies && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Aucune entreprise liée à cette veille</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Sans entreprises, les recherches seront uniquement sectorielles.
            </p>
          </div>
          <Link href={`/veilles/${params.id}/edit`}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0">
            <Plus size={12} /> Ajouter
          </Link>
        </div>
      )}

      {/* ── Métriques ────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Entreprises',       value: companies.length },
          { label: 'Signaux collectés', value: totalSignals ?? 0 },
          { label: 'Rapports générés',  value: reports?.length ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="metric-card text-center">
            <div className="text-xl font-bold text-neutral-900">{value}</div>
            <div className="text-xs text-neutral-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Onglets ──────────────────────────────────────────── */}
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
