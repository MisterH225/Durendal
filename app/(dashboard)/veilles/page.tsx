import { createClient } from '@/lib/supabase/server'
import { Plus, Eye, Play } from 'lucide-react'
import Link from 'next/link'

export default async function VeillesPage() {
  const supabase = createClient()
  let user: any = null
  try { const { data } = await supabase.auth.getUser(); user = data.user } catch {}
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles').select('account_id, accounts(plans(*))').eq('id', user.id).single()

  const { data: watches } = await supabase
    .from('watches')
    .select('*, watch_companies(companies(name, country, sector))')
    .eq('account_id', profile?.account_id)
    .order('created_at', { ascending: false })

  const plan = (profile?.accounts as any)?.plans
  const maxWatches = plan?.max_watches || 1
  const canCreate = (watches?.length || 0) < maxWatches

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-neutral-900">{watches?.length || 0} veille{(watches?.length || 0) > 1 ? 's' : ''} active{(watches?.length || 0) > 1 ? 's' : ''}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Max {maxWatches} avec votre plan {plan?.display_name}</p>
        </div>
        {canCreate ? (
          <Link href="/veilles/new" className="btn-primary flex items-center gap-1.5 text-xs px-3 py-2">
            <Plus size={14} /> Nouvelle veille
          </Link>
        ) : (
          <Link href="/forfait" className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-2">
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
              <div key={watch.id} className="card-lg">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">{watch.name}</h3>
                    <div className="text-xs text-neutral-500 mt-1">
                      {watch.sectors?.join(', ')} · {watch.countries?.join(', ')} · {watch.frequency === 'realtime' ? 'Temps réel' : watch.frequency === 'daily' ? 'Quotidienne' : 'Hebdomadaire'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`badge ${watch.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {watch.is_active ? 'Active' : 'En pause'}
                    </span>
                    <button className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-700 transition-colors" title="Lancer le scan">
                      <Play size={12} />
                    </button>
                  </div>
                </div>

                {/* Companies */}
                {companies.length > 0 && (
                  <div className="space-y-2 mt-3 pt-3 border-t border-neutral-100">
                    {companies.slice(0, 5).map((co: any, i: number) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-bold flex-shrink-0">
                          {co?.name?.slice(0,2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-neutral-800 truncate">{co?.name}</div>
                          <div className="text-[10px] text-neutral-400">{co?.sector} · {co?.country}</div>
                        </div>
                        {/* Signal strength placeholder */}
                        <div className="flex gap-0.5">
                          {[1,2,3].map(j => (
                            <div key={j} className={`w-1.5 h-1.5 rounded-full ${j <= 2 ? 'bg-green-500' : 'bg-neutral-200'}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                    {companies.length > 5 && (
                      <div className="text-xs text-neutral-400 text-center">+{companies.length - 5} autres</div>
                    )}
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-neutral-100 flex gap-2">
                  <Link href={`/veilles/${watch.id}`} className="btn-ghost text-xs py-1.5 flex-1 text-center">
                    Voir les insights
                  </Link>
                  <Link href={`/veilles/${watch.id}/edit`} className="btn-ghost text-xs py-1.5 px-4">
                    Modifier
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card-lg flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <Eye size={28} className="text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 mb-2">Aucune veille créée</h3>
          <p className="text-xs text-neutral-500 mb-5 max-w-xs">
            Créez votre première veille pour commencer à surveiller vos concurrents automatiquement.
          </p>
          <Link href="/veilles/new" className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={14} /> Créer ma première veille
          </Link>
        </div>
      )}
    </div>
  )
}
