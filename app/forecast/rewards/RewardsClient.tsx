'use client'

import Link from 'next/link'
import { Award, Flame, Trophy, Zap, Crown, Target, Lock, Gift, Star, ArrowRight } from 'lucide-react'

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  bronze:   { label: 'Bronze',   color: 'text-orange-400', bg: 'bg-orange-500/10', ring: 'ring-orange-500/30' },
  silver:   { label: 'Argent',   color: 'text-neutral-300', bg: 'bg-neutral-500/10', ring: 'ring-neutral-400/30' },
  gold:     { label: 'Or',       color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-400/30' },
  platinum: { label: 'Platine',  color: 'text-cyan-400', bg: 'bg-cyan-500/10', ring: 'ring-cyan-400/30' },
  elite:    { label: 'Elite',    color: 'text-purple-400', bg: 'bg-purple-500/10', ring: 'ring-purple-400/30' },
}

const STREAK_LABELS: Record<string, string> = {
  daily_forecast: 'Previsions quotidiennes',
  weekly_forecast: 'Previsions hebdomadaires',
  update_streak: 'Mises a jour',
  quality_streak: 'Serie qualite',
  category_participation: 'Participation categorie',
}

const ACTION_LABELS: Record<string, string> = {
  forecast_submitted: 'Prevision soumise',
  forecast_updated: 'Prevision mise a jour',
  question_resolved_accurate: 'Resolution precise',
  question_resolved_inaccurate: 'Resolution imprecise',
  reasoning_submitted: 'Raisonnement publie',
  early_forecast: 'Prevision precoce',
  streak_bonus: 'Bonus serie',
  badge_earned: 'Badge obtenu',
  contrarian_win: 'Contrarian gagnant',
}

interface Props {
  isAuthenticated: boolean
  profile: any
  badges: any[]
  badgeDefs: any[]
  streaks: any[]
  activeUnlocks: any[]
  notifications: any[]
  recentPoints: any[]
}

export default function RewardsClient({
  isAuthenticated,
  profile,
  badges,
  badgeDefs,
  streaks,
  activeUnlocks,
  notifications,
  recentPoints,
}: Props) {
  const earnedSlugs = new Set(badges.map((b: any) => b.badge_definitions?.slug))
  const tierConfig = TIER_CONFIG[profile?.tier ?? 'bronze']

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full">
          <Award size={11} />
          Programme de recompenses
        </div>
        <h1 className="text-3xl font-bold text-white">Recompenses & Progression</h1>
        <p className="text-sm text-neutral-500">
          Gagnez des points, debloquez des badges et acces premium en contribuant avec precision.
        </p>
      </div>

      {!isAuthenticated ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-12 text-center space-y-4">
          <Lock size={32} className="mx-auto text-neutral-600" />
          <p className="text-neutral-400">Connectez-vous pour acceder a votre profil de recompenses.</p>
          <Link href="/login" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">
            Se connecter <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <>
          {/* Profile card */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ring-2 ${tierConfig.ring} ${tierConfig.bg}`}>
                  <Crown size={24} className={tierConfig.color} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold px-2 py-0.5 rounded ${tierConfig.bg} ${tierConfig.color}`}>
                      {tierConfig.label}
                    </span>
                    <span className="text-xs text-neutral-500">Niveau {profile?.level ?? 1}</span>
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">{(profile?.total_xp ?? 0).toLocaleString()} XP</div>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="text-xs text-neutral-500">{profile?.forecasts_submitted ?? 0} previsions</div>
                <div className="text-xs text-neutral-500">{profile?.questions_resolved ?? 0} questions resolues</div>
                {profile?.avg_brier_score != null && (
                  <div className="text-xs text-neutral-500">Brier moy: {profile.avg_brier_score.toFixed(3)}</div>
                )}
              </div>
            </div>

            {/* XP progress to next level */}
            {profile && (
              <div>
                <div className="flex justify-between text-xs text-neutral-500 mb-1">
                  <span>Niveau {profile.level}</span>
                  <span>Niveau {profile.level + 1}</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((profile.total_xp - (profile.level - 1) ** 2 * 50) / ((profile.level) ** 2 * 50 - (profile.level - 1) ** 2 * 50)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Streaks */}
          {streaks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Flame size={18} className="text-orange-400" /> Series actives
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {streaks.map((s: any) => (
                  <div key={s.id} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 flex items-center gap-3">
                    <Flame size={20} className={s.current_count > 0 ? 'text-orange-400' : 'text-neutral-700'} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-neutral-200">
                        {STREAK_LABELS[s.streak_type] ?? s.streak_type}
                      </div>
                      <div className="text-xs text-neutral-500">Record: {s.longest_count} jours</div>
                    </div>
                    <div className="text-2xl font-bold text-white">{s.current_count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active unlocks */}
          {activeUnlocks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Gift size={18} className="text-green-400" /> Acces actifs
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeUnlocks.map((u: any) => (
                  <div key={u.id} className="rounded-xl border border-green-800/30 bg-green-900/10 p-4 flex items-center gap-3">
                    <Star size={18} className="text-green-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-green-300 capitalize">{u.feature.replace(/_/g, ' ')}</div>
                      {u.expires_at && (
                        <div className="text-xs text-green-500/60">
                          Expire le {new Date(u.expires_at).toLocaleDateString('fr-FR')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notifications */}
          {notifications.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap size={18} className="text-amber-400" /> Nouvelles recompenses
              </h2>
              <div className="space-y-2">
                {notifications.map((n: any) => (
                  <div key={n.id} className="rounded-xl border border-amber-800/20 bg-amber-900/10 px-4 py-3 flex items-center gap-3">
                    <Zap size={14} className="text-amber-400 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-amber-200">{n.title}</div>
                      {n.body && <div className="text-xs text-amber-400/60 mt-0.5">{n.body}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Badges */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy size={18} className="text-amber-400" /> Badges
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {badgeDefs.map((def: any) => {
                const earned = earnedSlugs.has(def.slug)
                const tc = TIER_CONFIG[def.tier] ?? TIER_CONFIG.bronze
                return (
                  <div
                    key={def.id}
                    className={`rounded-xl border p-4 text-center space-y-2 transition-all ${
                      earned
                        ? `border-neutral-700 bg-neutral-900/60 ${tc.ring} ring-1`
                        : 'border-neutral-800/50 bg-neutral-900/20 opacity-40'
                    }`}
                  >
                    <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center ${earned ? tc.bg : 'bg-neutral-800'}`}>
                      {earned
                        ? <Award size={18} className={tc.color} />
                        : <Lock size={14} className="text-neutral-600" />
                      }
                    </div>
                    <div className="text-xs font-semibold text-neutral-200">{def.name_fr}</div>
                    <div className="text-[10px] text-neutral-500">{def.description_fr}</div>
                    {earned && <div className="text-[10px] text-blue-400 font-bold">+{def.points_value} XP</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent points */}
          {recentPoints.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Target size={18} className="text-blue-400" /> Historique XP recent
              </h2>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-neutral-800/50">
                    {recentPoints.map((p: any, i: number) => (
                      <tr key={i} className="hover:bg-neutral-800/20">
                        <td className="px-4 py-2.5 text-neutral-400">{ACTION_LABELS[p.action] ?? p.action}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-green-400">+{p.final_points}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-neutral-600">
                          {new Date(p.created_at).toLocaleDateString('fr-FR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tier progression */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Progression des tiers</h2>
            <div className="flex gap-2">
              {(['bronze', 'silver', 'gold', 'platinum', 'elite'] as const).map(tier => {
                const tc = TIER_CONFIG[tier]
                const current = profile?.tier === tier
                const above = (['bronze', 'silver', 'gold', 'platinum', 'elite'] as const).indexOf(tier) <=
                  (['bronze', 'silver', 'gold', 'platinum', 'elite'] as const).indexOf(profile?.tier ?? 'bronze')
                return (
                  <div
                    key={tier}
                    className={`flex-1 rounded-lg p-3 text-center ${
                      current ? `${tc.bg} ring-2 ${tc.ring}` : above ? 'bg-neutral-800/40' : 'bg-neutral-900/30'
                    }`}
                  >
                    <div className={`text-sm font-bold ${current ? tc.color : above ? 'text-neutral-400' : 'text-neutral-600'}`}>
                      {tc.label}
                    </div>
                    {current && <div className="text-[10px] text-neutral-400 mt-1">Actuel</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
