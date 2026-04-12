import { NextRequest, NextResponse } from 'next/server'
import { searchGraph, getSuggestions } from '@/lib/graph/search-engine'
import { DEFAULT_FILTERS } from '@/lib/graph/types'
import type { GraphFilters } from '@/lib/graph/types'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const query = searchParams.get('q')?.trim() ?? ''
  const mode = searchParams.get('mode') ?? 'search'

  if (mode === 'suggest') {
    const suggestions = getSuggestions(query)
    return NextResponse.json({ suggestions })
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

  const result = searchGraph(query, filters)
  return NextResponse.json(result)
}
