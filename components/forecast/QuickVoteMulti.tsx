'use client'

import { useState, useCallback } from 'react'

interface Outcome {
  id: string
  label: string
  color: string | null
}

const FALLBACK_COLORS = ['#818cf8', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4']

export function QuickVoteMulti({ questionId, outcomes, locale }: {
  questionId: string
  outcomes: Outcome[]
  locale: string
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(async (outcomeId: string) => {
    setSelected(outcomeId)
    setSubmitting(true)
    setError(null)
    try {
      const distribution = outcomes.map(o => ({
        outcome_id: o.id,
        probability: o.id === outcomeId ? 0.8 : 0.2 / Math.max(1, outcomes.length - 1),
      }))

      const res = await fetch(`/api/forecast/questions/${questionId}/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcomes: distribution }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 401) {
          setError(locale === 'fr' ? 'Connexion requise' : 'Sign in required')
        } else {
          setError(data.error ?? 'Erreur')
        }
        setSelected(null)
      } else {
        setDone(true)
      }
    } catch {
      setError(locale === 'fr' ? 'Erreur réseau' : 'Network error')
      setSelected(null)
    } finally {
      setSubmitting(false)
    }
  }, [questionId, outcomes, locale])

  const sorted = [...outcomes].sort((a, b) => (a as any).sort_order - (b as any).sort_order)

  return (
    <div
      className="w-full space-y-1.5"
      onClick={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="text-[9px] text-neutral-500 uppercase tracking-wide">
        {locale === 'fr' ? 'Votre choix' : 'Your pick'}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((o, idx) => {
          const color = o.color ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
          const isSelected = selected === o.id
          const isDone = done && isSelected

          return (
            <button
              key={o.id}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!done && !submitting) submit(o.id)
              }}
              disabled={submitting || done}
              className="text-[10px] font-medium px-2.5 py-1.5 rounded-lg border transition-all"
              style={{
                borderColor: isDone ? color : isSelected ? color : 'rgb(38 38 38)',
                backgroundColor: isDone ? `${color}20` : isSelected ? `${color}10` : 'transparent',
                color: isDone || isSelected ? color : 'rgb(163 163 163)',
              }}
            >
              {isDone && '✓ '}{o.label}
            </button>
          )
        })}
      </div>
      {error && <p className="text-[9px] text-red-400">{error}</p>}
    </div>
  )
}
