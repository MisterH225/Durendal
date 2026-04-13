import { GraphExplorerClient } from '@/components/forecast/graph/GraphExplorerClient'

export const metadata = {
  title: 'Storyline Intelligence Explorer — MarketLens',
  description: 'Construisez des storylines intelligence : causes, contexte, projections et connexions entre événements.',
}

export default function GraphExplorerPage({
  searchParams,
}: {
  searchParams: { articleId?: string; q?: string }
}) {
  return (
    <div className="h-[calc(100vh-64px)]">
      <GraphExplorerClient
        initialArticleId={searchParams.articleId}
        initialQuery={searchParams.q}
      />
    </div>
  )
}
