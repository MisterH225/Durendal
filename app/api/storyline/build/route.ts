import { NextRequest, NextResponse } from 'next/server'
import { buildStoryline } from '@/lib/storyline/builder/storyline-builder'
import { saveStoryline } from '@/lib/storyline/persistence/storyline-persistence'
import type { StorylineInputType } from '@/lib/storyline/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const inputType = body.inputType as StorylineInputType
    const inputValue = body.inputValue as string

    if (!inputType || !inputValue) {
      return NextResponse.json(
        { error: 'inputType et inputValue sont requis' },
        { status: 400 },
      )
    }

    const validTypes: StorylineInputType[] = ['url', 'article_id', 'keyword', 'event_id']
    if (!validTypes.includes(inputType)) {
      return NextResponse.json(
        { error: `inputType invalide. Valeurs acceptées: ${validTypes.join(', ')}` },
        { status: 400 },
      )
    }

    const result = await buildStoryline({
      type: inputType,
      value: inputValue,
      userId: body.userId,
      options: body.options,
    })

    // Optionally save the storyline
    if (body.save) {
      await saveStoryline(result.storyline)
    }

    return NextResponse.json({
      storyline: result.storyline,
      stats: result.stats,
    })
  } catch (err: any) {
    console.error('[api/storyline/build] Error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Erreur lors de la construction de la storyline' },
      { status: 500 },
    )
  }
}
