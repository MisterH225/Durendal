import { ExternalLink, Clock, User, Globe } from 'lucide-react'
import type { SourceArticle } from '@/lib/forecast/mock-articles'

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  article: SourceArticle
  locale: string
}

export function SourceAttributionHeader({ article, locale }: Props) {
  return (
    <div className="space-y-4">
      {/* Publisher attribution */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0">
          <Globe size={14} className="text-neutral-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-100">{article.publisher}</span>
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {locale === 'fr' ? 'Source originale' : 'Original source'}
            </span>
          </div>
          {article.publisherUrl && (
            <span className="text-[10px] text-neutral-600">{article.publisherUrl.replace('https://', '')}</span>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] text-neutral-500">
        {article.author && (
          <span className="flex items-center gap-1">
            <User size={10} />
            {article.author}
          </span>
        )}
        {article.publishedAt && (
          <time dateTime={article.publishedAt} className="flex items-center gap-1">
            <Clock size={10} />
            {formatDate(article.publishedAt, locale)}
          </time>
        )}
      </div>

      {/* Open original CTA */}
      <a
        href={article.canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2"
      >
        <ExternalLink size={12} />
        {locale === 'fr' ? `Lire sur ${article.publisher}` : `Read on ${article.publisher}`}
      </a>
    </div>
  )
}
