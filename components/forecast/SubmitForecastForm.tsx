'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProbabilityGauge } from './ProbabilityGauge'
import type { Locale } from '@/lib/i18n/translations'
import { tr } from '@/lib/i18n/translations'

interface Props {
  questionId: string
  currentUserProbability: number | null
  isAuthenticated: boolean
  locale: Locale
}

export function SubmitForecastForm({ questionId, currentUserProbability, isAuthenticated, locale }: Props) {
  const router = useRouter()
  const [value, setValue] = useState<number>(currentUserProbability ?? 50)
  const [reasoning, setReasoning] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 text-center">
        <p className="text-sm text-neutral-400 mb-3">{tr(locale, 'form.login_prompt')}</p>
        <a href="/login" className="inline-block px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          {tr(locale, 'form.login_btn')}
        </a>
      </div>
    )
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/30 p-6 text-center">
        <div className="text-2xl mb-2">✓</div>
        <p className="text-sm text-emerald-400 font-medium">{tr(locale, 'form.success')} — {value}%</p>
        <p className="text-xs text-neutral-500 mt-1">{tr(locale, 'form.success_msg')}</p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/forecast/questions/${questionId}/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probability: value / 100, reasoning: reasoning || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Error'); return }
      setSuccess(true)
      router.refresh()
    } finally { setSubmitting(false) }
  }

  const isUpdate = currentUserProbability !== null

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">{tr(locale, 'form.title')}</h3>
        {isUpdate && <span className="text-xs text-neutral-500">{tr(locale, 'form.current')} : {currentUserProbability}%</span>}
      </div>

      <div className="flex justify-center py-2">
        <ProbabilityGauge value={value} size={100} label={tr(locale, 'form.vote_label')} />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-neutral-500">
          <span>{tr(locale, 'form.no_label')}</span>
          <span className="font-mono font-bold text-neutral-200 text-sm">{value}%</span>
          <span>{tr(locale, 'form.yes_label')}</span>
        </div>
        <input
          type="range" min={1} max={99} step={1} value={value}
          onChange={e => setValue(Number(e.target.value))}
          className="w-full accent-blue-500 cursor-pointer"
        />
        <div className="flex gap-2 justify-center mt-1">
          {[10, 25, 50, 75, 90].map(v => (
            <button key={v} type="button" onClick={() => setValue(v)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${value === v ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-neutral-700 text-neutral-500 hover:border-neutral-500'}`}>
              {v}%
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-neutral-500 mb-1 block">{tr(locale, 'form.reason')}</label>
        <textarea
          value={reasoning} onChange={e => setReasoning(e.target.value)}
          rows={2} placeholder={tr(locale, 'form.reason_ph')}
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          maxLength={500}
        />
      </div>

      {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">{error}</div>}

      <button type="submit" disabled={submitting}
        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
        {submitting ? tr(locale, 'form.submitting') : isUpdate ? tr(locale, 'form.update') : tr(locale, 'form.submit')}
      </button>
    </form>
  )
}
