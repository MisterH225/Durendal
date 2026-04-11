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
        className="flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-neutral-200 bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/50 px-2.5 py-1.5 rounded-full transition-all"
      >
        <MapPin size={10} className="text-blue-400" />
        <span>{saving ? '…' : currentLabel}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl py-1 min-w-[160px]">
          {regions.map(r => (
            <button
              key={r.code}
              onClick={() => handleSelect(r.code)}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                r.code === selected
                  ? 'text-blue-400 bg-blue-500/10 font-semibold'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              {r.label}
              {r.code === currentRegion && (
                <span className="ml-1.5 text-[9px] text-neutral-600">
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
