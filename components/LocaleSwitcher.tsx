'use client'
import { useTransition } from 'react'
import { setLocale } from '@/lib/i18n/actions'
import type { Locale } from '@/lib/i18n/translations'

export function LocaleSwitcher({ current }: { current: Locale }) {
  const [pending, startTransition] = useTransition()

  const toggle = (locale: Locale) => {
    if (locale === current) return
    startTransition(() => { setLocale(locale) })
  }

  return (
    <div className={`flex items-center gap-0.5 text-[11px] font-semibold rounded-lg border border-neutral-700 overflow-hidden transition-opacity ${pending ? 'opacity-50' : ''}`}>
      <button
        onClick={() => toggle('fr')}
        className={`px-2.5 py-1.5 transition-colors ${
          current === 'fr'
            ? 'bg-neutral-700 text-white'
            : 'text-neutral-500 hover:text-neutral-300'
        }`}
      >
        FR
      </button>
      <button
        onClick={() => toggle('en')}
        className={`px-2.5 py-1.5 transition-colors ${
          current === 'en'
            ? 'bg-neutral-700 text-white'
            : 'text-neutral-500 hover:text-neutral-300'
        }`}
      >
        EN
      </button>
    </div>
  )
}
