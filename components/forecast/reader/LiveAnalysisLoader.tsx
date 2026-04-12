'use client'

import { useEffect, useState, useCallback } from 'react'
import { ImplicationPanel } from './ImplicationPanel'
import { AnalysisSkeleton } from './ReaderSkeleton'
import { AlertTriangle, RefreshCw, Zap } from 'lucide-react'
import type { ArticleImplicationAnalysis } from '@/lib/forecast/mock-articles'

interface Props {
  signalId: string
  locale: string
  fallbackAnalysis: ArticleImplicationAnalysis
}

export function LiveAnalysisLoader({ signalId, locale, fallbackAnalysis }: Props) {
  const [analysis, setAnalysis] = useState<ArticleImplicationAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const isFr = locale === 'fr'

  const fetchAnalysis = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)

      const res = await fetch('/api/forecast/analyze-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId, locale }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error ?? json.details ?? `HTTP ${res.status}`)
      }

      const raw = json.analysis
      if (!raw || typeof raw !== 'object') {
        throw new Error(isFr ? 'L\'IA n\'a pas retourné d\'analyse valide' : 'AI did not return a valid analysis')
      }

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
        relatedForecasts: (raw.relatedForecasts ?? []).map((f: any) => ({
          id: f.id ?? f.title ?? '',
          title: f.title ?? '',
          crowdProbability: f.crowdProbability ?? f.probability ?? 0,
          aiProbability: f.aiProbability ?? f.probability ?? 0,
          blendedProbability: f.blendedProbability ?? f.probability ?? 0,
        })),
      }

      const hasAnyContent = mapped.executiveTakeaway
        || mapped.whyThisMatters.length > 0
        || mapped.immediateImplications.length > 0
        || mapped.secondOrderEffects.length > 0

      if (!hasAnyContent) {
        throw new Error(isFr
          ? 'L\'analyse générée est vide. L\'article source n\'a peut-être pas pu être extrait.'
          : 'Generated analysis is empty. The source article may not have been extractable.')
      }

      setAnalysis(mapped)
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setErrorMsg(isFr
          ? 'L\'analyse a pris trop de temps (>45s). Cliquez sur Réessayer.'
          : 'Analysis took too long (>45s). Click Retry.')
      } else {
        setErrorMsg(err?.message ?? (isFr ? 'Erreur inconnue' : 'Unknown error'))
      }
    } finally {
      setLoading(false)
    }
  }, [signalId, locale, isFr])

  useEffect(() => {
    fetchAnalysis()
  }, [fetchAnalysis, attempt])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-neutral-800">
          <div className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full border-2 border-blue-400/40 border-t-blue-400 animate-spin" />
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-300">
              {isFr ? 'Analyse IA en cours...' : 'AI analysis in progress...'}
            </p>
            <p className="text-[10px] text-neutral-600">
              {isFr
                ? 'L\'IA récupère et analyse le contenu complet de l\'article. Cela peut prendre 15-30 secondes.'
                : 'AI is fetching and analyzing the full article content. This may take 15-30 seconds.'}
            </p>
          </div>
        </div>
        <AnalysisSkeleton />
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="space-y-6">
        {/* Error header */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center">
            <Zap size={12} className="text-blue-400" />
          </div>
          <h2 className="text-sm font-bold text-white">
            {isFr ? 'Analyse des implications' : 'Implications Analysis'}
          </h2>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            IA
          </span>
        </div>

        {/* Error message */}
        <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-5 space-y-4">
          <div className="flex gap-3">
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-300">
                {isFr ? 'L\'analyse n\'a pas pu être générée' : 'Analysis could not be generated'}
              </p>
              <p className="text-xs text-neutral-500">{errorMsg}</p>
            </div>
          </div>
          <button
            onClick={() => setAttempt(a => a + 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-medium hover:bg-blue-500/20 transition-colors"
          >
            <RefreshCw size={12} />
            {isFr ? 'Réessayer l\'analyse' : 'Retry analysis'}
          </button>
        </div>

        {/* Show executive takeaway from fallback if available */}
        {fallbackAnalysis.executiveTakeaway && (
          <div className="rounded-lg bg-neutral-800/30 border border-neutral-800 p-4 space-y-2">
            <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wider">
              {isFr ? 'Résumé disponible' : 'Available summary'}
            </p>
            <p className="text-sm text-neutral-300 leading-relaxed">
              {fallbackAnalysis.executiveTakeaway}
            </p>
          </div>
        )}
      </div>
    )
  }

  if (!analysis) {
    return <ImplicationPanel analysis={fallbackAnalysis} locale={locale} />
  }

  return <ImplicationPanel analysis={analysis} locale={locale} />
}
