'use client'

import { useState, useCallback } from 'react'
import { Bookmark, Share2, Check, Link2 } from 'lucide-react'

interface Props {
  signalId: string
  signalTitle: string
  initialBookmarked?: boolean
  locale: string
  compact?: boolean
}

export function BookmarkButton({ signalId, initialBookmarked = false, locale, compact = false }: Omit<Props, 'signalTitle'>) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      const res = await fetch('/api/forecast/signals/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId }),
      })
      if (res.ok) {
        const data = await res.json()
        setBookmarked(data.bookmarked)
      } else if (res.status === 401) {
        // Not logged in — could redirect but for now just ignore
      }
    } catch { /* network error */ }
    finally { setLoading(false) }
  }, [signalId])

  if (compact) {
    return (
      <button
        onClick={toggle}
        disabled={loading}
        title={bookmarked ? (locale === 'fr' ? 'Ne plus suivre' : 'Unfollow') : (locale === 'fr' ? 'Suivre' : 'Follow')}
        className={`p-1.5 rounded-lg transition-all ${
          bookmarked
            ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
            : 'text-neutral-500 hover:text-blue-400 hover:bg-neutral-800'
        } ${loading ? 'opacity-50' : ''}`}
      >
        <Bookmark size={13} className={bookmarked ? 'fill-current' : ''} />
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
        bookmarked
          ? 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20'
          : 'text-neutral-400 border-neutral-700 hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/5'
      } ${loading ? 'opacity-50' : ''}`}
    >
      <Bookmark size={12} className={bookmarked ? 'fill-current' : ''} />
      {bookmarked
        ? (locale === 'fr' ? 'Suivi' : 'Following')
        : (locale === 'fr' ? 'Suivre' : 'Follow')}
    </button>
  )
}

export function ShareButton({ signalId, signalTitle, locale, compact = false }: Props) {
  const [copied, setCopied] = useState(false)

  const share = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const url = `${window.location.origin}/forecast/signals/${signalId}`

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: signalTitle, url })
        return
      } catch { /* user cancelled or not supported */ }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }, [signalId, signalTitle])

  if (compact) {
    return (
      <button
        onClick={share}
        title={locale === 'fr' ? 'Partager' : 'Share'}
        className={`p-1.5 rounded-lg transition-all ${
          copied
            ? 'text-emerald-400 bg-emerald-500/10'
            : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
        }`}
      >
        {copied ? <Check size={13} /> : <Share2 size={13} />}
      </button>
    )
  }

  return (
    <button
      onClick={share}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
        copied
          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
          : 'text-neutral-400 border-neutral-700 hover:text-neutral-200 hover:border-neutral-600'
      }`}
    >
      {copied ? <Check size={12} /> : <Share2 size={12} />}
      {copied
        ? (locale === 'fr' ? 'Copié !' : 'Copied!')
        : (locale === 'fr' ? 'Partager' : 'Share')}
    </button>
  )
}
