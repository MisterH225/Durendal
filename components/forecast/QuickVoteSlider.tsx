'use client'

import { useState, useCallback, useRef } from 'react'

interface Props {
  questionId: string
  locale: string
}

export function QuickVoteSlider({ questionId, locale }: Props) {
  const [value, setValue] = useState(50)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(Number(e.target.value))
    setDone(false)
    setError(null)
  }, [])

  const submit = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/forecast/questions/${questionId}/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probability: value / 100 }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 401) {
          setError(locale === 'fr' ? 'Connexion requise' : 'Sign in required')
        } else {
          setError(data.error ?? 'Erreur')
        }
      } else {
        setDone(true)
      }
    } catch {
      setError(locale === 'fr' ? 'Erreur réseau' : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }, [questionId, value, locale])

  const thumbColor = value < 30 ? '#ef4444' : value < 55 ? '#eab308' : '#22c55e'

  return (
    <div
      className="w-full space-y-1.5"
      onClick={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-neutral-500 uppercase tracking-wide">
          {locale === 'fr' ? 'Votre estimation' : 'Your estimate'}
        </span>
        <span className="text-xs font-bold tabular-nums" style={{ color: thumbColor }}>
          {value}%
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={1}
          max={99}
          value={value}
          onChange={handleChange}
          className="flex-1 h-1.5 appearance-none rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, #ef4444 0%, #eab308 45%, #22c55e 100%)`,
            accentColor: thumbColor,
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            submit()
          }}
          disabled={submitting || done}
          className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex-shrink-0 ${
            done
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : submitting
              ? 'bg-neutral-800 text-neutral-500 border border-neutral-700'
              : 'bg-blue-600/90 hover:bg-blue-500 text-white border border-blue-500/30'
          }`}
        >
          {done
            ? '✓'
            : submitting
            ? '…'
            : locale === 'fr' ? 'Voter' : 'Vote'}
        </button>
      </div>

      {error && (
        <p className="text-[9px] text-red-400">{error}</p>
      )}
    </div>
  )
}
