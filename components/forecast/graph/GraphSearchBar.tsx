'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import type { IntelligenceGraphNode } from '@/lib/graph/types'
import { NODE_TYPE_CONFIG } from '@/lib/graph/types'

interface GraphSearchBarProps {
  onSearch: (query: string) => void
  isLoading: boolean
}

export function GraphSearchBar({ onSearch, isLoading }: GraphSearchBarProps) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<IntelligenceGraphNode[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return }
    try {
      const res = await fetch(`/api/forecast/graph/search?mode=suggest&q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSuggestions(data.suggestions ?? [])
    } catch { setSuggestions([]) }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (value.length >= 2) {
      debounceRef.current = setTimeout(() => fetchSuggestions(value), 200)
    } else {
      setSuggestions([])
    }
    return () => clearTimeout(debounceRef.current)
  }, [value, fetchSuggestions])

  const submit = (q: string) => {
    if (!q.trim()) return
    onSearch(q.trim())
    setShowSuggestions(false)
    setSelectedIdx(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (selectedIdx >= 0 && suggestions[selectedIdx]) {
        setValue(suggestions[selectedIdx].label)
        submit(suggestions[selectedIdx].label)
      } else {
        submit(value)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  return (
    <div className="relative w-full max-w-2xl">
      <div className="relative flex items-center">
        <Search size={16} className="absolute left-3 text-neutral-500" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setShowSuggestions(true); setSelectedIdx(-1) }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={onKeyDown}
          placeholder="Rechercher — Iran, cacao, Niger, inflation, IA…"
          className="w-full pl-10 pr-10 py-2.5 text-sm bg-neutral-900 border border-neutral-700 rounded-xl text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
        />
        {isLoading && <Loader2 size={16} className="absolute right-3 text-blue-400 animate-spin" />}
        {!isLoading && value && (
          <button onClick={() => { setValue(''); setSuggestions([]) }} className="absolute right-3 text-neutral-500 hover:text-neutral-300">
            <X size={16} />
          </button>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl overflow-hidden">
          {suggestions.map((s, i) => {
            const cfg = NODE_TYPE_CONFIG[s.type]
            return (
              <button
                key={s.id}
                onMouseDown={() => { setValue(s.label); submit(s.label) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  i === selectedIdx ? 'bg-neutral-800' : 'hover:bg-neutral-800/50'
                }`}
              >
                <span className="text-sm">{cfg.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-neutral-200 truncate">{s.label}</div>
                  <div className="text-[10px] text-neutral-500 truncate">{cfg.label}{s.subtitle ? ` · ${s.subtitle}` : ''}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
