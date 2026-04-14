import { NextRequest, NextResponse } from 'next/server'
import { getSuggestionsFromSupabase } from '@/lib/graph/supabase-graph-loader'
import { resolveAnchor, buildStoryline } from '@/lib/storyline/builder'
import type { StorylineSSEEvent } from '@/lib/graph/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const query = searchParams.get('q')?.trim() ?? ''
  const articleId = searchParams.get('articleId')?.trim() ?? ''
  const mode = searchParams.get('mode') ?? 'storyline'

  if (mode === 'suggest') {
    try {
      const suggestions = await getSuggestionsFromSupabase(query)
      return NextResponse.json({ suggestions })
    } catch (err) {
      console.error('[graph/suggest] error:', err)
      return NextResponse.json({ suggestions: [] })
    }
  }

  if (!query && !articleId) {
    return NextResponse.json({ error: 'Query "q" or "articleId" is required' }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: StorylineSSEEvent) {
        try {
          const data = JSON.stringify(event)
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch {
          // controller closed
        }
      }

      try {
        const anchor = await resolveAnchor({
          query: query || undefined,
          articleId: articleId || undefined,
        })

        await buildStoryline(anchor, { onEvent: sendEvent })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        sendEvent({ phase: 'error', error: message })
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
