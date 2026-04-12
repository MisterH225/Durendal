'use client'

import { useState } from 'react'
import { MapPin, ChevronDown } from 'lucide-react'

interface RegionOption {
  code: string
  label: string
}

export function RegionSelector({
  regions,
  currentRegion,
  locale,
}: {
  regions: RegionOption[]
  currentRegion: string
  locale: string
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(currentRegion)

  const currentLabel = regions.find(r => r.code === selected)?.label ?? (locale === 'fr' ? 'Mondial' : 'Global')

  async function handleSelect(code: string) {
    setSelected(code)
    setOpen(false)
    setSaving(true)
    try {
      await fetch('/api/user/region', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: code }),
      })
      window.location.reload()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] text-neutral-600 hover:text-neutral-900 bg-white/90 hover:bg-neutral-100 border border-neutral-300 px-2.5 py-1.5 rounded-full transition-all dark:text-neutral-400 dark:hover:text-neutral-200 dark:bg-neutral-800/60 dark:hover:bg-neutral-800 dark:border-neutral-700/50"
      >
        <MapPin size={10} className="text-blue-400" />
        <span>{saving ? '…' : currentLabel}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded-xl shadow-xl py-1 min-w-[160px] dark:bg-neutral-900 dark:border-neutral-700">
          {regions.map(r => (
            <button
              key={r.code}
              onClick={() => handleSelect(r.code)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                r.code === selected
                  ? 'text-blue-700 bg-blue-50 font-semibold dark:text-blue-400 dark:bg-blue-500/10'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white'
              }`}
            >
              {r.label}
              {r.code === currentRegion && (
                <span className="ml-1.5 text-[9px] text-neutral-500 dark:text-neutral-600">
                  {locale === 'fr' ? '(détecté)' : '(detected)'}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
