import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Radio, Filter, Search, Archive, ChevronLeft, ChevronRight, Bookmark } from 'lucide-react'
import { getLocale } from '@/lib/i18n/server'
import { tr } from '@/lib/i18n/translations'
import { localizeChannel } from '@/lib/forecast/locale'
import { SignalCard } from '@/components/forecast/SignalCard'
import type { SignalData } from '@/components/forecast/SignalCard'
import { SignalSearchBar } from '@/components/forecast/SignalSearchBar'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: { channel?: string; type?: string; group?: string; period?: string; q?: string; page?: string; saved?: string }
}) {
  const db     = createAdminClient()
  const locale = getLocale()
  const currentPage = Math.max(1, Number(searchParams.page ?? '1'))
  const offset = (currentPage - 1) * PAGE_SIZE
  const period = searchParams.period ?? '7d'
  const searchQuery = searchParams.q?.trim() ?? ''
  const showSaved = searchParams.saved === '1'

  // Get authenticated user + their bookmarks
  let userId: string | null = null
  const bookmarkedIds = new Set<string>()
  try {
    const sbUser = createClient()
    const { data: { user } } = await sbUser.auth.getUser()
    if (user) {
      userId = user.id
      const { data: bms } = await db
        .from('signal_bookmarks')
        .select('signal_id')
        .eq('user_id', user.id)
      for (const b of bms ?? []) bookmarkedIds.add(b.signal_id)
    }
  } catch { /* not logged in */ }

  const [{ data: channels }] = await Promise.all([
    db.from('forecast_channels').select('id, slug, name, name_fr, name_en').eq('is_active', true).order('sort_order'),
  ])

  // Build the signals query
  let query = db
    .from('forecast_signal_feed')
    .select(`
      id, signal_type, title, summary, severity, data, created_at,
      forecast_questions ( id, slug, title, blended_probability ),
      forecast_channels  ( id, slug, name, name_fr, name_en )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (searchParams.type) query = query.eq('signal_type', searchParams.type)

  // "Mes suivis" filter: restrict to bookmarked signal IDs
  if (showSaved && bookmarkedIds.size > 0) {
    query = query.in('id', Array.from(bookmarkedIds))
  } else if (showSaved && bookmarkedIds.size === 0) {
    // No bookmarks — return empty immediately
    query = query.eq('id', '00000000-0000-0000-0000-000000000000')
  }

  // Channel filter
  let channelId: string | null = null
  if (searchParams.channel) {
    const { data: chRow } = await db.from('forecast_channels').select('id').eq('slug', searchParams.channel).single()
    if (chRow) {
      channelId = chRow.id
      query = query.eq('channel_id', channelId)
    }
  }

  // Time period filter
  if (period !== 'all') {
    const msMap: Record<string, number> = {
      '24h': 24 * 60 * 60 * 1000,
      '3d':  3 * 24 * 60 * 60 * 1000,
      '7d':  7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }
    const ms = msMap[period]
    if (ms) {
      query = query.gte('created_at', new Date(Date.now() - ms).toISOString())
    }
  }

  // Full-text search
  if (searchQuery) {
    const tsTokens = searchQuery
      .split(/\s+/)
      .filter(Boolean)
      .map(w => w.replace(/[^a-zA-ZÀ-ÿ0-9]/g, ''))
      .filter(w => w.length >= 2)

    if (tsTokens.length > 0) {
      // Use ilike fallback since search_tsv may not exist yet in production
      query = query.or(
        tsTokens.map(t => `title.ilike.%${t}%,summary.ilike.%${t}%`).join(',')
      )
    }
  }

  const { data: signalsData, count: totalCount } = await query
  const signals = (signalsData ?? []) as SignalData[]
  const total = totalCount ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Grouping
  const groupByChannel = searchParams.group === 'channel'

  type Group = { label: string; items: SignalData[] }
  let groups: Group[] = []

  if (groupByChannel) {
    const map = new Map<string, Group>()
    for (const s of signals) {
      const ch  = s.forecast_channels as any
      const key = ch?.slug ?? 'other'
      if (!map.has(key)) {
        map.set(key, {
          label: ch ? localizeChannel(ch, locale) : (locale === 'fr' ? 'Autre' : 'Other'),
          items: [],
        })
      }
      map.get(key)!.items.push(s)
    }
    groups = Array.from(map.values())
  } else {
    const now       = new Date()
    const today     = now.toDateString()
    const yesterday = new Date(now.getTime() - 86_400_000).toDateString()

    const todayItems:     SignalData[] = []
    const yesterdayItems: SignalData[] = []
    const earlierItems:   SignalData[] = []

    for (const s of signals) {
      const d = new Date(s.created_at).toDateString()
      if (d === today)          todayItems.push(s)
      else if (d === yesterday) yesterdayItems.push(s)
      else                      earlierItems.push(s)
    }

    if (todayItems.length)     groups.push({ label: locale === 'fr' ? "Aujourd'hui" : 'Today',     items: todayItems })
    if (yesterdayItems.length) groups.push({ label: locale === 'fr' ? 'Hier'        : 'Yesterday', items: yesterdayItems })
    if (earlierItems.length)   groups.push({ label: locale === 'fr' ? 'Plus tôt'    : 'Earlier',   items: earlierItems })
    if (!groups.length)        groups.push({ label: '', items: signals })
  }

  function buildHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged: Record<string, string | undefined> = {
      channel: searchParams.channel,
      type:    searchParams.type,
      group:   searchParams.group,
      period:  searchParams.period,
      q:       searchParams.q,
      saved:   searchParams.saved,
      ...overrides,
    }
    // Reset page when filters change (unless explicitly set)
    if (!('page' in overrides)) delete merged.page
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    const s = p.toString()
    return `/forecast/signals${s ? '?' + s : ''}`
  }

  const typeFilters = [
    { key: undefined,             label: tr(locale, 'signals.filter_all') },
    { key: 'probability_shift',   label: tr(locale, 'signals.filter_shift') },
    { key: 'resolution',          label: tr(locale, 'signals.filter_resolve') },
    { key: 'news',                label: tr(locale, 'signals.type_news') },
  ]

  const periodFilters = [
    { key: '24h', label: '24h' },
    { key: '3d',  label: '3j' },
    { key: '7d',  label: '7j' },
    { key: '30d', label: '30j' },
    { key: 'all', label: locale === 'fr' ? 'Tout' : 'All' },
  ]

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-10 space-y-6 sm:space-y-8 overflow-x-hidden">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Radio size={15} className="text-red-400 animate-pulse" />
          <h1 className="text-xl sm:text-2xl font-bold text-white">{tr(locale, 'signals.page_title')}</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
            {tr(locale, 'signals.live_badge')}
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400 flex items-center gap-1">
            <Archive size={9} />
            {total} {locale === 'fr' ? 'articles' : 'articles'}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-neutral-500">
          {locale === 'fr'
            ? 'Tous les signaux et articles collectés. Recherchez par thème, filtrez par période et catégorie.'
            : 'All collected signals and articles. Search by theme, filter by period and category.'}
        </p>
      </div>

      {/* Search bar */}
      <SignalSearchBar
        currentQuery={searchQuery}
        locale={locale}
        basePath={buildHref({ q: undefined, page: undefined })}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-neutral-800">
        <Filter size={12} className="text-neutral-600" />

        {/* Saved filter (only visible if logged in) */}
        {userId && (
          <>
            <Link
              href={buildHref({ saved: showSaved ? undefined : '1', page: undefined })}
              className={`flex items-center gap-1 text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border font-medium transition-colors ${
                showSaved
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/30'
                  : 'border-neutral-700 text-neutral-500 hover:border-blue-500/30 hover:text-blue-400'
              }`}
            >
              <Bookmark size={10} className={showSaved ? 'fill-current' : ''} />
              {locale === 'fr' ? 'Mes suivis' : 'Saved'}
              {bookmarkedIds.size > 0 && (
                <span className="text-[9px] bg-blue-500/20 px-1 rounded">{bookmarkedIds.size}</span>
              )}
            </Link>
            <div className="w-px h-4 bg-neutral-800" />
          </>
        )}

        {/* Period filters */}
        <div className="flex flex-wrap items-center gap-1">
          {periodFilters.map(({ key, label }) => (
            <Link
              key={key}
              href={buildHref({ period: key, page: undefined })}
              className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border font-medium transition-colors ${
                period === key
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/30'
                  : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="w-px h-4 bg-neutral-800" />

        {/* Signal type filters */}
        <div className="flex flex-wrap items-center gap-1">
          {typeFilters.map(({ key, label }) => (
            <Link
              key={key ?? 'all'}
              href={buildHref({ type: key, page: undefined })}
              className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border font-medium transition-colors ${
                searchParams.type === key
                  ? 'bg-white text-neutral-900 border-white'
                  : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="w-px h-4 bg-neutral-800 hidden sm:block" />

        {/* Channel filters */}
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={buildHref({ channel: undefined, page: undefined })}
            className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border font-medium transition-colors ${
              !searchParams.channel
                ? 'bg-neutral-800 text-neutral-200 border-neutral-600'
                : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
            }`}
          >
            {tr(locale, 'page.all')}
          </Link>
          {channels?.map(ch => (
            <Link
              key={ch.id}
              href={buildHref({ channel: ch.slug, page: undefined })}
              className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border font-medium transition-colors ${
                searchParams.channel === ch.slug
                  ? 'bg-neutral-800 text-neutral-200 border-neutral-600'
                  : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
              }`}
            >
              {localizeChannel(ch, locale)}
            </Link>
          ))}
        </div>

        <div className="hidden md:block w-px h-4 bg-neutral-800" />

        {/* Group by */}
        <div className="hidden md:flex items-center gap-1">
          <span className="text-[10px] text-neutral-600 mr-1">{tr(locale, 'signals.group_by')} :</span>
          <Link
            href={buildHref({ group: undefined })}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
              !searchParams.group || searchParams.group === 'date'
                ? 'bg-neutral-800 text-neutral-200 border-neutral-600'
                : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
            }`}
          >
            {tr(locale, 'signals.group_date')}
          </Link>
          <Link
            href={buildHref({ group: 'channel' })}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
              searchParams.group === 'channel'
                ? 'bg-neutral-800 text-neutral-200 border-neutral-600'
                : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'
            }`}
          >
            {tr(locale, 'signals.group_channel')}
          </Link>
        </div>
      </div>

      {/* Search indicator */}
      {searchQuery && (
        <div className="flex items-center gap-2 text-sm">
          <Search size={14} className="text-neutral-500" />
          <span className="text-neutral-400">
            {locale === 'fr' ? 'Résultats pour' : 'Results for'} &ldquo;<span className="text-white font-medium">{searchQuery}</span>&rdquo;
          </span>
          <span className="text-neutral-600">({total})</span>
          <Link href={buildHref({ q: undefined, page: undefined })} className="text-xs text-blue-400 hover:text-blue-300 ml-2">
            {locale === 'fr' ? 'Effacer' : 'Clear'}
          </Link>
        </div>
      )}

      {/* Signal feed */}
      {signals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 py-20 text-center space-y-3">
          <Radio size={32} className="mx-auto text-neutral-700" />
          <p className="text-sm text-neutral-600">
            {searchQuery
              ? (locale === 'fr' ? 'Aucun résultat pour cette recherche.' : 'No results for this search.')
              : tr(locale, 'signals.empty')}
          </p>
          {searchQuery && (
            <Link href={buildHref({ q: undefined, period: 'all' })} className="inline-block text-xs text-blue-400 hover:text-blue-300">
              {locale === 'fr' ? 'Essayer sans filtre' : 'Try without filters'}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(group => (
            <div key={group.label}>
              {group.label && (
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-4">
                  {group.label}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                {group.items.map(s => (
                  <SignalCard key={s.id} signal={s} locale={locale} bookmarkedIds={bookmarkedIds} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {currentPage > 1 && (
            <Link
              href={buildHref({ page: String(currentPage - 1) })}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
            >
              <ChevronLeft size={12} />
              {locale === 'fr' ? 'Précédent' : 'Previous'}
            </Link>
          )}

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }
              return (
                <Link
                  key={pageNum}
                  href={buildHref({ page: String(pageNum) })}
                  className={`text-xs w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                    pageNum === currentPage
                      ? 'bg-blue-600 text-white'
                      : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                  }`}
                >
                  {pageNum}
                </Link>
              )
            })}
          </div>

          <span className="text-[10px] text-neutral-600 px-2">
            {locale === 'fr' ? `sur ${totalPages}` : `of ${totalPages}`}
          </span>

          {currentPage < totalPages && (
            <Link
              href={buildHref({ page: String(currentPage + 1) })}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
            >
              {locale === 'fr' ? 'Suivant' : 'Next'}
              <ChevronRight size={12} />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
