'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Locale } from '@/lib/i18n/translations'
import { tr } from '@/lib/i18n/translations'
import { MessageCircle, Send } from 'lucide-react'

type Row = { id: string; body: string; created_at: string; author_label: string }

interface Props {
  questionParam: string
  locale: Locale
  isAuthenticated: boolean
}

export function QuestionComments({ questionParam, locale, isAuthenticated }: Props) {
  const [comments, setComments] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/forecast/questions/${encodeURIComponent(questionParam)}/comments`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erreur')
      setComments(json.comments ?? [])
    } catch (e) {
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [questionParam])

  useEffect(() => { void load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isAuthenticated || !text.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/forecast/questions/${encodeURIComponent(questionParam)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : tr(locale, 'comments.error'))
        return
      }
      setText('')
      await load()
    } finally {
      setSending(false)
    }
  }

  const dateFmt = locale === 'fr' ? 'fr-FR' : 'en-GB'

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle size={16} className="text-neutral-400" />
        <h2 className="text-sm font-semibold text-neutral-200">{tr(locale, 'comments.title')}</h2>
      </div>

      {loading ? (
        <p className="text-xs text-neutral-500">{tr(locale, 'comments.loading')}</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-neutral-500">{tr(locale, 'comments.empty')}</p>
      ) : (
        <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {comments.map(c => (
            <li key={c.id} className="border-b border-neutral-800/80 pb-3 last:border-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-neutral-300">{c.author_label}</span>
                <time className="text-[10px] text-neutral-600 flex-shrink-0" dateTime={c.created_at}>
                  {new Date(c.created_at).toLocaleString(dateFmt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
              <p className="text-sm text-neutral-400 whitespace-pre-wrap leading-relaxed">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {isAuthenticated ? (
        <form onSubmit={submit} className="space-y-2 pt-2 border-t border-neutral-800">
          <label className="text-xs text-neutral-500">{tr(locale, 'comments.placeholder_lbl')}</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={tr(locale, 'comments.placeholder')}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            <Send size={12} />{sending ? tr(locale, 'comments.sending') : tr(locale, 'comments.submit')}
          </button>
        </form>
      ) : (
        <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-800">
          <a href="/login" className="text-blue-400 hover:text-blue-300">{tr(locale, 'comments.login')}</a>
          {' · '}{tr(locale, 'comments.login_hint')}
        </p>
      )}
    </div>
  )
}
