import {
  Zap, AlertTriangle, ArrowRightCircle, Layers, Globe2, Building2,
  Eye, Target, Shield, BookOpen
} from 'lucide-react'
import { ImplicationSection } from './ImplicationSection'
import { RelatedForecastCard } from './RelatedForecastCard'
import type { ArticleImplicationAnalysis } from '@/lib/forecast/mock-articles'

const RISK_COLORS: Record<string, string> = {
  high:   'bg-red-500/10 text-red-400 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

interface Props {
  analysis: ArticleImplicationAnalysis
  locale: string
}

export function ImplicationPanel({ analysis: a, locale }: Props) {
  const t = (fr: string, en: string) => locale === 'fr' ? fr : en

  const hasContent = (arr: unknown[]) => arr && arr.length > 0

  const visibleLinks = [
    hasContent([a.executiveTakeaway].filter(Boolean)) && { id: 'takeaway', label: t('Synthèse', 'Takeaway') },
    hasContent(a.whyThisMatters) && { id: 'why', label: t('Pourquoi', 'Why') },
    hasContent(a.immediateImplications) && { id: 'immediate', label: t('Immédiat', 'Immediate') },
    hasContent(a.secondOrderEffects) && { id: 'second-order', label: t('2nd ordre', '2nd order') },
    hasContent(a.regionalImplications) && { id: 'regional', label: t('Régional', 'Regional') },
    hasContent(a.sectorExposure) && { id: 'sectors', label: t('Secteurs', 'Sectors') },
    hasContent(a.whatToWatch) && { id: 'watch', label: t('À suivre', 'Watch') },
    hasContent(a.relatedForecasts) && { id: 'forecasts', label: t('Prévisions', 'Forecasts') },
  ].filter(Boolean) as { id: string; label: string }[]

  return (
    <aside className="space-y-6" aria-label={t('Analyse IA des implications', 'AI Implications Analysis')}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center">
            <Zap size={12} className="text-blue-400" />
          </div>
          <h2 className="text-sm font-bold text-white">
            {t('Analyse des implications', 'Implications Analysis')}
          </h2>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            IA
          </span>
        </div>
        <p className="text-[11px] text-neutral-500">
          {t(
            'Analyse approfondie générée par IA — effets de second ordre, implications régionales et sectorielles.',
            'AI-generated deep analysis — second-order effects, regional and sector implications.'
          )}
        </p>
      </div>

      {/* Jump links — only visible sections */}
      {visibleLinks.length > 0 && (
        <nav className="flex flex-wrap gap-1.5 pb-3 border-b border-neutral-800">
          {visibleLinks.map(link => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className="text-[10px] font-medium px-2 py-1 rounded-md bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}

      {/* Executive Takeaway */}
      {a.executiveTakeaway && (
        <ImplicationSection
          id="takeaway"
          icon={<Target size={14} />}
          title={t('Synthèse décisionnelle', 'Executive Takeaway')}
          accentColor="blue"
        >
          <p className="text-sm text-neutral-200 leading-relaxed font-medium bg-blue-500/5 rounded-lg p-4 border border-blue-500/10">
            {a.executiveTakeaway}
          </p>
        </ImplicationSection>
      )}

      {/* Why This Matters */}
      {hasContent(a.whyThisMatters) && (
        <ImplicationSection
          id="why"
          icon={<AlertTriangle size={14} />}
          title={t('Pourquoi c\'est important', 'Why This Matters')}
          accentColor="amber"
        >
          <ul className="space-y-2">
            {a.whyThisMatters.map((item, i) => (
              <li key={i} className="flex gap-2 text-xs text-neutral-300 leading-relaxed">
                <span className="text-amber-500/60 mt-0.5 flex-shrink-0">▸</span>
                {item}
              </li>
            ))}
          </ul>
        </ImplicationSection>
      )}

      {/* Immediate Implications */}
      {hasContent(a.immediateImplications) && (
        <ImplicationSection
          id="immediate"
          icon={<ArrowRightCircle size={14} />}
          title={t('Implications immédiates', 'Immediate Implications')}
          accentColor="red"
        >
          <ul className="space-y-2">
            {a.immediateImplications.map((item, i) => (
              <li key={i} className="flex gap-2 text-xs text-neutral-300 leading-relaxed">
                <span className="text-red-500/60 mt-0.5 flex-shrink-0">▸</span>
                {item}
              </li>
            ))}
          </ul>
        </ImplicationSection>
      )}

      {/* Second-Order Effects */}
      {hasContent(a.secondOrderEffects) && (
        <ImplicationSection
          id="second-order"
          icon={<Layers size={14} />}
          title={t('Effets de second ordre', 'Second-Order Effects')}
          accentColor="purple"
        >
          <ul className="space-y-2">
            {a.secondOrderEffects.map((item, i) => (
              <li key={i} className="flex gap-2 text-xs text-neutral-300 leading-relaxed">
                <span className="text-purple-500/60 mt-0.5 flex-shrink-0">▸</span>
                {item}
              </li>
            ))}
          </ul>
        </ImplicationSection>
      )}

      {/* Regional Implications */}
      {hasContent(a.regionalImplications) && (
        <ImplicationSection
          id="regional"
          icon={<Globe2 size={14} />}
          title={t('Implications régionales', 'Regional Implications')}
          accentColor="teal"
        >
          <div className="space-y-4">
            {a.regionalImplications.map((region, i) => (
              <div key={i} className="space-y-2">
                <h4 className="text-[11px] font-bold text-teal-400/90">{region.region}</h4>
                <ul className="space-y-1.5">
                  {region.implications.map((item, j) => (
                    <li key={j} className="flex gap-2 text-xs text-neutral-400 leading-relaxed">
                      <span className="text-teal-500/40 mt-0.5 flex-shrink-0">–</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ImplicationSection>
      )}

      {/* Sector Exposure */}
      {hasContent(a.sectorExposure) && (
        <ImplicationSection
          id="sectors"
          icon={<Building2 size={14} />}
          title={t('Exposition sectorielle', 'Sector Exposure')}
          accentColor="rose"
        >
          <div className="space-y-3">
            {a.sectorExposure.map((sector, i) => (
              <div key={i} className="rounded-lg bg-neutral-800/30 border border-neutral-800 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-neutral-200">{sector.sector}</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${RISK_COLORS[sector.riskLevel]}`}>
                    {sector.riskLevel === 'high' ? t('Risque élevé', 'High risk')
                      : sector.riskLevel === 'medium' ? t('Risque modéré', 'Medium risk')
                      : t('Risque faible', 'Low risk')}
                  </span>
                </div>
                <ul className="space-y-1">
                  {sector.notes.map((note, j) => (
                    <li key={j} className="text-[11px] text-neutral-500 leading-relaxed flex gap-1.5">
                      <span className="text-neutral-700 flex-shrink-0">•</span>
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ImplicationSection>
      )}

      {/* What to Watch */}
      {hasContent(a.whatToWatch) && (
        <ImplicationSection
          id="watch"
          icon={<Eye size={14} />}
          title={t('À surveiller', 'What to Watch')}
          accentColor="green"
        >
          <div className="space-y-2">
            {a.whatToWatch.map((item, i) => (
              <div key={i} className="flex gap-3 items-start text-xs text-neutral-300 leading-relaxed">
                <span className="text-[10px] font-mono text-emerald-500/50 mt-0.5 flex-shrink-0 w-4 text-right">{i + 1}</span>
                {item}
              </div>
            ))}
          </div>
        </ImplicationSection>
      )}

      {/* Confidence Note */}
      {a.confidenceNote && (
        <div className="rounded-lg bg-neutral-800/30 border border-neutral-800 p-3 flex gap-2">
          <Shield size={12} className="text-neutral-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-neutral-500 leading-relaxed">{a.confidenceNote}</p>
        </div>
      )}

      {/* Related Forecasts */}
      {hasContent(a.relatedForecasts) && (
        <ImplicationSection
          id="forecasts"
          icon={<BookOpen size={14} />}
          title={t('Questions de prévision liées', 'Related Forecast Questions')}
          accentColor="blue"
        >
          <div className="space-y-2">
            {a.relatedForecasts.map(f => (
              <RelatedForecastCard key={f.id} forecast={f} locale={locale} />
            ))}
          </div>
        </ImplicationSection>
      )}
    </aside>
  )
}
