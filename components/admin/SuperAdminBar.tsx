'use client'
import { useState } from 'react'
import { Shield, Check, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'

type PlanName = 'free' | 'pro' | 'business'

const PLANS: { name: PlanName; label: string; color: string; activeColor: string }[] = [
  { name: 'free',     label: 'Free',     color: 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300',    activeColor: 'bg-neutral-700 text-white' },
  { name: 'pro',      label: 'Pro',      color: 'bg-blue-100 text-blue-700 hover:bg-blue-200',             activeColor: 'bg-blue-700 text-white' },
  { name: 'business', label: 'Business', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200',       activeColor: 'bg-purple-700 text-white' },
]

export default function SuperAdminBar({ currentPlanName }: { currentPlanName: string }) {
  const router = useRouter()
  const [switching, setSwitching] = useState<PlanName | null>(null)
  const [switched, setSwitched] = useState<PlanName | null>(null)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  async function switchPlan(planName: PlanName) {
    if (switching || planName === currentPlanName) return
    setSwitching(planName)
    setError('')
    try {
      const res = await fetch('/api/admin/switch-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
      setSwitched(planName)
      setTimeout(() => {
        setSwitched(null)
        router.refresh()
      }, 800)
    } catch (e: any) {
      setError(e.message || 'Erreur lors du changement de plan')
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-neutral-900 text-white rounded-2xl shadow-2xl border border-neutral-700 overflow-hidden">
        {/* Toggle header */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 px-4 py-2.5 w-full hover:bg-neutral-800 transition-colors"
        >
          <Shield size={13} className="text-amber-400 flex-shrink-0" />
          <span className="text-[11px] font-bold text-neutral-300 tracking-wide">SUPER ADMIN</span>
          <span className="text-[10px] bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded-full ml-1 capitalize">
            {switched ? `→ ${switched}` : currentPlanName}
          </span>
          <span className="ml-auto text-neutral-500">
            {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </button>

        {/* Contenu collapsible */}
        {!collapsed && (
          <div className="px-4 pb-3 border-t border-neutral-800">
            <p className="text-[10px] text-neutral-500 mt-2 mb-2.5">Tester en tant que :</p>
            <div className="flex items-center gap-2">
              {PLANS.map(({ name, label, color, activeColor }) => {
                const isActive = (switched || currentPlanName) === name
                const isLoading = switching === name
                const isDone = switched === name
                return (
                  <button
                    key={name}
                    onClick={() => switchPlan(name)}
                    disabled={!!switching}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all
                      ${isActive ? activeColor : color}
                      ${switching && !isLoading ? 'opacity-50' : ''}
                      disabled:cursor-not-allowed
                    `}
                  >
                    {isLoading
                      ? <Loader2 size={11} className="animate-spin" />
                      : isDone
                        ? <Check size={11} />
                        : null
                    }
                    {label}
                  </button>
                )
              })}
            </div>
            {error && (
              <p className="text-[10px] text-red-400 mt-2">{error}</p>
            )}
            <p className="text-[10px] text-neutral-600 mt-2.5">
              Recharge la page après le switch pour voir les changements.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
