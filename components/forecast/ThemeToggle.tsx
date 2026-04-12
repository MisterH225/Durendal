'use client'

import { useCallback, useLayoutEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const STORAGE_KEY = 'marketlens-theme'

function readTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

function applyTheme(mode: 'light' | 'dark') {
  const root = document.documentElement
  if (mode === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function ThemeToggle({ locale }: { locale: 'fr' | 'en' }) {
  const [mode, setMode] = useState<'light' | 'dark'>('dark')

  useLayoutEffect(() => {
    setMode(readTheme())
  }, [])

  const toggle = useCallback(() => {
    const next = mode === 'dark' ? 'light' : 'dark'
    setMode(next)
    applyTheme(next)
  }, [mode])

  const isDark = mode === 'dark'
  const label =
    locale === 'fr'
      ? isDark
        ? 'Passer au thème clair'
        : 'Passer au thème sombre'
      : isDark
        ? 'Switch to light theme'
        : 'Switch to dark theme'

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="flex items-center justify-center w-9 h-9 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 transition-colors dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
    >
      {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-neutral-600" />}
    </button>
  )
}
