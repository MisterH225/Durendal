import { createAdminClient } from '@/lib/supabase/admin'
import { Trophy, TrendingDown, CheckCircle, Users } from 'lucide-react'
import { getLocale } from '@/lib/i18n/server'
import { tr } from '@/lib/i18n/translations'

export const dynamic = 'force-dynamic'

function brierColor(score: number | null) {
  if (score === null) return 'text-neutral-600'
  if (score < 0.10) return 'text-emerald-400'
  if (score < 0.20) return 'text-green-400'
  if (score < 0.30) return 'text-amber-400'
  return 'text-red-400'
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default async function LeaderboardPage() {
  const db = createAdminClient()
  const locale = getLocale()

  const { data: leaderboard } = await db
    .from('forecast_leaderboard')
    .select('user_id, display_name, avg_brier_score, questions_scored, good_predictions, accuracy_pct, rank')
    .not('avg_brier_score', 'is', null)
    .gte('questions_scored', 1)
    .order('avg_brier_score', { ascending: true })
    .limit(100)

  const { count: totalUsers } = await db
    .from('forecast_leaderboard')
    .select('user_id', { count: 'exact', head: true })
    .not('avg_brier_score', 'is', null)

  function brierLabel(score: number | null) {
    if (score === null) return '—'
    if (score < 0.10) return tr(locale, 'lb.excellent')
    if (score < 0.20) return tr(locale, 'lb.good')
    if (score < 0.30) return tr(locale, 'lb.average')
    return tr(locale, 'lb.weak')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
          <Trophy size={11} />
          {tr(locale, 'lb.badge')}
        </div>
        <h1 className="text-3xl font-bold text-white">{tr(locale, 'lb.title')}</h1>
        <p className="text-sm text-neutral-500">{tr(locale, 'lb.subtitle')}</p>
      </div>

      {/* Brier explanation */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-5 py-4 text-xs text-neutral-500 space-y-1">
        <div className="font-semibold text-neutral-400 mb-2 flex items-center gap-1.5">
          <TrendingDown size={12} />
          {tr(locale, 'lb.how_title')}
        </div>
        <p>
          {tr(locale, 'lb.how_body')}{' '}
          {locale === 'fr' ? 'Formule' : 'Formula'} :{' '}
          <code className="bg-neutral-800 px-1 rounded text-neutral-300">{tr(locale, 'lb.formula')}</code>
        </p>
        <div className="flex gap-4 mt-2">
          {([
            ['< 0.10', 'lb.excellent', 'text-emerald-400'],
            ['< 0.20', 'lb.good',      'text-green-400'],
            ['< 0.30', 'lb.average',   'text-amber-400'],
            ['≥ 0.30', 'lb.weak',      'text-red-400'],
          ] as const).map(([range, key, color]) => (
            <span key={key} className="flex items-center gap-1">
              <span className={`font-mono text-[11px] ${color}`}>{range}</span>
              <span className="text-neutral-600">{tr(locale, key)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Stats banner */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-center">
          <div className="text-2xl font-bold text-white">{totalUsers ?? 0}</div>
          <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1 justify-center">
            <Users size={10} />{tr(locale, 'lb.stat_users')}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {leaderboard?.[0]?.avg_brier_score?.toFixed(3) ?? '—'}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">{tr(locale, 'lb.stat_best')}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">
            {leaderboard?.length
              ? Math.round(leaderboard.reduce((s, r) => s + (r.accuracy_pct ?? 0), 0) / leaderboard.length)
              : 0}%
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">{tr(locale, 'lb.stat_avg')}</div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        {!leaderboard?.length ? (
          <div className="text-center py-16 text-neutral-600">
            <Trophy size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">{tr(locale, 'lb.empty_title')}</p>
            <p className="text-xs mt-1">{tr(locale, 'lb.empty_sub')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider w-12">#</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">{tr(locale, 'lb.col_user')}</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">{tr(locale, 'lb.col_brier')}</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider hidden sm:table-cell">{tr(locale, 'lb.col_accuracy')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider hidden sm:table-cell">{tr(locale, 'lb.col_questions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {leaderboard.map((row, i) => {
                const rank = row.rank ?? (i + 1)
                const medal = MEDAL[rank]
                const scoreColor = brierColor(row.avg_brier_score)
                return (
                  <tr key={row.user_id} className={`transition-colors hover:bg-neutral-800/30 ${rank <= 3 ? 'bg-neutral-900/60' : ''}`}>
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-mono">{medal ?? <span className="text-neutral-600">{rank}</span>}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="text-sm font-semibold text-neutral-200">{row.display_name}</div>
                      <div className={`text-[10px] mt-0.5 ${scoreColor}`}>{brierLabel(row.avg_brier_score)}</div>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <span className={`font-mono text-sm font-bold ${scoreColor}`}>{row.avg_brier_score?.toFixed(3) ?? '—'}</span>
                    </td>
                    <td className="px-3 py-3.5 text-right hidden sm:table-cell">
                      <div className="flex items-center gap-1 justify-end">
                        <CheckCircle size={10} className="text-emerald-600" />
                        <span className="text-sm text-neutral-300 font-mono">{row.accuracy_pct ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      <span className="text-sm text-neutral-500 font-mono">{row.questions_scored}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-center text-xs text-neutral-700">{tr(locale, 'lb.footer')}</p>
    </div>
  )
}
