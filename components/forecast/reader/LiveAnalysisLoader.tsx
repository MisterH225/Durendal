'use client'

import { useEffect, useState } from 'react'
import { ImplicationPanel } from './ImplicationPanel'
import { AnalysisSkeleton } from './ReaderSkeleton'
import type { ArticleImplicationAnalysis } from '@/lib/forecast/mock-articles'

interface Props {
  signalId: string
  locale: string
  fallbackAnalysis: ArticleImplicationAnalysis
}

/**
 * Client component that fetches AI analysis on mount.
 * Shows the ImplicationPanel skeleton while loading, then the real analysis.
 * Falls back to the server-provided placeholder if the API fails.
 */
export function LiveAnalysisLoader({ signalId, locale, fallbackAnalysis }: Props) {
  const [analysis, setAnalysis] = useState<ArticleImplicationAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchAnalysis() {
      try {
        const res = await fetch('/api/forecast/analyze-signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signalId, locale }),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const { analysis: raw } = await res.json()
        if (cancelled) return

        const mapped: ArticleImplicationAnalysis = {
          articleId: signalId,
          executiveTakeaway: raw.executiveTakeaway ?? '',
          whyThisMatters: raw.whyThisMatters ?? [],
          immediateImplications: raw.immediateImplications ?? [],
          secondOrderEffects: raw.secondOrderEffects ?? [],
          regionalImplications: (raw.regionalImplications ?? []).map((r: any) => ({
            region: r.region ?? '',
            implications: r.implications ?? [],
          })),
          sectorExposure: (raw.sectorExposure ?? []).map((s: any) => ({
            sector: s.sector ?? '',
            riskLevel: s.riskLevel ?? 'medium',
            notes: s.notes ?? [],
          })),
          whatToWatch: raw.whatToWatch ?? [],
          confidenceNote: raw.confidenceNote ?? undefined,
          relatedForecasts: [],
        }

        setAnalysis(mapped)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAnalysis()
    return () => { cancelled = true }
  }, [signalId, locale])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-neutral-800">
          <div className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full border-2 border-blue-400/40 border-t-blue-400 animate-spin" />
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-300">
              {locale === 'fr' ? 'Analyse en cours...' : 'Analyzing...'}
            </p>
            <p className="text-[10px] text-neutral-600">
              {locale === 'fr'
                ? 'L\'IA analyse le contenu complet de l\'article pour générer des implications détaillées'
                : 'AI is analyzing the full article content to generate detailed implications'}
            </p>
          </div>
        </div>
        <AnalysisSkeleton />
      </div>
    )
  }

  if (error || !analysis) {
    return <ImplicationPanel analysis={fallbackAnalysis} locale={locale} />
  }

  return <ImplicationPanel analysis={analysis} locale={locale} />
}
