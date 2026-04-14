import type { StorylineResult } from '@/lib/graph/types'

export const SAVED_STORYLINES_STORAGE_KEY = 'marketlens.graph.savedStorylines'
const MAX_SAVED = 25

export interface SavedStorylineEntry {
  id: string
  savedAt: string
  query: string
  anchorTitle: string
  storyline: StorylineResult
}

function safeParse(raw: string | null): SavedStorylineEntry[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(
      (x): x is SavedStorylineEntry =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as SavedStorylineEntry).id === 'string' &&
        typeof (x as SavedStorylineEntry).storyline === 'object',
    )
  } catch {
    return []
  }
}

export function loadSavedStorylines(): SavedStorylineEntry[] {
  if (typeof window === 'undefined') return []
  return safeParse(localStorage.getItem(SAVED_STORYLINES_STORAGE_KEY))
}

export function addSavedStoryline(params: {
  query: string
  anchorTitle: string
  storyline: StorylineResult
}): SavedStorylineEntry {
  const list = loadSavedStorylines()
  const entry: SavedStorylineEntry = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sv-${Date.now()}`,
    savedAt: new Date().toISOString(),
    query: params.query,
    anchorTitle: params.anchorTitle,
    storyline: params.storyline,
  }
  const deduped = list.filter(
    e => !(e.query === entry.query && e.anchorTitle === entry.anchorTitle),
  )
  const next = [entry, ...deduped].slice(0, MAX_SAVED)
  localStorage.setItem(SAVED_STORYLINES_STORAGE_KEY, JSON.stringify(next))
  return entry
}

export function removeSavedStoryline(id: string): void {
  if (typeof window === 'undefined') return
  const list = loadSavedStorylines().filter(e => e.id !== id)
  localStorage.setItem(SAVED_STORYLINES_STORAGE_KEY, JSON.stringify(list))
}
