'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Shield, Check, Loader2, GripHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter } from 'next/navigation'

type PlanName = 'free' | 'pro' | 'business'

const PLANS: { name: PlanName; label: string; inactiveColor: string; activeColor: string }[] = [
  { name: 'free',     label: 'Free',     inactiveColor: 'bg-neutral-600 text-neutral-200 hover:bg-neutral-500',   activeColor: 'bg-white text-neutral-900' },
  { name: 'pro',      label: 'Pro',      inactiveColor: 'bg-blue-800 text-blue-200 hover:bg-blue-700',            activeColor: 'bg-blue-400 text-white' },
  { name: 'business', label: 'Business', inactiveColor: 'bg-purple-800 text-purple-200 hover:bg-purple-700',      activeColor: 'bg-purple-400 text-white' },
]

const STORAGE_KEY = 'superadmin-bar-pos'

export default function SuperAdminBar({ currentPlanName }: { currentPlanName: string }) {
  const router = useRouter()
  const [switching, setSwitching] = useState<PlanName | null>(null)
  const [switched, setSwitched] = useState<PlanName | null>(null)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [hidden, setHidden] = useState(false)

  // Position drag
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // Restaurer position depuis localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setPos(JSON.parse(saved))
    } catch {}
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!barRef.current) return
    dragging.current = true
    const rect = barRef.current.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }, [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const newPos = {
        x: Math.max(0, Math.min(window.innerWidth - 300, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y)),
      }
      setPos(newPos)
    }
    function onUp() {
      if (dragging.current) {
        dragging.current = false
        setPos(p => {
          if (p) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch {}
          }
          return p
        })
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  async function switchPlan(planName: PlanName) {
    if (switching || planName === (switched ?? currentPlanName)) return
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
      setTimeout(() => { setSwitched(null); router.refresh() }, 800)
    } catch (e: any) {
      setError(e.message || 'Erreur')
    } finally {
      setSwitching(null)
    }
  }

  if (hidden) return null

  const activePlan = switched ?? currentPlanName
  const style: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, bottom: 'auto', transform: 'none' }
    : { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)' }

  return (
    <div ref={barRef} style={{ ...style, zIndex: 9999 }}>
      <div className="bg-neutral-900 text-white rounded-2xl shadow-2xl border border-neutral-700 overflow-hidden select-none min-w-[260px]">

        {/* Drag handle + header */}
        <div className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing"
          onMouseDown={onMouseDown}>
          <GripHorizontal size={13} className="text-neutral-500 flex-shrink-0" />
          <Shield size={12} className="text-amber-400 flex-shrink-0" />
          <span className="text-[11px] font-bold text-neutral-300 tracking-wide flex-1">SUPER ADMIN</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize
            ${activePlan === 'business' ? 'bg-purple-700 text-purple-200' :
              activePlan === 'pro' ? 'bg-blue-700 text-blue-200' :
              'bg-neutral-700 text-neutral-300'}`}>
            {activePlan}
          </span>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-neutral-500 hover:text-neutral-300 ml-1"
            onMouseDown={e => e.stopPropagation()}
          >
            {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            onClick={() => setHidden(true)}
            className="text-neutral-600 hover:text-red-400 transition-colors"
            title="Masquer la barre (jusqu'au prochain rechargement)"
            onMouseDown={e => e.stopPropagation()}
          >
            <X size={12} />
          </button>
        </div>

        {/* Body collapsible */}
        {!collapsed && (
          <div className="px-3 pb-3 border-t border-neutral-800">
            <p className="text-[10px] text-neutral-500 mt-2 mb-2">Tester en tant que :</p>
            <div className="flex items-center gap-1.5">
              {PLANS.map(({ name, label, inactiveColor, activeColor }) => {
                const isActive = activePlan === name
                const isLoading = switching === name
                return (
                  <button
                    key={name}
                    onClick={() => switchPlan(name)}
                    disabled={!!switching}
                    onMouseDown={e => e.stopPropagation()}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all
                      ${isActive ? activeColor : inactiveColor}
                      disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {isLoading
                      ? <Loader2 size={10} className="animate-spin" />
                      : isActive && switched
                        ? <Check size={10} />
                        : null
                    }
                    {label}
                  </button>
                )
              })}
            </div>
            {error && <p className="text-[10px] text-red-400 mt-2 break-all">{error}</p>}
            <p className="text-[10px] text-neutral-600 mt-2">
              Glisse pour déplacer · ✕ pour masquer
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
