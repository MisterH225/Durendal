import { SourceAttributionHeader } from './SourceAttributionHeader'
import type { SourceArticle } from '@/lib/forecast/mock-articles'

interface Props {
  article: SourceArticle
  locale: string
}

export function ArticleReadingPane({ article, locale }: Props) {
  const hasBody = !!article.body
  const displayText = article.body ?? article.excerpt ?? ''

  return (
    <article className="space-y-6">
      {/* Attribution */}
      <SourceAttributionHeader article={article} locale={locale} />

      {/* Category + tags */}
      <div className="flex items-center gap-2 flex-wrap">
        {article.category && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {article.category}
          </span>
        )}
        {article.regionTags?.map(tag => (
          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-500 border border-neutral-700">
            {tag}
          </span>
        ))}
      </div>

      {/* Article image */}
      {article.imageUrl && (
        <div className="relative rounded-xl overflow-hidden bg-neutral-800 aspect-[16/9]">
          <img
            src={article.imageUrl}
            alt={article.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Title */}
      <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight tracking-tight">
        {article.title}
      </h1>

      {/* Excerpt indicator */}
      {!hasBody && article.excerpt && (
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-4 py-3">
          <p className="text-[11px] font-medium text-amber-400/80">
            {locale === 'fr'
              ? 'Extrait de la source — consultez l\'article original pour le texte complet'
              : 'Source excerpt — visit the original article for the full text'}
          </p>
        </div>
      )}

      {/* Article body */}
      <div className="prose-custom">
        {displayText.split('\n\n').map((paragraph, i) => (
          <p key={i} className="text-sm text-neutral-300 leading-[1.8] mb-4">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Entity tags */}
      {article.entityTags && article.entityTags.length > 0 && (
        <div className="border-t border-neutral-800 pt-5 space-y-2">
          <span className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wider">
            {locale === 'fr' ? 'Entités mentionnées' : 'Entities mentioned'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {article.entityTags.map(entity => (
              <span key={entity} className="text-[10px] px-2 py-0.5 rounded bg-neutral-800/80 text-neutral-400 border border-neutral-700/50">
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bottom attribution */}
      <div className="border-t border-neutral-800 pt-5">
        <p className="text-[10px] text-neutral-600 leading-relaxed">
          {locale === 'fr'
            ? `Contenu publié par ${article.publisher}. Affiché avec attribution à la source à des fins d'analyse.`
            : `Content published by ${article.publisher}. Displayed with source attribution for analysis purposes.`}
        </p>
      </div>
    </article>
  )
}
