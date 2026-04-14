import dynamic from 'next/dynamic'

/**
 * React Flow (@xyflow) n’est pas compatible SSR : sans import dynamique, le rendu
 * serveur peut lever une exception et déclencher app/forecast/error.tsx.
 */
const GraphExplorerClient = dynamic(
  () =>
    import('@/components/forecast/graph/GraphExplorerClient').then((mod) => ({
      default: mod.GraphExplorerClient,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm">
        Chargement de l’explorateur…
      </div>
    ),
  },
)

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
