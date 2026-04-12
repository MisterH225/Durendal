import { createClient } from '@/lib/supabase/server'
import { Plus, Eye, Play } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function VeilleWatchesPage() {
  const supabase = createClient()
  let user: any = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {}
  if (!user) redirect('/login?next=/forecast/veille/watches')

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id, accounts(plans(*))')
    .eq('id', user.id)
    .single()

  if (!profile?.account_id) redirect('/forecast/veille/onboarding')

  const { data: watches } = await supabase
    .from('watches')
    .select('*, watch_companies(companies(name, country, sector))')
    .eq('account_id', profile.account_id)
    .order('created_at', { ascending: false })

  const plan = (profile?.accounts as any)?.plans
  const maxWatches = plan?.max_watches || 1
  const canCreate = (watches?.length || 0) < maxWatches

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-white">
            {watches?.length || 0} veille{(watches?.length || 0) > 1 ? 's' : ''} active
            {(watches?.length || 0) > 1 ? 's' : ''}
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Max {maxWatches} avec votre plan {plan?.display_name}
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/forecast/veille/watches/new"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            <Plus size={14} /> Nouvelle veille
          </Link>
        ) : (
          <Link
            href="/forecast/veille/onboarding"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
          >
            Upgrader le plan
          </Link>
        )}
      </div>

      {/* Watches list */}
      {watches && watches.length > 0 ? (
        <div className="space-y-4">
          {watches.map((watch: any) => {
            const companies = watch.watch_companies?.map((wc: any) => wc.companies) || []
            return (
              <div
                key={watch.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">{watch.name}</h3>
                    <div className="text-xs text-neutral-400 mt-1">
                      {watch.sectors?.join(', ')} · {watch.countries?.join(', ')} ·{' '}
                      {watch.frequency === 'realtime'
                        ? 'Temps réel'
                        : watch.frequency === 'daily'
                          ? 'Quotidienne'
                          : 'Hebdomadaire'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span
                      className={
                        watch.is_active
                          ? 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700'
                      }
                    >
                      {watch.is_active ? 'Active' : 'En pause'}
                    </span>
                    <button
                      type="button"
                      className="w-7 h-7 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 flex items-center justify-center text-blue-400 transition-colors"
                      title="Lancer le scan"
                    >
                      <Play size={12} />
                    </button>
                  </div>
                </div>

                {/* Companies */}
                {companies.length > 0 && (
                  <div className="space-y-2 mt-3 pt-3 border-t border-neutral-800">
                    {companies.slice(0, 5).map((co: any, i: number) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-[10px] font-bold flex-shrink-0">
                          {co?.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-neutral-200 truncate">{co?.name}</div>
                          <div className="text-[10px] text-neutral-500">
                            {co?.sector} · {co?.country}
                          </div>
                        </div>
                        {/* Signal strength placeholder */}
                        <div className="flex gap-0.5">
                          {[1, 2, 3].map((j) => (
                            <div
                              key={j}
                              className={`w-1.5 h-1.5 rounded-full ${j <= 2 ? 'bg-green-500' : 'bg-neutral-700'}`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {companies.length > 5 && (
                      <div className="text-xs text-neutral-500 text-center">
                        +{companies.length - 5} autres
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-neutral-800 flex gap-2">
                  <Link
                    href={`/forecast/veille/watches/${watch.id}`}
                    className="text-xs text-neutral-400 hover:text-white hover:bg-neutral-800/50 transition-colors py-1.5 flex-1 text-center rounded-lg"
                  >
                    Voir les insights
                  </Link>
                  <Link
                    href={`/forecast/veille/watches/${watch.id}/edit`}
                    className="text-xs text-neutral-400 hover:text-white hover:bg-neutral-800/50 transition-colors py-1.5 px-4 rounded-lg"
                  >
                    Modifier
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
            <Eye size={28} className="text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-white mb-2">Aucune veille créée</h3>
          <p className="text-xs text-neutral-400 mb-5 max-w-xs">
            Créez votre première veille pour commencer à surveiller vos concurrents automatiquement.
          </p>
          <Link
            href="/forecast/veille/watches/new"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            <Plus size={14} /> Créer ma première veille
          </Link>
        </div>
      )}
    </div>
  )
}
