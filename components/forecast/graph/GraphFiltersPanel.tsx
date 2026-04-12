'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import type { GraphFilters, GraphNodeType, GraphEdgeType } from '@/lib/graph/types'
import { NODE_TYPE_CONFIG, DEFAULT_FILTERS } from '@/lib/graph/types'

interface GraphFiltersPanelProps {
  filters: GraphFilters
  onChange: (filters: GraphFilters) => void
}

export function GraphFiltersPanel({ filters, onChange }: GraphFiltersPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    nodeTypes: true,
    dateRange: true,
    confidence: false,
  })

  const toggle = (section: string) =>
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))

  const toggleNodeType = (t: GraphNodeType) => {
    const next = filters.nodeTypes.includes(t)
      ? filters.nodeTypes.filter(x => x !== t)
      : [...filters.nodeTypes, t]
    onChange({ ...filters, nodeTypes: next })
  }

  const reset = () => onChange(DEFAULT_FILTERS)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">Filtres</h3>
        <button onClick={reset} className="text-[10px] text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors">
          <RotateCcw size={10} /> Réinitialiser
        </button>
      </div>

      {/* Node types */}
      <div>
        <button onClick={() => toggle('nodeTypes')} className="w-full flex items-center justify-between py-1">
          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Types de nœuds</span>
          {expandedSections.nodeTypes ? <ChevronUp size={12} className="text-neutral-600" /> : <ChevronDown size={12} className="text-neutral-600" />}
        </button>
        {expandedSections.nodeTypes && (
          <div className="grid grid-cols-2 gap-1 mt-1">
            {(Object.entries(NODE_TYPE_CONFIG) as [GraphNodeType, typeof NODE_TYPE_CONFIG[GraphNodeType]][]).map(([type, cfg]) => (
              <button
                key={type}
                onClick={() => toggleNodeType(type)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-left text-[10px] transition-colors border ${
                  filters.nodeTypes.includes(type)
                    ? `${cfg.bgClass} ${cfg.borderClass} ${cfg.textClass}`
                    : 'bg-neutral-900 border-neutral-800 text-neutral-600'
                }`}
              >
                <span className="text-xs">{cfg.icon}</span>
                <span className="truncate">{cfg.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Date range */}
      <div>
        <button onClick={() => toggle('dateRange')} className="w-full flex items-center justify-between py-1">
          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Période</span>
          {expandedSections.dateRange ? <ChevronUp size={12} className="text-neutral-600" /> : <ChevronDown size={12} className="text-neutral-600" />}
        </button>
        {expandedSections.dateRange && (
          <div className="space-y-1.5 mt-1">
            <div>
              <label className="text-[9px] text-neutral-500">Depuis</label>
              <input
                type="date"
                value={filters.dateRange.from ?? ''}
                onChange={e => onChange({ ...filters, dateRange: { ...filters.dateRange, from: e.target.value || null } })}
                className="w-full mt-0.5 px-2 py-1 text-[10px] bg-neutral-900 border border-neutral-700 rounded text-neutral-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] text-neutral-500">Jusqu'à</label>
              <input
                type="date"
                value={filters.dateRange.to ?? ''}
                onChange={e => onChange({ ...filters, dateRange: { ...filters.dateRange, to: e.target.value || null } })}
                className="w-full mt-0.5 px-2 py-1 text-[10px] bg-neutral-900 border border-neutral-700 rounded text-neutral-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Confidence */}
      <div>
        <button onClick={() => toggle('confidence')} className="w-full flex items-center justify-between py-1">
          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Confiance min.</span>
          {expandedSections.confidence ? <ChevronUp size={12} className="text-neutral-600" /> : <ChevronDown size={12} className="text-neutral-600" />}
        </button>
        {expandedSections.confidence && (
          <div className="mt-1">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(filters.minConfidence * 100)}
              onChange={e => onChange({ ...filters, minConfidence: parseInt(e.target.value) / 100 })}
              className="w-full h-1 accent-blue-500"
            />
            <div className="flex justify-between text-[9px] text-neutral-600 mt-0.5">
              <span>0%</span>
              <span className="text-neutral-400 font-semibold">{Math.round(filters.minConfidence * 100)}%</span>
              <span>100%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
