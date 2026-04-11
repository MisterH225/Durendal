import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocale } from '@/lib/i18n/server'
import { getArticle, getAnalysis, MOCK_ARTICLES } from '@/lib/forecast/mock-articles'
import { SplitReaderLayout } from '@/components/forecast/reader/SplitReaderLayout'
import { ArticleReadingPane } from '@/components/forecast/reader/ArticleReadingPane'
import { ImplicationPanel } from '@/components/forecast/reader/ImplicationPanel'
import { LiveAnalysisLoader } from '@/components/forecast/reader/LiveAnalysisLoader'
import type { SourceArticle, ArticleImplicationAnalysis } from '@/lib/forecast/mock-articles'

export const dynamic = 'force-dynamic'

/**
 * Route: /forecast/signals/[id]
 *
 * Resolves the signal by:
 * 1. Checking mock articles first (prototype data)
 * 2. Then checking the forecast_signal_feed DB table
 *
 * For DB signals, constructs a SourceArticle from signal data and
 * builds a minimal analysis placeholder (real AI analysis to come later).
 */
export default async function SignalDetailPage({ params }: { params: { id: string } }) {
  const locale = getLocale()

  // 1. Check mock articles
  const mockArticle = getArticle(params.id)
  const mockAnalysis = getAnalysis(params.id)

  if (mockArticle && mockAnalysis) {
    return renderPage(mockArticle, mockAnalysis, locale)
  }

  // 2. Check DB signals
  const db = createAdminClient()
  const { data: signal } = await db
    .from('forecast_signal_feed')
    .select('id, signal_type, title, summary, severity, data, created_at, forecast_channels(id, slug, name, name_fr, name_en)')
    .eq('id', params.id)
    .single()

  if (!signal) return notFound()

  const data = (signal.data ?? {}) as Record<string, unknown>
  const chArr = signal.forecast_channels as unknown as { name: string; name_fr?: string; name_en?: string }[] | null
  const ch = chArr?.[0] ?? null

  const article: SourceArticle = {
    id: signal.id,
    title: signal.title,
    publisher: (data.article_publisher as string) ?? (data.source_hint as string) ?? 'Unknown',
    author: (data.article_author as string) ?? undefined,
    canonicalUrl: (data.source_url as string) ?? '#',
    imageUrl: (data.image_url as string) ?? undefined,
    excerpt: signal.summary ?? undefined,
    body: (data.article_body as string) ?? undefined,
    publishedAt: (data.article_published as string) ?? signal.created_at,
    category: locale === 'fr' && ch?.name_fr ? ch.name_fr : ch?.name ?? undefined,
    regionTags: data.region ? [data.region as string] : undefined,
  }

  // If a cached AI analysis already exists, use it directly
  const cachedAnalysis = data.ai_analysis as Record<string, unknown> | undefined
  const hasCachedAnalysis = cachedAnalysis && typeof cachedAnalysis === 'object' && cachedAnalysis.executiveTakeaway

  const fallbackAnalysis: ArticleImplicationAnalysis = {
    articleId: signal.id,
    executiveTakeaway: signal.summary ?? '',
    whyThisMatters: [
      locale === 'fr'
        ? 'Ce signal a été identifié par notre système d\'intelligence comme significatif pour les marchés et les décideurs économiques.'
        : 'This signal was identified by our intelligence system as significant for markets and economic decision-makers.',
    ],
    immediateImplications: [],
    secondOrderEffects: [],
    regionalImplications: data.region ? [{ region: data.region as string, implications: [signal.summary ?? ''] }] : [],
    sectorExposure: [],
    whatToWatch: [],
    confidenceNote: locale === 'fr'
      ? 'Analyse IA en cours de génération...'
      : 'AI analysis being generated...',
    relatedForecasts: [],
  }

  // Use LiveAnalysisLoader for real-time AI analysis generation
  return renderPageWithLiveAnalysis(article, signal.id, fallbackAnalysis, locale)
}

function renderPage(article: SourceArticle, analysis: ArticleImplicationAnalysis, locale: string) {
  return (
    <div>
      <BackNav article={article} locale={locale} />
      <SplitReaderLayout
        locale={locale}
        leftPane={<ArticleReadingPane article={article} locale={locale} />}
        rightPane={<ImplicationPanel analysis={analysis} locale={locale} />}
      />
    </div>
  )
}

function renderPageWithLiveAnalysis(
  article: SourceArticle,
  signalId: string,
  fallbackAnalysis: ArticleImplicationAnalysis,
  locale: string,
) {
  return (
    <div>
      <BackNav article={article} locale={locale} />
      <SplitReaderLayout
        locale={locale}
        leftPane={<ArticleReadingPane article={article} locale={locale} />}
        rightPane={
          <LiveAnalysisLoader
            signalId={signalId}
            locale={locale}
            fallbackAnalysis={fallbackAnalysis}
          />
        }
      />
    </div>
  )
}

function BackNav({ article, locale }: { article: SourceArticle; locale: string }) {
  return (
    <div className="border-b border-neutral-800 bg-neutral-950/80">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2.5 flex items-center justify-between">
        <Link
          href="/forecast/signals"
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <ArrowLeft size={12} />
          {locale === 'fr' ? 'Retour aux signaux' : 'Back to signals'}
        </Link>
        <div className="flex items-center gap-2">
          {MOCK_ARTICLES.map(a => (
            <Link
              key={a.id}
              href={`/forecast/signals/${a.id}`}
              className={`text-[9px] px-2 py-1 rounded-md border transition-colors ${
                a.id === article.id
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : 'text-neutral-600 border-neutral-800 hover:text-neutral-400 hover:border-neutral-700'
              }`}
            >
              {a.category?.split(' ')[0] ?? 'Demo'}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
