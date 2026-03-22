import { createClient } from '@/lib/supabase/server'
import { Star, Clock, TrendingUp, Shield, Users, Lightbulb } from 'lucide-react'

const typeConfig: Record<string, { label: string; icon: any; color: string }> = {
  market_entry:  { label: 'Pénétration marché', icon: TrendingUp, color: 'text-blue-700 bg-blue-50' },
  partnership:   { label: 'Partenariat',         icon: Users,      color: 'text-purple-700 bg-purple-50' },
  defense:       { label: 'Défense position',    icon: Shield,     color: 'text-amber-700 bg-amber-50' },
  new_segment:   { label: 'Nouveau segment',     icon: Lightbulb,  color: 'text-green-700 bg-green-50' },
}

export default async function ActionsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('account_id').eq('id', user!.id).single()

  const { data: recs } = await supabase
    .from('recommendations')
    .select('*, watches(name)')
    .eq('account_id', profile?.account_id)
    .order('created_at', { ascending: false })

  const high = recs?.filter(r => r.priority === 'high') || []
  const medium = recs?.filter(r => r.priority === 'medium') || []
  const low = recs?.filter(r => r.priority === 'low') || []

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-neutral-900">Actions marché</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {recs?.length || 0} recommandations générées par l'agent stratégie
          </p>
        </div>
        {recs && recs.length > 0 && (
          <div className="flex gap-2 text-xs">
            <span className="badge badge-red">{high.length} haute priorité</span>
            <span className="badge badge-amber hidden sm:inline-flex">{medium.length} moyenne</span>
          </div>
        )}
      </div>

      {recs && recs.length > 0 ? (
        <div className="space-y-3">
          {[...high, ...medium, ...low].map((rec: any) => {
            const type = typeConfig[rec.type] || typeConfig.market_entry
            const TypeIcon = type.icon
            return (
              <div key={rec.id} className={`card-lg border-l-4 ${
                rec.priority === 'high' ? 'border-l-red-500' :
                rec.priority === 'medium' ? 'border-l-amber-500' : 'border-l-green-500'
              }`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${type.color}`}>
                        <TypeIcon size={11} />
                        {type.label}
                      </span>
                      <span className={`badge ${
                        rec.priority === 'high' ? 'badge-red' :
                        rec.priority === 'medium' ? 'badge-amber' : 'badge-green'
                      }`}>
                        {rec.priority === 'high' ? 'Priorité haute' : rec.priority === 'medium' ? 'Priorité moyenne' : 'Priorité basse'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-neutral-900">{rec.title}</h3>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-bold text-neutral-900">{Math.round((rec.confidence_score || 0) * 100)}%</div>
                    <div className="text-[10px] text-neutral-400">confiance</div>
                  </div>
                </div>

                <p className="text-xs text-neutral-600 leading-relaxed mb-3">{rec.description}</p>

                {/* Time horizon */}
                {rec.time_horizon && (
                  <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-3">
                    <Clock size={11} />
                    Horizon : {rec.time_horizon}
                    {rec.watches?.name && <span className="text-neutral-300 mx-1">·</span>}
                    {rec.watches?.name && <span>{rec.watches.name}</span>}
                  </div>
                )}

                {/* Actions */}
                {rec.actions?.length > 0 && (
                  <div className="bg-neutral-50 rounded-lg p-3 mb-3">
                    <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Actions recommandées</div>
                    <ul className="space-y-1">
                      {rec.actions.map((action: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-neutral-700">
                          <span className="w-4 h-4 rounded-full bg-blue-700 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risks */}
                {rec.risks?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="text-[10px] text-neutral-400 self-center">Risques :</span>
                    {rec.risks.map((risk: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded-full">{risk}</span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-neutral-100">
                  <button className="btn-primary text-xs py-1.5 flex-1">
                    Développer cette stratégie →
                  </button>
                  <button className="btn-ghost text-xs py-1.5 px-3" title="Marquer comme fait">
                    ✓ Traité
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card-lg flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <Star size={28} className="text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 mb-2">Aucune recommandation encore</h3>
          <p className="text-xs text-neutral-500 mb-2 max-w-xs">
            L'agent stratégie génère des recommandations à partir de vos analyses de veille.
          </p>
          <p className="text-xs text-neutral-400">
            Lancez d'abord les agents 1 → 2 → 3, puis revenez ici.
          </p>
        </div>
      )}
    </div>
  )
}
