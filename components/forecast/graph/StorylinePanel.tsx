'use client'

import { useState, useCallback } from 'react'
import {
  BookOpen,
  ChevronRight,
  Clock,
  ExternalLink,
  GitBranch,
  Lightbulb,
  RotateCw,
  Save,
  Star,
  TrendingUp,
} from 'lucide-react'
import type { Storyline, StorylineCard, StorylineEdge, StorylineCardType } from '@/lib/storyline/types'

// ── Card type config ─────────────────────────────────────────────────────────

const CARD_TYPE_CONFIG: Record<StorylineCardType, {
  icon: typeof BookOpen
  color: string
  bgClass: string
  borderClass: string
  textClass: string
  label: string
}> = {
  anchor: { icon: Star, color: '#ef4444', bgClass: 'bg-red-500/15', borderClass: 'border-red-500/50', textClass: 'text-red-400', label: 'Événement principal' },
  predecessor: { icon: Clock, color: '#f59e0b', bgClass: 'bg-amber-500/10', borderClass: 'border-amber-500/30', textClass: 'text-amber-400', label: 'Précurseur' },
  successor: { icon: TrendingUp, color: '#3b82f6', bgClass: 'bg-blue-500/10', borderClass: 'border-blue-500/30', textClass: 'text-blue-400', label: 'Conséquence' },
  corollary: { icon: GitBranch, color: '#8b5cf6', bgClass: 'bg-violet-500/10', borderClass: 'border-violet-500/30', textClass: 'text-violet-400', label: 'Corolaire' },
  outcome: { icon: Lightbulb, color: '#22c55e', bgClass: 'bg-green-500/10', borderClass: 'border-green-500/30', textClass: 'text-green-400', label: 'Scénario' },
  context: { icon: BookOpen, color: '#6b7280', bgClass: 'bg-neutral-500/10', borderClass: 'border-neutral-500/30', textClass: 'text-neutral-400', label: 'Contexte' },
}

// ── Storyline Panel ──────────────────────────────────────────────────────────

export function StorylinePanel({
  storyline,
  isLoading,
  onSave,
  onRefresh,
  onCardSelect,
  selectedCardId,
}: {
  storyline: Storyline | null
  isLoading?: boolean
  onSave?: () => void
  onRefresh?: () => void
  onCardSelect?: (id: string | null) => void
  selectedCardId?: string | null
}) {
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set())

  const toggleBranch = useCallback((branchId: string) => {
    setExpandedBranches(prev => {
      const next = new Set(prev)
      if (next.has(branchId)) next.delete(branchId)
      else next.add(branchId)
      return next
    })
  }, [])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full mx-auto mb-3" />
          <div className="text-sm text-neutral-400">Construction de la storyline…</div>
          <div className="text-xs text-neutral-600 mt-1">Recherche, analyse et structuration des événements</div>
        </div>
      </div>
    )
  }

  if (!storyline) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <BookOpen size={32} className="mx-auto mb-3 text-neutral-600" />
          <div className="text-sm text-neutral-400 mb-1">Aucune storyline</div>
          <div className="text-xs text-neutral-600">
            Recherchez un sujet, collez une URL d&apos;article ou entrez un mot-clé pour générer une storyline dynamique.
          </div>
        </div>
      </div>
    )
  }

  // Separate trunk from branches
  const trunkCards = storyline.cards
    .filter(c => c.trunkPosition != null)
    .sort((a, b) => (a.trunkPosition ?? 0) - (b.trunkPosition ?? 0))

  const corollaryCards = storyline.cards.filter(c => c.cardType === 'corollary')
  const outcomeCards = storyline.cards.filter(c => c.cardType === 'outcome')
  const contextCards = storyline.cards.filter(c => c.cardType === 'context')

  // Find anchor position
  const anchorCard = trunkCards.find(c => c.cardType === 'anchor')
  const predecessors = trunkCards.filter(c => c.cardType === 'predecessor')
  const successors = trunkCards.filter(c => c.cardType === 'successor')

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-950/90 backdrop-blur-sm border-b border-neutral-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">{storyline.title}</h2>
            {storyline.description && (
              <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{storyline.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="text-xs px-2.5 py-1.5 rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors flex items-center gap-1.5"
              >
                <RotateCw size={12} /> Actualiser
              </button>
            )}
            {onSave && (
              <button
                onClick={onSave}
                className="text-xs px-2.5 py-1.5 rounded-md bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 transition-colors flex items-center gap-1.5"
              >
                <Save size={12} /> Sauvegarder
              </button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-neutral-600">
          <span>{predecessors.length} précurseurs</span>
          <span>·</span>
          <span>{corollaryCards.length} corolaires</span>
          <span>·</span>
          <span>{outcomeCards.length} scénarios</span>
          <span>·</span>
          <span>v{storyline.version}</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto py-4 px-4">
        {/* ── Past: Predecessors ── */}
        {predecessors.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/60 mb-2 px-1">
              ← Précurseurs historiques
            </div>
            {predecessors.map((card, i) => (
              <StorylineCardComponent
                key={card.id}
                card={card}
                isSelected={selectedCardId === card.id}
                onSelect={onCardSelect}
                showConnector={i < predecessors.length - 1}
              />
            ))}
            {/* Connector to anchor */}
            <div className="flex justify-center py-1">
              <div className="w-px h-6 bg-gradient-to-b from-amber-500/30 to-red-500/50" />
            </div>
          </div>
        )}

        {/* ── Anchor ── */}
        {anchorCard && (
          <StorylineCardComponent
            card={anchorCard}
            isSelected={selectedCardId === anchorCard.id}
            onSelect={onCardSelect}
            isAnchor
          />
        )}

        {/* ── Corollary branches ── */}
        {corollaryCards.length > 0 && (
          <div className="mt-3 mb-3">
            <button
              onClick={() => toggleBranch('corollary')}
              className="text-[10px] font-semibold uppercase tracking-wider text-violet-500/60 mb-2 px-1 flex items-center gap-1 hover:text-violet-400 transition-colors"
            >
              <GitBranch size={10} />
              {corollaryCards.length} événements corolaires
              <ChevronRight size={10} className={`transition-transform ${expandedBranches.has('corollary') ? 'rotate-90' : ''}`} />
            </button>
            {expandedBranches.has('corollary') && (
              <div className="ml-4 pl-3 border-l-2 border-violet-500/20 space-y-2">
                {corollaryCards.map(card => (
                  <StorylineCardComponent
                    key={card.id}
                    card={card}
                    isSelected={selectedCardId === card.id}
                    onSelect={onCardSelect}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Successors ── */}
        {successors.length > 0 && (
          <div className="mt-2">
            <div className="flex justify-center py-1">
              <div className="w-px h-6 bg-gradient-to-b from-red-500/30 to-blue-500/50" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-500/60 mb-2 px-1">
              → Conséquences
            </div>
            {successors.map((card, i) => (
              <StorylineCardComponent
                key={card.id}
                card={card}
                isSelected={selectedCardId === card.id}
                onSelect={onCardSelect}
                showConnector={i < successors.length - 1}
              />
            ))}
          </div>
        )}

        {/* ── Outcomes ── */}
        {outcomeCards.length > 0 && (
          <div className="mt-4">
            <div className="flex justify-center py-1">
              <div className="w-px h-6 bg-gradient-to-b from-blue-500/30 to-green-500/50" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-green-500/60 mb-2 px-1">
              ⟶ Scénarios possibles
            </div>
            <div className="space-y-2">
              {outcomeCards
                .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
                .map(card => (
                  <StorylineCardComponent
                    key={card.id}
                    card={card}
                    isSelected={selectedCardId === card.id}
                    onSelect={onCardSelect}
                  />
                ))}
            </div>
          </div>
        )}

        {/* ── Context ── */}
        {contextCards.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => toggleBranch('context')}
              className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600 mb-2 px-1 flex items-center gap-1 hover:text-neutral-400 transition-colors"
            >
              <BookOpen size={10} />
              {contextCards.length} éléments de contexte
              <ChevronRight size={10} className={`transition-transform ${expandedBranches.has('context') ? 'rotate-90' : ''}`} />
            </button>
            {expandedBranches.has('context') && (
              <div className="space-y-1">
                {contextCards.map(card => (
                  <StorylineCardComponent
                    key={card.id}
                    card={card}
                    isSelected={selectedCardId === card.id}
                    onSelect={onCardSelect}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Individual card component ────────────────────────────────────────────────

function StorylineCardComponent({
  card,
  isSelected,
  isAnchor,
  compact,
  showConnector,
  onSelect,
}: {
  card: StorylineCard
  isSelected?: boolean
  isAnchor?: boolean
  compact?: boolean
  showConnector?: boolean
  onSelect?: (id: string | null) => void
}) {
  const config = CARD_TYPE_CONFIG[card.cardType]
  const Icon = config.icon

  return (
    <>
      <button
        onClick={() => onSelect?.(isSelected ? null : card.id)}
        className={`w-full text-left rounded-lg border transition-all ${
          isSelected
            ? `${config.bgClass} ${config.borderClass} ring-1 ring-${config.color}/30`
            : `bg-neutral-900/50 border-neutral-800 hover:bg-neutral-900 hover:border-neutral-700`
        } ${isAnchor ? 'ring-2 ring-red-500/20' : ''} ${compact ? 'p-2.5' : 'p-3'}`}
      >
        <div className="flex items-start gap-2.5">
          <div className={`mt-0.5 ${config.textClass}`}>
            <Icon size={compact ? 13 : 15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-semibold uppercase ${config.textClass}`}>
                {config.label}
              </span>
              {card.happenedAt && (
                <span className="text-[9px] text-neutral-600">
                  {new Date(card.happenedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
              {card.probability != null && (
                <span className={`text-[9px] font-bold ${
                  card.probability > 0.6 ? 'text-green-400' : card.probability > 0.3 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {Math.round(card.probability * 100)}%
                </span>
              )}
            </div>
            <div className={`font-medium text-neutral-200 ${compact ? 'text-[11px]' : 'text-xs'} mt-0.5`}>
              {card.label}
            </div>
            {card.summary && !compact && (
              <div className="text-[11px] text-neutral-500 mt-1 line-clamp-2">
                {card.summary}
              </div>
            )}
            {/* Evidence links */}
            {card.evidence.length > 0 && !compact && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {card.evidence.slice(0, 3).map((ev, i) => (
                  ev.url ? (
                    <a
                      key={i}
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[9px] text-neutral-600 hover:text-neutral-400 flex items-center gap-0.5 truncate max-w-[140px]"
                      title={ev.title ?? ev.url}
                    >
                      <ExternalLink size={8} />
                      {ev.sourceName ?? new URL(ev.url).hostname}
                    </a>
                  ) : null
                ))}
                {card.evidence.length > 3 && (
                  <span className="text-[9px] text-neutral-700">+{card.evidence.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </button>
      {showConnector && (
        <div className="flex justify-center py-0.5">
          <div className={`w-px h-4 ${config.borderClass}`} />
        </div>
      )}
    </>
  )
}
