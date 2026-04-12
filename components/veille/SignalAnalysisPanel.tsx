'use client'

import { useState } from 'react'
import {
  ChevronDown, ChevronUp, AlertTriangle, Target, Building2,
  TrendingUp, Lightbulb, Eye, Shield,
} from 'lucide-react'

interface AffectedCompany {
  name: string
  impact: string
  riskLevel: 'high' | 'medium' | 'low' | string
}

interface VeilleAnalysis {
  executiveTakeaway?: string
  competitiveImpact?: string
  affectedCompanies?: AffectedCompany[]
  marketImplications?: string[]
  strategicRecommendations?: string[]
  whatToWatch?: string[]
  confidenceNote?: string
}

const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-red-50',    text: 'text-red-700',    label: 'Élevé' },
  medium: { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Moyen' },
  low:    { bg: 'bg-green-50',  text: 'text-green-700',  label: 'Faible' },
}

export default function SignalAnalysisPanel({ analysis }: { analysis: VeilleAnalysis | null }) {
  const [expanded, setExpanded] = useState(false)

  if (!analysis || !analysis.executiveTakeaway) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Analyse IA
      </button>

      {expanded && (
        <div className="mt-2 space-y-3 bg-gradient-to-b from-slate-50 to-white rounded-xl border border-slate-200 p-4 animate-in fade-in slide-in-from-top-2 duration-200">

          {/* Executive Takeaway */}
          <div className="flex items-start gap-2">
            <Target size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-blue-600 mb-1">Synthèse</div>
              <p className="text-xs text-neutral-800 leading-relaxed">{analysis.executiveTakeaway}</p>
            </div>
          </div>

          {/* Competitive Impact */}
          {analysis.competitiveImpact && (
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-amber-600 mb-1">Impact concurrentiel</div>
                <p className="text-xs text-neutral-700 leading-relaxed">{analysis.competitiveImpact}</p>
              </div>
            </div>
          )}

          {/* Affected Companies */}
          {analysis.affectedCompanies && analysis.affectedCompanies.length > 0 && (
            <div className="flex items-start gap-2">
              <Building2 size={14} className="text-indigo-600 mt-0.5 flex-shrink-0" />
              <div className="w-full">
                <div className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 mb-1.5">Entreprises impactées</div>
                <div className="space-y-1.5">
                  {analysis.affectedCompanies.map((c, i) => {
                    const risk = RISK_STYLES[c.riskLevel] ?? RISK_STYLES.medium
                    return (
                      <div key={i} className={`${risk.bg} rounded-lg px-3 py-2`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-semibold text-neutral-900">{c.name}</span>
                          <span className={`text-[9px] font-bold ${risk.text} uppercase`}>{risk.label}</span>
                        </div>
                        <p className="text-[11px] text-neutral-600 leading-relaxed">{c.impact}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Market Implications */}
          {analysis.marketImplications && analysis.marketImplications.length > 0 && (
            <div className="flex items-start gap-2">
              <TrendingUp size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 mb-1">Implications marché</div>
                <ul className="space-y-1">
                  {analysis.marketImplications.map((imp, i) => (
                    <li key={i} className="text-[11px] text-neutral-700 leading-relaxed flex items-start gap-1.5">
                      <span className="text-emerald-400 mt-1">•</span>
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Strategic Recommendations */}
          {analysis.strategicRecommendations && analysis.strategicRecommendations.length > 0 && (
            <div className="flex items-start gap-2">
              <Lightbulb size={14} className="text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-purple-600 mb-1">Recommandations</div>
                <ul className="space-y-1">
                  {analysis.strategicRecommendations.map((rec, i) => (
                    <li key={i} className="text-[11px] text-neutral-700 leading-relaxed flex items-start gap-1.5">
                      <span className="text-purple-400 mt-1">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* What to Watch */}
          {analysis.whatToWatch && analysis.whatToWatch.length > 0 && (
            <div className="flex items-start gap-2">
              <Eye size={14} className="text-sky-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-sky-600 mb-1">À surveiller</div>
                <ul className="space-y-1">
                  {analysis.whatToWatch.map((w, i) => (
                    <li key={i} className="text-[11px] text-neutral-700 leading-relaxed flex items-start gap-1.5">
                      <span className="text-sky-400 mt-1">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Confidence Note */}
          {analysis.confidenceNote && (
            <div className="flex items-start gap-2 pt-2 border-t border-slate-200">
              <Shield size={12} className="text-neutral-400 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-neutral-400 italic leading-relaxed">{analysis.confidenceNote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
