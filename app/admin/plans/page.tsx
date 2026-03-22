import { createClient } from '@/lib/supabase/server'
import { Check, X, Edit } from 'lucide-react'

export default async function AdminPlansPage() {
  const supabase = createClient()
  const { data: plans } = await supabase.from('plans').select('*').eq('is_active', true).order('price_monthly')

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-neutral-900">Plans & offres</h2>
        <button className="btn-primary text-sm flex items-center gap-1.5 px-3 py-2">
          + Nouveau plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {plans?.map((plan: any) => (
          <div key={plan.id} className={`card-lg border-t-4 ${
            plan.name === 'free' ? 'border-t-neutral-400' :
            plan.name === 'pro' ? 'border-t-blue-700' : 'border-t-purple-600'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-base font-bold text-neutral-900">{plan.display_name}</div>
                <div className="text-lg font-bold text-blue-700 mt-0.5">
                  {plan.price_monthly === 0 ? 'Gratuit' : `${(plan.price_monthly/100).toFixed(0)}€/mois`}
                </div>
              </div>
              <button className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center hover:bg-neutral-200 transition-colors">
                <Edit size={13} className="text-neutral-600" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {[
                { label: 'Veilles max', value: plan.max_watches > 100 ? '∞' : plan.max_watches },
                { label: 'Entreprises max', value: plan.max_companies > 100 ? '∞' : plan.max_companies },
                { label: 'Rapports/mois', value: plan.max_reports_per_month > 100 ? '∞' : plan.max_reports_per_month },
                { label: 'Temps réel', value: plan.realtime_collection },
                { label: 'Assistant IA', value: plan.has_assistant },
                { label: 'Sources docs', value: plan.has_doc_sources },
                { label: 'Export PDF', value: plan.has_export },
                { label: 'Membres max', value: plan.max_team_members || 1 },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-1 border-b border-neutral-50 last:border-0">
                  <span className="text-neutral-500">{label}</span>
                  <span className="font-semibold text-neutral-900">
                    {typeof value === 'boolean'
                      ? value ? <Check size={12} className="text-green-600" /> : <X size={12} className="text-neutral-300" />
                      : value
                    }
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-neutral-100">
              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Agents inclus</div>
              <div className="flex gap-1">
                {[1,2,3,4].map(n => (
                  <span key={n} className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    plan.agents_enabled?.includes(n) ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-400'
                  }`}>A{n}</span>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Support</div>
              <span className={`badge text-[10px] ${
                plan.support_level === 'priority' ? 'badge-purple' :
                plan.support_level === 'chat' ? 'badge-blue' : 'badge-gray'
              }`}>
                {plan.support_level === 'priority' ? 'Prioritaire 7j/7' :
                 plan.support_level === 'chat' ? 'Live Chat' : 'FAQ uniquement'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Raw edit table */}
      <div className="card-lg">
        <h3 className="text-sm font-bold text-neutral-900 mb-4">Modifier les limites directement</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {['Plan', 'Prix/mois', 'Max veilles', 'Max entreprises', 'Max rapports', 'Membres', ''].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans?.map((plan: any) => (
                <tr key={plan.id} className="border-b border-neutral-50">
                  <td className="py-2.5 px-3 font-bold text-neutral-900">{plan.display_name}</td>
                  <td className="py-2.5 px-3">
                    <input defaultValue={plan.price_monthly / 100} type="number"
                      className="w-16 px-2 py-1 border border-neutral-200 rounded text-xs" />€
                  </td>
                  <td className="py-2.5 px-3">
                    <input defaultValue={plan.max_watches} type="number"
                      className="w-16 px-2 py-1 border border-neutral-200 rounded text-xs" />
                  </td>
                  <td className="py-2.5 px-3">
                    <input defaultValue={plan.max_companies} type="number"
                      className="w-16 px-2 py-1 border border-neutral-200 rounded text-xs" />
                  </td>
                  <td className="py-2.5 px-3">
                    <input defaultValue={plan.max_reports_per_month} type="number"
                      className="w-16 px-2 py-1 border border-neutral-200 rounded text-xs" />
                  </td>
                  <td className="py-2.5 px-3">
                    <input defaultValue={plan.max_team_members || 1} type="number"
                      className="w-16 px-2 py-1 border border-neutral-200 rounded text-xs" />
                  </td>
                  <td className="py-2.5 px-3">
                    <button className="text-[10px] px-2.5 py-1 bg-blue-700 text-white rounded font-semibold hover:bg-blue-800 transition-colors">
                      Sauvegarder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-neutral-400 mt-3">
          Les modifications sont appliquées instantanément à tous les utilisateurs du plan concerné.
        </p>
      </div>
    </div>
  )
}
