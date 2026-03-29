import { NextResponse } from 'next/server'
import { SIGNAL_TYPES } from '@/lib/opportunities/signals-taxonomy'
import { SECTOR_CONFIGS } from '@/lib/opportunities/sector-config'

export async function GET() {
  return NextResponse.json({
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
