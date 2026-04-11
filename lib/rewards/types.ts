// ─── Enums ──────────────────────────────────────────────────────────────────

export const TIER = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
  ELITE: 'elite',
} as const
export type Tier = (typeof TIER)[keyof typeof TIER]

export const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'elite']

export const BADGE_CATEGORY = {
  ONBOARDING: 'onboarding',
  PARTICIPATION: 'participation',
  ACCURACY: 'accuracy',
  EXPERTISE: 'expertise',
  EARLY_SIGNAL: 'early_signal',
  REASONING: 'reasoning',
  CONSISTENCY: 'consistency',
  PRESTIGE: 'prestige',
} as const
export type BadgeCategory = (typeof BADGE_CATEGORY)[keyof typeof BADGE_CATEGORY]

export const STREAK_TYPE = {
  DAILY_FORECAST: 'daily_forecast',
  WEEKLY_FORECAST: 'weekly_forecast',
  CATEGORY_PARTICIPATION: 'category_participation',
  QUALITY_STREAK: 'quality_streak',
  UPDATE_STREAK: 'update_streak',
} as const
export type StreakType = (typeof STREAK_TYPE)[keyof typeof STREAK_TYPE]

export const FEATURE = {
  PRO_ACCESS: 'pro_access',
  PREMIUM_SIGNALS: 'premium_signals',
  EXPORT_REPORTS: 'export_reports',
  EXPERT_ROOM: 'expert_room',
  PRIORITY_INSIGHTS: 'priority_insights',
  BETA_ACCESS: 'beta_access',
  PREMIUM_DASHBOARD: 'premium_dashboard',
  ADVANCED_ANALYTICS: 'advanced_analytics',
} as const
export type Feature = (typeof FEATURE)[keyof typeof FEATURE]

export const PERIOD_TYPE = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
  ALL_TIME: 'all_time',
} as const
export type PeriodType = (typeof PERIOD_TYPE)[keyof typeof PERIOD_TYPE]

export const NOTIFICATION_TYPE = {
  BADGE_EARNED: 'badge_earned',
  TIER_PROMOTED: 'tier_promoted',
  TIER_DEMOTED: 'tier_demoted',
  STREAK_MILESTONE: 'streak_milestone',
  PRO_DAYS_GRANTED: 'pro_days_granted',
  LEADERBOARD_RANK: 'leaderboard_rank',
  XP_MILESTONE: 'xp_milestone',
  FEATURE_UNLOCKED: 'feature_unlocked',
  STREAK_AT_RISK: 'streak_at_risk',
  CHALLENGE_COMPLETE: 'challenge_complete',
} as const
export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE]

// ─── Point actions ──────────────────────────────────────────────────────────

export const POINT_ACTIONS = {
  FORECAST_SUBMITTED: 'forecast_submitted',
  FORECAST_UPDATED: 'forecast_updated',
  QUESTION_RESOLVED_ACCURATE: 'question_resolved_accurate',
  QUESTION_RESOLVED_INACCURATE: 'question_resolved_inaccurate',
  REASONING_SUBMITTED: 'reasoning_submitted',
  EARLY_FORECAST: 'early_forecast',
  STREAK_BONUS: 'streak_bonus',
  BADGE_EARNED: 'badge_earned',
  LEADERBOARD_RANK: 'leaderboard_rank',
  CONTRARIAN_WIN: 'contrarian_win',
} as const
export type PointAction = (typeof POINT_ACTIONS)[keyof typeof POINT_ACTIONS]

// ─── Points configuration ───────────────────────────────────────────────────

export const BASE_POINTS: Record<string, number> = {
  forecast_submitted: 5,
  forecast_updated: 2,
  question_resolved_accurate: 20,
  question_resolved_inaccurate: 3,
  reasoning_submitted: 8,
  early_forecast: 10,
  streak_bonus: 5,
  badge_earned: 0, // points come from badge definition
  leaderboard_rank: 0, // variable
  contrarian_win: 30,
}

// Multipliers for question difficulty / accuracy
export const MULTIPLIERS = {
  BRIER_EXCELLENT: 2.0,   // brier < 0.05
  BRIER_GOOD: 1.5,        // brier < 0.15
  BRIER_DECENT: 1.0,      // brier < 0.25
  BRIER_POOR: 0.5,        // brier >= 0.25
  EARLY_24H: 1.5,         // forecast within 24h of question open
  EARLY_48H: 1.2,         // forecast within 48h
  STREAK_7: 1.2,
  STREAK_30: 1.5,
  STREAK_90: 2.0,
  HIGH_PARTICIPATION_Q: 1.3, // question with 10+ forecasters
}

// ─── Tier thresholds ────────────────────────────────────────────────────────

export const TIER_THRESHOLDS: Record<Tier, { minXP: number; minQuestions: number }> = {
  bronze:   { minXP: 0,     minQuestions: 0 },
  silver:   { minXP: 200,   minQuestions: 10 },
  gold:     { minXP: 800,   minQuestions: 30 },
  platinum: { minXP: 2500,  minQuestions: 75 },
  elite:    { minXP: 8000,  minQuestions: 150 },
}

// ─── Pro reward thresholds ──────────────────────────────────────────────────

export const PRO_REWARD_RULES = {
  MONTHLY_TOP_10: { days: 7 },
  MONTHLY_TOP_3: { days: 14 },
  MONTHLY_CHAMPION: { days: 30 },
  QUARTERLY_TOP_10: { days: 30 },
  TIER_GOLD: { days: 7 },
  TIER_PLATINUM: { days: 14 },
  TIER_ELITE: { days: 30 },
  STREAK_30: { days: 7 },
  STREAK_90: { days: 30 },
}

// ─── Row types ──────────────────────────────────────────────────────────────

export interface BadgeDefinition {
  id: string
  slug: string
  name_fr: string
  name_en: string
  description_fr: string | null
  description_en: string | null
  icon: string
  category: BadgeCategory
  tier: Tier
  points_value: number
  is_active: boolean
  sort_order: number
  unlock_rule: Record<string, unknown>
  created_at: string
}

export interface UserBadge {
  id: string
  user_id: string
  badge_id: string
  earned_at: string
  seen: boolean
  context: Record<string, unknown>
}

export interface UserRewardProfile {
  id: string
  user_id: string
  total_xp: number
  level: number
  tier: Tier
  tier_updated_at: string | null
  forecasts_submitted: number
  questions_resolved: number
  avg_brier_score: number | null
  best_category: string | null
  longest_streak: number
  current_streak: number
  pro_days_earned: number
  pro_days_used: number
  last_forecast_at: string | null
  last_active_at: string | null
  created_at: string
  updated_at: string
}

export interface StreakState {
  id: string
  user_id: string
  streak_type: StreakType
  current_count: number
  longest_count: number
  last_action_at: string | null
  grace_used: boolean
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface RewardNotification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  data: Record<string, unknown>
  seen: boolean
  created_at: string
}

// ─── Streak grace periods ───────────────────────────────────────────────────

export const STREAK_CONFIG: Record<StreakType, {
  windowHours: number
  graceHours: number
  description: string
}> = {
  daily_forecast: { windowHours: 36, graceHours: 12, description: 'Prevision quotidienne' },
  weekly_forecast: { windowHours: 192, graceHours: 24, description: 'Prevision hebdomadaire' },
  category_participation: { windowHours: 192, graceHours: 24, description: 'Participation categorie' },
  quality_streak: { windowHours: 0, graceHours: 0, description: 'Serie qualite (Brier < 0.25)' },
  update_streak: { windowHours: 72, graceHours: 12, description: 'Mise a jour previsions' },
}

export function xpToLevel(xp: number): number {
  if (xp <= 0) return 1
  return Math.floor(1 + Math.sqrt(xp / 50))
}
