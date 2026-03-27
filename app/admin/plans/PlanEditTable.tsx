'use client'
import { useState } from 'react'
import { Check, AlertCircle } from 'lucide-react'

type Plan = {
  id: string
  display_name: string
  price_monthly: number
  max_watches: number
  max_companies: number
  max_reports_per_month: number
  max_team_members: number | null
}

export default function PlanEditTable({ plans }: { plans: Plan[] }) {
  const [values, setValues] = useState<Record<string, Record<string, number>>>(
    Object.fromEntries(plans.map(p => [p.id, {
      price_monthly: p.price_monthly / 100,
      max_watches: p.max_watches,
      max_companies: p.max_companies,
      max_reports_per_month: p.max_reports_per_month,
      max_team_members: p.max_team_members || 1,
    }]))
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function update(planId: string, field: string, val: number) {
    setValues(prev => ({ ...prev, [planId]: { ...prev[planId], [field]: val } }))
  }

  async function save(planId: string) {
    setSaving(planId)
    setError(null)
    try {
      const v = values[planId]
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_monthly: Math.round(v.price_monthly * 100),
          max_watches: v.max_watches,
          max_companies: v.max_companies,
          max_reports_per_month: v.max_reports_per_month,
          max_team_members: v.max_team_members,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(planId)
      setTimeout(() => setSaved(null), 3000)
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="card-lg">
      <h3 className="text-sm font-bold text-neutral-900 mb-4">Modifier les limites directement</h3>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {['Plan', 'Prix/mois (€)', 'Max veilles', 'Max entreprises', 'Max rapports', 'Membres', ''].map(h => (
                <th key={h} className="text-left py-2.5 px-3 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map(plan => {
              const v = values[plan.id]
              const isSaving = saving === plan.id
              const isDone = saved === plan.id
              return (
                <tr key={plan.id} className="border-b border-neutral-50">
                  <td className="py-2.5 px-3 font-bold text-neutral-900">{plan.display_name}</td>
                  {(['price_monthly', 'max_watches', 'max_companies', 'max_reports_per_month', 'max_team_members'] as const).map(field => (
                    <td key={field} className="py-2.5 px-3">
                      <input
                        type="number"
                        min={0}
                        value={v[field]}
                        onChange={e => update(plan.id, field, Number(e.target.value))}
                        className="w-20 px-2 py-1 border border-neutral-200 rounded text-xs focus:outline-none focus:border-blue-400"
                      />
                    </td>
                  ))}
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => save(plan.id)}
                      disabled={isSaving}
                      className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded font-semibold transition-colors ${
                        isDone ? 'bg-green-600 text-white' :
                        'bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50'
                      }`}
                    >
                      {isDone ? <><Check size={11} /> Sauvegardé</> : isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-400 mt-3">
        Les modifications s&apos;appliquent immédiatement à tous les utilisateurs du plan concerné.
      </p>
    </div>
  )
}
