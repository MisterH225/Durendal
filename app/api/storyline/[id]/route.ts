import { NextRequest, NextResponse } from 'next/server'
import { loadStoryline, deleteStoryline } from '@/lib/storyline/persistence/storyline-persistence'
import { refreshStoryline, getChangesSinceLastVisit } from '@/lib/storyline/refresh/storyline-refresh'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const storyline = await loadStoryline(params.id)
    if (!storyline) {
      return NextResponse.json({ error: 'Storyline non trouvée' }, { status: 404 })
    }

    // Check for changes since last visit
    const lastVisit = req.nextUrl.searchParams.get('since')
    let changes = null
    if (lastVisit) {
      changes = await getChangesSinceLastVisit(params.id, lastVisit)
    }

    return NextResponse.json({ storyline, changes })
  } catch (err: any) {
    console.error('[api/storyline/get] Error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Erreur lors du chargement de la storyline' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await deleteStoryline(params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Erreur lors de la suppression' },
      { status: 500 },
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json()

    if (body.action === 'refresh') {
      const result = await refreshStoryline(params.id)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 })
  } catch (err: any) {
    console.error('[api/storyline/action] Error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Erreur lors de l\'action' },
      { status: 500 },
    )
  }
}
