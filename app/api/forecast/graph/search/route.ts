import { NextRequest, NextResponse } from 'next/server'
import { searchGraph } from '@/lib/graph/search-engine'
import { loadGraphFromSupabase, getSuggestionsFromSupabase } from '@/lib/graph/supabase-graph-loader'
import { DEFAULT_FILTERS } from '@/lib/graph/types'
import type { GraphFilters } from '@/lib/graph/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const query = searchParams.get('q')?.trim() ?? ''
  const mode = searchParams.get('mode') ?? 'search'

  if (mode === 'suggest') {
    try {
      const suggestions = await getSuggestionsFromSupabase(query)
      return NextResponse.json({ suggestions })
    } catch (err) {
      console.error('[graph/suggest] error:', err)
      return NextResponse.json({ suggestions: [] })
    }
  }

  if (!query) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 })
  }

  const filters: GraphFilters = { ...DEFAULT_FILTERS }
  const nodeTypes = searchParams.get('nodeTypes')
  if (nodeTypes) filters.nodeTypes = nodeTypes.split(',') as GraphFilters['nodeTypes']
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from) filters.dateRange.from = from
  if (to) filters.dateRange.to = to
  const minConf = searchParams.get('minConfidence')
  if (minConf) filters.minConfidence = parseFloat(minConf)

  try {
    const { nodes, edges } = await loadGraphFromSupabase(query)

    if (nodes.length === 0) {
      return NextResponse.json({
        query,
        nodes: [],
        edges: [],
        anchorNodeIds: [],
        groupedMatches: { articles: [], events: [], entities: [], questions: [], signals: [], documents: [] },
        totals: { articles: 0, events: 0, entities: 0, questions: 0, signals: 0, documents: 0 },
      })
    }

    const result = searchGraph(query, filters, nodes, edges)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[graph/search] error:', err)
    return NextResponse.json(
      { error: 'Erreur lors de la recherche dans le graphe' },
      { status: 500 },
    )
  }
}
