'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import type { Locale } from '@/lib/i18n/translations'

interface Props {
  currentQuery: string
  locale: Locale
  basePath: string
}

export function SignalSearchBar({ currentQuery, locale, basePath }: Props) {
  const [value, setValue] = useState(currentQuery)
  const router = useRouter()

  const submit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    const url = new URL(basePath, window.location.origin)
    if (trimmed) {
      url.searchParams.set('q', trimmed)
    } else {
      url.searchParams.delete('q')
    }
    url.searchParams.delete('page')
    router.push(url.pathname + url.search)
  }, [value, basePath, router])

  const clear = useCallback(() => {
    setValue('')
    const url = new URL(basePath, window.location.origin)
    url.searchParams.delete('q')
    url.searchParams.delete('page')
    router.push(url.pathname + url.search)
  }, [basePath, router])

  return (
    <form onSubmit={submit} className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={locale === 'fr' ? 'Rechercher par thème, mot-clé, sujet...' : 'Search by theme, keyword, topic...'}
        className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl pl-9 pr-10 py-2.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </form>
  )
}
