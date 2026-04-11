'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Outcome {
  id: string
  label: string
  sort_order: number
  color: string | null
}

const FALLBACK_COLORS = ['#818cf8', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4']

interface Props {
  questionId: string
  outcomes: Outcome[]
  isAuthenticated: boolean
  locale: string
}

export function SubmitMultiChoiceForm({ questionId, outcomes, isAuthenticated, locale }: Props) {
  const router = useRouter()
  const sorted = [...outcomes].sort((a, b) => a.sort_order - b.sort_order)

  const initial = Object.fromEntries(sorted.map(o => [o.id, Math.round(100 / sorted.length)]))
  const [values, setValues] = useState<Record<string, number>>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = Object.values(values).reduce((s, v) => s + v, 0)

  function handleChange(outcomeId: string, val: number) {
    setValues(prev => ({ ...prev, [outcomeId]: val }))
    setSuccess(false)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (Math.abs(total - 100) > 5) {
      setError(locale === 'fr' ? `Le total doit être ~100% (actuellement ${total}%)` : `Total must be ~100% (currently ${total}%)`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/forecast/questions/${questionId}/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcomes: sorted.map(o => ({
            outcome_id: o.id,
            probability: (values[o.id] ?? 0) / 100,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error')
        return
      }
      setSuccess(true)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center space-y-3">
        <p className="text-sm text-neutral-400">{locale === 'fr' ? 'Connectez-vous pour distribuer vos probabilités.' : 'Sign in to distribute your probabilities.'}</p>
        <Link href="/login" className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors">
          {locale === 'fr' ? 'Se connecter' : 'Sign in'}
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 p-6 text-center space-y-2">
        <p className="text-sm font-semibold text-emerald-300">{locale === 'fr' ? 'Distribution soumise !' : 'Distribution submitted!'}</p>
        <p className="text-xs text-emerald-600">{locale === 'fr' ? 'Merci pour votre participation.' : 'Thanks for participating.'}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4">
      <p className="text-xs text-neutral-500">
        {locale === 'fr'
          ? 'Distribuez vos probabilités entre les options (total ≈ 100%).'
          : 'Distribute your probabilities across outcomes (total ≈ 100%).'}
      </p>

      <div className="space-y-3">
        {sorted.map((o, idx) => {
          const color = o.color ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
          const val = values[o.id] ?? 0

          return (
            <div key={o.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-200">{o.label}</span>
                <span className="text-xs font-bold tabular-nums" style={{ color }}>{val}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={val}
                onChange={e => handleChange(o.id, Number(e.target.value))}
                className="w-full h-1.5 appearance-none rounded-full cursor-pointer"
                style={{ accentColor: color }}
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${Math.abs(total - 100) <= 5 ? 'text-emerald-400' : 'text-red-400'}`}>
          Total : {total}%
        </span>
        {Math.abs(total - 100) > 5 && (
          <span className="text-red-400 text-[10px]">{locale === 'fr' ? 'Doit être ≈ 100%' : 'Must be ≈ 100%'}</span>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || Math.abs(total - 100) > 5}
        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
      >
        {submitting
          ? (locale === 'fr' ? 'Envoi…' : 'Sending…')
          : (locale === 'fr' ? 'Soumettre ma distribution' : 'Submit my distribution')}
      </button>
    </form>
  )
}
