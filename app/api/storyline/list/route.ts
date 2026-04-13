import { NextRequest, NextResponse } from 'next/server'
import { listStorylines } from '@/lib/storyline/persistence/storyline-persistence'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId') ?? undefined
    const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)

    const storylines = await listStorylines(userId, limit)
    return NextResponse.json({ storylines })
  } catch (err: any) {
    console.error('[api/storyline/list] Error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Erreur lors du listage des storylines' },
      { status: 500 },
    )
  }
}
