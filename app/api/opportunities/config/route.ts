import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SIGNAL_TYPES } from '@/lib/opportunities/signals-taxonomy'
import { SECTOR_CONFIGS } from '@/lib/opportunities/sector-config'

export async function GET() {
  let watches: { id: string; name: string }[] = []

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('id', user.id)
        .single()

      if (profile?.account_id) {
        const { data } = await supabase
          .from('watches')
          .select('id, name')
          .eq('account_id', profile.account_id)
          .eq('is_active', true)
          .order('name')

        watches = data ?? []
      }
    }
  } catch {}

  return NextResponse.json({
    watches,
    signals: SIGNAL_TYPES.map(s => ({
      type: s.type,
      label: s.label,
      description: s.description,
      baseScore: s.baseScore,
      category: s.category,
    })),
    sectors: SECTOR_CONFIGS.map(s => ({
      key: s.key,
      label: s.label,
      prioritySignals: s.prioritySignals,
    })),
    statuses: [
      { value: 'new', label: 'Nouveau' },
      { value: 'contacted', label: 'Contacté' },
      { value: 'qualified', label: 'Qualifié' },
      { value: 'proposal', label: 'Proposition' },
      { value: 'negotiation', label: 'Négociation' },
      { value: 'won', label: 'Gagné' },
      { value: 'lost', label: 'Perdu' },
      { value: 'dismissed', label: 'Écarté' },
      { value: 'too_early', label: 'Trop tôt' },
    ],
    heatLevels: [
      { value: 'hot', label: 'Chaud', minScore: 75 },
      { value: 'warm', label: 'Tiède', minScore: 50 },
      { value: 'cold', label: 'Froid', minScore: 0 },
    ],
  })
}
