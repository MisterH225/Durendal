'use client'

import Link from 'next/link'
import {
  Trophy, TrendingDown, CheckCircle, Users, Award, Flame, Zap,
  Crown, Target, Lock, Gift, Star, ArrowRight,
} from 'lucide-react'
import type { Locale } from '@/lib/i18n/translations'
import { tr } from '@/lib/i18n/translations'

// ─── Config ──────────────────────────────────────────────────────────────────

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  bronze:   { label: 'Bronze',  color: 'text-orange-400',  bg: 'bg-orange-500/10', ring: 'ring-orange-500/30' },
  silver:   { label: 'Argent',  color: 'text-neutral-300', bg: 'bg-neutral-500/10', ring: 'ring-neutral-400/30' },
  gold:     { label: 'Or',      color: 'text-amber-400',   bg: 'bg-amber-500/10',  ring: 'ring-amber-400/30' },
  platinum: { label: 'Platine', color: 'text-cyan-400',    bg: 'bg-cyan-500/10',   ring: 'ring-cyan-400/30' },
  elite:    { label: 'Elite',   color: 'text-purple-400',  bg: 'bg-purple-500/10', ring: 'ring-purple-400/30' },
}

const STREAK_LABELS: Record<string, string> = {
  daily_forecast: 'Quotidienne',
  weekly_forecast: 'Hebdomadaire',
  update_streak: 'Mises a jour',
  quality_streak: 'Qualite',
  category_participation: 'Categorie',
}

const ACTION_LABELS: Record<string, string> = {
  forecast_submitted: 'Prevision',
  forecast_updated: 'Mise a jour',
  question_resolved_accurate: 'Bonne prediction',
  question_resolved_inaccurate: 'Prediction',
  reasoning_submitted: 'Raisonnement',
  early_forecast: 'Prevision precoce',
  streak_bonus: 'Bonus serie',
  badge_earned: 'Badge',
  contrarian_win: 'Contrarian',
}

function brierColor(score: number | null) {
  if (score === null) return 'text-neutral-600'
  if (score < 0.10) return 'text-emerald-400'
  if (score < 0.20) return 'text-green-400'
  if (score < 0.30) return 'text-amber-400'
  return 'text-red-400'
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  locale: Locale
  isAuthenticated: boolean
  leaderboard: any[]
  totalUsers: number
  mostActive: any[]
  recentBadgeUnlocks: any[]
  rewardProfile: any
  userBadges: any[]
  badgeDefs: any[]
  streaks: any[]
  activeUnlocks: any[]
  notifications: any[]
  recentPoints: any[]
  tierDefs: any[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeaderboardRewardsClient({
  locale,
  isAuthenticated,
  leaderboard,
  totalUsers,
  mostActive,
  recentBadgeUnlocks,
  rewardProfile,
  userBadges,
  badgeDefs,
  streaks,
  activeUnlocks,
  notifications,
  recentPoints,
  tierDefs,
}: Props) {
  const isFr = locale === 'fr'
  const earnedSlugs = new Set(userBadges.map((b: any) => b.badge_definitions?.slug))
  const tierConfig = TIER_CONFIG[rewardProfile?.tier ?? 'bronze']

  function brierLabel(score: number | null) {
    if (score === null) return '—'
    if (score < 0.10) return tr(locale, 'lb.excellent')
    if (score < 0.20) return tr(locale, 'lb.good')
    if (score < 0.30) return tr(locale, 'lb.average')
    return tr(locale, 'lb.weak')
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-5 sm:py-8 overflow-x-hidden">
      {/* Header */}
      <div className="text-center mb-5 sm:mb-8 space-y-2">
        <div className="inline-flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
          <Trophy size={11} />
          {tr(locale, 'lb.badge')}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{isFr ? 'Classement & Recompenses' : 'Leaderboard & Rewards'}</h1>
        <p className="text-xs sm:text-sm text-neutral-500">{tr(locale, 'lb.subtitle')}</p>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ═══ LEFT PANEL — Leaderboard ═══ */}
        <div className="lg:w-[55%] space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-center">
              <div className="text-xl font-bold text-white">{totalUsers}</div>
              <div className="text-[10px] text-neutral-500 flex items-center gap-1 justify-center">
                <Users size={9} />{tr(locale, 'lb.stat_users')}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-center">
              <div className="text-xl font-bold text-emerald-400">
                {leaderboard[0]?.avg_brier_score?.toFixed(3) ?? '—'}
              </div>
              <div className="text-[10px] text-neutral-500">{tr(locale, 'lb.stat_best')}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3 text-center">
              <div className="text-xl font-bold text-blue-400">
                {leaderboard.length
                  ? Math.round(leaderboard.reduce((s, r) => s + (r.accuracy_pct ?? 0), 0) / leaderboard.length)
                  : 0}%
              </div>
              <div className="text-[10px] text-neutral-500">{tr(locale, 'lb.stat_avg')}</div>
            </div>
          </div>

          {/* Brier explanation */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-xs text-neutral-500 space-y-1">
            <div className="font-semibold text-neutral-400 mb-1 flex items-center gap-1.5">
              <TrendingDown size={11} />
              {tr(locale, 'lb.how_title')}
            </div>
            <p className="text-[11px]">
              {tr(locale, 'lb.how_body')}{' '}
              <code className="bg-neutral-800 px-1 rounded text-neutral-300">{tr(locale, 'lb.formula')}</code>
            </p>
            <div className="flex gap-3 mt-1.5 flex-wrap">
              {([
                ['< 0.10', 'lb.excellent', 'text-emerald-400'],
                ['< 0.20', 'lb.good', 'text-green-400'],
                ['< 0.30', 'lb.average', 'text-amber-400'],
                ['≥ 0.30', 'lb.weak', 'text-red-400'],
              ] as const).map(([range, key, color]) => (
                <span key={key} className="flex items-center gap-1">
                  <span className={`font-mono text-[10px] ${color}`}>{range}</span>
                  <span className="text-neutral-600 text-[10px]">{tr(locale, key)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Leaderboard table */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/60">
              <h2 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                <Trophy size={14} className="text-amber-400" />
                {isFr ? 'Classement Precision' : 'Accuracy Leaderboard'}
              </h2>
            </div>
            {!leaderboard.length ? (
              <div className="text-center py-12 text-neutral-600">
                <Trophy size={28} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">{tr(locale, 'lb.empty_title')}</p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-neutral-900/90 backdrop-blur-sm">
                    <tr className="border-b border-neutral-800">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-neutral-600 uppercase w-10">#</th>
                      <th className="text-left px-2 py-2 text-[10px] font-semibold text-neutral-600 uppercase">{tr(locale, 'lb.col_user')}</th>
                      <th className="text-right px-2 py-2 text-[10px] font-semibold text-neutral-600 uppercase">{tr(locale, 'lb.col_brier')}</th>
                      <th className="text-right px-2 py-2 text-[10px] font-semibold text-neutral-600 uppercase hidden md:table-cell">{tr(locale, 'lb.col_accuracy')}</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-neutral-600 uppercase hidden md:table-cell">{tr(locale, 'lb.col_questions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/40">
                    {leaderboard.map((row, i) => {
                      const rank = row.rank ?? (i + 1)
                      const medal = MEDAL[rank]
                      const sc = brierColor(row.avg_brier_score)
                      return (
                        <tr key={row.user_id} className={`hover:bg-neutral-800/30 transition-colors ${rank <= 3 ? 'bg-neutral-900/50' : ''}`}>
                          <td className="px-3 py-2.5 text-xs font-mono">{medal ?? <span className="text-neutral-600">{rank}</span>}</td>
                          <td className="px-2 py-2.5">
                            <div className="text-sm font-semibold text-neutral-200 truncate max-w-[140px]">{row.display_name}</div>
                            <div className={`text-[10px] ${sc}`}>{brierLabel(row.avg_brier_score)}</div>
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <span className={`font-mono text-sm font-bold ${sc}`}>{row.avg_brier_score?.toFixed(3) ?? '—'}</span>
                          </td>
                          <td className="px-2 py-2.5 text-right hidden md:table-cell">
                            <div className="flex items-center gap-1 justify-end">
                              <CheckCircle size={9} className="text-emerald-600" />
                              <span className="text-xs text-neutral-300 font-mono">{row.accuracy_pct ?? 0}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right hidden md:table-cell">
                            <span className="text-xs text-neutral-500 font-mono">{row.questions_scored}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Most active */}
          {mostActive.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/60">
                <h2 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                  <Zap size={14} className="text-blue-400" />
                  {isFr ? 'Utilisateurs les plus actifs' : 'Most Active Users'}
                </h2>
              </div>
              <div className="divide-y divide-neutral-800/40">
                {mostActive.map((u, i) => {
                  const tc = TIER_CONFIG[u.tier] ?? TIER_CONFIG.bronze
                  return (
                    <div key={u.user_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/20">
                      <span className="text-xs text-neutral-600 font-mono w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-neutral-200 truncate">{u.display_name}</div>
                        <div className="text-[10px] text-neutral-500">{u.forecasts_submitted} {isFr ? 'previsions' : 'forecasts'}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tc.bg} ${tc.color}`}>{tc.label}</span>
                      <span className="text-xs font-bold text-blue-400">{u.total_xp.toLocaleString()} XP</span>
                      {u.current_streak > 0 && (
                        <span className="flex items-center gap-0.5 text-orange-400 text-xs">
                          <Flame size={10} />{u.current_streak}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent badge unlocks */}
          {recentBadgeUnlocks.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/60">
                <h2 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                  <Award size={14} className="text-amber-400" />
                  {isFr ? 'Badges recemment debloques' : 'Recently Unlocked Badges'}
                </h2>
              </div>
              <div className="divide-y divide-neutral-800/40">
                {recentBadgeUnlocks.map((b: any, i: number) => {
                  const bd = b.badge_definitions
                  const tc = TIER_CONFIG[bd?.tier] ?? TIER_CONFIG.bronze
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/20">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${tc.bg}`}>
                        <Award size={13} className={tc.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-neutral-200">{bd?.name_fr ?? '—'}</span>
                        <span className="text-[10px] text-neutral-500 ml-2">{b.display_name}</span>
                      </div>
                      <span className="text-[10px] text-neutral-600">{new Date(b.earned_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══ RIGHT PANEL — My Rewards ═══ */}
        <div className="lg:w-[45%] space-y-5">

          {!isAuthenticated ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-10 text-center space-y-4 sticky top-20">
              <Lock size={28} className="mx-auto text-neutral-600" />
              <p className="text-sm text-neutral-400">{isFr ? 'Connectez-vous pour voir vos recompenses' : 'Log in to see your rewards'}</p>
              <Link href="/login" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">
                {isFr ? 'Se connecter' : 'Log in'} <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <>
              {/* My profile card */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ring-2 ${tierConfig.ring} ${tierConfig.bg}`}>
                    <Crown size={20} className={tierConfig.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${tierConfig.bg} ${tierConfig.color}`}>
                        {tierConfig.label}
                      </span>
                      <span className="text-[10px] text-neutral-500">Niv. {rewardProfile?.level ?? 1}</span>
                    </div>
                    <div className="text-xl font-bold text-white mt-0.5">{(rewardProfile?.total_xp ?? 0).toLocaleString()} XP</div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <div className="text-[10px] text-neutral-500">{rewardProfile?.forecasts_submitted ?? 0} {isFr ? 'previsions' : 'forecasts'}</div>
                    <div className="text-[10px] text-neutral-500">{rewardProfile?.questions_resolved ?? 0} {isFr ? 'resolues' : 'resolved'}</div>
                    {rewardProfile?.avg_brier_score != null && (
                      <div className="text-[10px] text-neutral-500">Brier: {rewardProfile.avg_brier_score.toFixed(3)}</div>
                    )}
                  </div>
                </div>

                {/* XP bar */}
                {rewardProfile && (
                  <div>
                    <div className="flex justify-between text-[10px] text-neutral-600 mb-0.5">
                      <span>Niv. {rewardProfile.level}</span>
                      <span>Niv. {rewardProfile.level + 1}</span>
                    </div>
                    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, ((rewardProfile.total_xp - (rewardProfile.level - 1) ** 2 * 50) / (Math.max(1, rewardProfile.level ** 2 * 50 - (rewardProfile.level - 1) ** 2 * 50))) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Tier progression mini */}
                <div className="flex gap-1">
                  {(tierDefs.length > 0
                    ? tierDefs.map((td: any) => ({ slug: td.slug, label: td.name_fr }))
                    : [{ slug: 'bronze', label: 'Bronze' }, { slug: 'silver', label: 'Argent' }, { slug: 'gold', label: 'Or' }, { slug: 'platinum', label: 'Platine' }, { slug: 'elite', label: 'Elite' }]
                  ).map((tier: { slug: string; label: string }, idx: number) => {
                    const tc = TIER_CONFIG[tier.slug] ?? TIER_CONFIG.bronze
                    const current = rewardProfile?.tier === tier.slug
                    const allSlugs = tierDefs.length > 0 ? tierDefs.map((td: any) => td.slug) : ['bronze', 'silver', 'gold', 'platinum', 'elite']
                    const passed = allSlugs.indexOf(tier.slug) <= allSlugs.indexOf(rewardProfile?.tier ?? 'bronze')
                    return (
                      <div
                        key={tier.slug}
                        className={`flex-1 rounded py-1.5 text-center ${current ? `${tc.bg} ring-1 ${tc.ring}` : passed ? 'bg-neutral-800/40' : 'bg-neutral-900/30'}`}
                      >
                        <div className={`text-[10px] font-bold ${current ? tc.color : passed ? 'text-neutral-500' : 'text-neutral-700'}`}>
                          {tier.label}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Notifications */}
              {notifications.length > 0 && (
                <div className="rounded-xl border border-amber-800/20 bg-amber-900/10 p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                    <Zap size={12} /> {isFr ? 'Nouvelles recompenses' : 'New rewards'}
                  </h3>
                  {notifications.map((n: any) => (
                    <div key={n.id} className="flex items-start gap-2">
                      <Zap size={10} className="text-amber-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs font-medium text-amber-200">{n.title}</div>
                        {n.body && <div className="text-[10px] text-amber-400/50">{n.body}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Streaks */}
              {streaks.length > 0 && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                    <Flame size={12} className="text-orange-400" /> {isFr ? 'Series actives' : 'Active Streaks'}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {streaks.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-2 bg-neutral-800/30 rounded-lg px-3 py-2">
                        <Flame size={14} className={s.current_count > 0 ? 'text-orange-400' : 'text-neutral-700'} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-neutral-300 truncate">{STREAK_LABELS[s.streak_type] ?? s.streak_type}</div>
                          <div className="text-[10px] text-neutral-600">Record: {s.longest_count}j</div>
                        </div>
                        <span className="text-lg font-bold text-white">{s.current_count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active unlocks */}
              {activeUnlocks.length > 0 && (
                <div className="rounded-xl border border-green-800/20 bg-green-900/10 p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-green-300 flex items-center gap-1.5">
                    <Gift size={12} /> {isFr ? 'Acces premium actifs' : 'Active Premium Access'}
                  </h3>
                  {activeUnlocks.map((u: any) => (
                    <div key={u.id} className="flex items-center gap-2">
                      <Star size={12} className="text-green-400" />
                      <span className="text-xs text-green-200 capitalize flex-1">{u.feature.replace(/_/g, ' ')}</span>
                      {u.expires_at && (
                        <span className="text-[10px] text-green-500/50">
                          {isFr ? 'Expire' : 'Expires'} {new Date(u.expires_at).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Badges grid */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Trophy size={12} className="text-amber-400" /> Badges
                  <span className="text-[10px] text-neutral-600 ml-auto">{userBadges.length}/{badgeDefs.length}</span>
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {badgeDefs.map((def: any) => {
                    const earned = earnedSlugs.has(def.slug)
                    const tc = TIER_CONFIG[def.tier] ?? TIER_CONFIG.bronze
                    return (
                      <div
                        key={def.id}
                        title={def.description_fr}
                        className={`rounded-lg p-2.5 text-center space-y-1.5 transition-all ${
                          earned
                            ? `border border-neutral-700 bg-neutral-900/60 ring-1 ${tc.ring}`
                            : 'border border-neutral-800/40 bg-neutral-900/20 opacity-35'
                        }`}
                      >
                        <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center ${earned ? tc.bg : 'bg-neutral-800'}`}>
                          {earned
                            ? <Award size={14} className={tc.color} />
                            : <Lock size={10} className="text-neutral-600" />}
                        </div>
                        <div className="text-[10px] font-semibold text-neutral-300 leading-tight">{def.name_fr}</div>
                        {earned && <div className="text-[9px] text-blue-400 font-bold">+{def.points_value} XP</div>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Recent XP history */}
              {recentPoints.length > 0 && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/60">
                    <h3 className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                      <Target size={12} className="text-blue-400" /> {isFr ? 'Historique XP' : 'XP History'}
                    </h3>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-neutral-800/40">
                        {recentPoints.map((p: any, i: number) => (
                          <tr key={i} className="hover:bg-neutral-800/20">
                            <td className="px-3 py-2 text-neutral-400">{ACTION_LABELS[p.action] ?? p.action}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold text-green-400">+{p.final_points}</td>
                            <td className="px-3 py-2 text-right text-[10px] text-neutral-600">
                              {new Date(p.created_at).toLocaleDateString('fr-FR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <p className="text-center text-[10px] text-neutral-700 mt-6">{tr(locale, 'lb.footer')}</p>
    </div>
  )
}
