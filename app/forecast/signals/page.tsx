import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Radio, Filter, ExternalLink } from 'lucide-react'
import { getLocale } from '@/lib/i18n/server'
import { tr } from '@/lib/i18n/translations'
import { localizeChannel } from '@/lib/forecast/locale'
import { SignalCard } from '@/components/forecast/SignalCard'
import type { SignalData } from '@/components/forecast/SignalCard'
import { FORECAST_SOURCES, TIER_COLORS } from '@/lib/forecast/sources'

export const dynamic = 'force-dynamic'

const SIGNAL_TYPES = ['probability_shift', 'resolution'] as const

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: { channel?: string; type?: string; group?: string }
}) {
  const db     = createAdminClient()
  const locale = getLocale()

  const [{ data: channels }, signalsResult] = await Promise.all([
    db.from('forecast_channels').select('id, slug, name, name_fr, name_en').eq('is_active', true).order('sort_order'),
    (() => {
      let q = db
        .from('forecast_signal_feed')
        .select('id, signal_type, title, summary, severity, data, created_at, forecast_questions(id, slug, title, blended_probability), forecast_channels(id, slug, name, name_fr, name_en)')
        .order('created_at', { ascending: false })
        .limit(60)
      if (searchParams.type)    q = q.eq('signal_type', searchParams.type)
      if (searchParams.channel) {
        // will be filtered client-side after we resolve channel_id
      }
      return q
    })(),
  ])

  let signals = (signalsResult.data ?? []) as SignalData[]

  // Filter by channel slug (resolved in-memory)
  if (searchParams.channel) {
    signals = signals.filter(s => (s.forecast_channels as any)?.slug === searchParams.channel)
  }

  // Grouping
  const groupByChannel = searchParams.group === 'channel'
  const groupByDate    = !groupByChannel

  type Group = { label: string; items: SignalData[] }
  let groups: Group[] = []

  if (groupByChannel) {
    const map = new Map<string, Group>()
    for (const s of signals) {
      const ch = (s.forecast_channels as any)
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
    // Group by date (Today / Yesterday / Earlier)
    const now   = new Date()
    const today = now.toDateString()
    const yesterday = new Date(now.getTime() - 86_400_000).toDateString()
    const todayItems:     SignalData[] = []
    const yesterdayItems: SignalData[] = []
    const earlierItems:   SignalData[] = []

    for (const s of signals) {
      const d = new Date(s.created_at).toDateString()
      if (d === today)     todayItems.push(s)
      else if (d === yesterday) yesterdayItems.push(s)
      else                 earlierItems.push(s)
    }

    const today_label     = locale === 'fr' ? "Aujourd'hui"  : 'Today'
    const yesterday_label = locale === 'fr' ? 'Hier'         : 'Yesterday'
    const earlier_label   = locale === 'fr' ? 'Plus tôt'     : 'Earlier'

    if (todayItems.length)     groups.push({ label: today_label,     items: todayItems })
    if (yesterdayItems.length) groups.push({ label: yesterday_label, items: yesterdayItems })
    if (earlierItems.length)   groups.push({ label: earlier_label,   items: earlierItems })
    if (!groups.length)        groups.push({ label: '',              items: signals })
  }

  const tierLabels: Record<1 | 2 | 3, string> = {
    1: tr(locale, 'signals.tier1'),
    2: tr(locale, 'signals.tier2'),
    3: tr(locale, 'signals.tier3'),
  }

  const sourcesByTier = [1, 2, 3].map(t => ({
    tier:  t as 1 | 2 | 3,
    label: tierLabels[t as 1 | 2 | 3],
    items: FORECAST_SOURCES.filter(s => s.tier === t),
  }))

  function buildHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { channel: searchParams.channel, type: searchParams.type, group: searchParams.group, ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    const s = p.toString()
    return `/forecast/signals${s ? '?' + s : ''}`
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Radio size={15} className="text-red-400 animate-pulse" />
          <h1 className="text-2xl font-bold text-white">{tr(locale, 'signals.page_title')}</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
            {tr(locale, 'signals.live_badge')}
          </span>
        </div>
        <p className="text-sm text-neutral-500">{tr(locale, 'signals.page_sub')}</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-neutral-800">
        <Filter size={12} className="text-neutral-600" />

        {/* Signal type */}
        <div className="flex items-center gap-1">
          <Link href={buildHref({ type: undefined })}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${!searchParams.type ? 'bg-white text-neutral-900 border-white' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'}`}>
            {tr(locale, 'signals.filter_all')}
          </Link>
          <Link href={buildHref({ type: 'probability_shift' })}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${searchParams.type === 'probability_shift' ? 'bg-white text-neutral-900 border-white' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'}`}>
            {tr(locale, 'signals.filter_shift')}
          </Link>
          <Link href={buildHref({ type: 'resolution' })}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${searchParams.type === 'resolution' ? 'bg-white text-neutral-900 border-white' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'}`}>
            {tr(locale, 'signals.filter_resolve')}
          </Link>
        </div>

        <div className="w-px h-4 bg-neutral-800" />

        {/* Channel filter */}
        <div className="flex flex-wrap items-center gap-1">
          <Link href={buildHref({ channel: undefined })}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${!searchParams.channel ? 'bg-neutral-800 text-neutral-200 border-neutral-600' : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'}`}>
            {tr(locale, 'page.all')}
          </Link>
          {channels?.map(ch => (
            <Link key={ch.id} href={buildHref({ channel: ch.slug })}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${searchParams.channel === ch.slug ? 'bg-neutral-800 text-neutral-200 border-neutral-600' : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'}`}>
              {localizeChannel(ch, locale)}
            </Link>
          ))}
        </div>

        <div className="w-px h-4 bg-neutral-800 hidden md:block" />

        {/* Group by */}
        <div className="hidden md:flex items-center gap-1">
          <span className="text-[10px] text-neutral-600 mr-1">{tr(locale, 'signals.group_by')} :</span>
          <Link href={buildHref({ group: undefined })}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${!searchParams.group || searchParams.group === 'date' ? 'bg-neutral-800 text-neutral-200 border-neutral-600' : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'}`}>
            {tr(locale, 'signals.group_date')}
          </Link>
          <Link href={buildHref({ group: 'channel' })}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${searchParams.group === 'channel' ? 'bg-neutral-800 text-neutral-200 border-neutral-600' : 'border-neutral-700 text-neutral-500 hover:border-neutral-600'}`}>
            {tr(locale, 'signals.group_channel')}
          </Link>
        </div>
      </div>

      {/* Grouped signal feed */}
      {signals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 py-20 text-center">
          <Radio size={32} className="mx-auto mb-3 text-neutral-700" />
          <p className="text-sm text-neutral-600">{tr(locale, 'signals.empty')}</p>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map(group => (
            <div key={group.label}>
              {group.label && (
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-4">
                  {group.label}
                </div>
              )}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.items.map(s => (
                  <SignalCard key={s.id} signal={s} locale={locale} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Data Sources reference */}
      <section className="border-t border-neutral-800 pt-10 space-y-6">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-neutral-200">{tr(locale, 'signals.sources_title')}</h2>
          <p className="text-xs text-neutral-500">{tr(locale, 'signals.sources_sub')}</p>
        </div>

        <div className="space-y-6">
          {sourcesByTier.map(({ tier, label, items }) => (
            <div key={tier}>
              <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border mb-3 ${TIER_COLORS[tier]}`}>
                T{tier} — {label.split('—')[1]?.trim() ?? label}
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {items.map(src => (
                  <div key={src.name} className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-neutral-200">{src.name}</span>
                      {src.url && (
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-neutral-600 hover:text-neutral-400 transition-colors">
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">{src.why}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
