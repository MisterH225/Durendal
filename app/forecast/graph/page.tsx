import { GraphExplorerClient } from '@/components/forecast/graph/GraphExplorerClient'

export const metadata = {
  title: 'Intelligence Graph Explorer — MarketLens',
  description: 'Explorez les connexions entre événements, signaux, entités et questions de prévision.',
}

export default function GraphExplorerPage() {
  return (
    <div className="h-[calc(100vh-64px)]">
      <GraphExplorerClient />
    </div>
  )
}
