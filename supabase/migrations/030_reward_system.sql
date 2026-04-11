-- =============================================================
-- 030_reward_system.sql
-- Reward & gamification engine: badges, streaks, points, tiers,
-- feature unlocks, leaderboard snapshots.
-- Fully idempotent — safe to re-run.
-- =============================================================

-- ─── 1. badge_definitions ────────────────────────────────────

create table if not exists badge_definitions (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        unique not null,
  name_fr       text        not null,
  name_en       text        not null,
  description_fr text,
  description_en text,
  icon          text        not null default 'award',
  category      text        not null default 'participation'
                  check (category in (
                    'onboarding','participation','accuracy','expertise',
                    'early_signal','reasoning','consistency','prestige'
                  )),
  tier          text        not null default 'bronze'
                  check (tier in ('bronze','silver','gold','platinum','elite')),
  points_value  int         not null default 0,
  is_active     boolean     not null default true,
  sort_order    int         not null default 0,
  unlock_rule   jsonb       not null default '{}',
  created_at    timestamptz not null default now()
);

-- ─── 1b. tier_definitions ────────────────────────────────────

create table if not exists tier_definitions (
  id              uuid        primary key default gen_random_uuid(),
  slug            text        unique not null,
  name_fr         text        not null,
  name_en         text        not null,
  sort_order      int         not null default 0,
  min_xp          int         not null default 0,
  min_questions   int         not null default 0,
  pro_days_reward int         not null default 0,
  benefits_fr     text,
  benefits_en     text,
  color           text        not null default '#a3a3a3',
  icon            text        not null default 'shield',
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tier_definitions_order on tier_definitions(sort_order asc);

-- ─── 2. user_badges ──────────────────────────────────────────

create table if not exists user_badges (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  badge_id      uuid        not null references badge_definitions(id) on delete cascade,
  earned_at     timestamptz not null default now(),
  seen          boolean     not null default false,
  context       jsonb       not null default '{}',
  unique (user_id, badge_id)
);

create index if not exists idx_user_badges_user on user_badges(user_id);
create index if not exists idx_user_badges_unseen on user_badges(user_id, seen) where seen = false;

-- ─── 3. user_reward_profiles ─────────────────────────────────

create table if not exists user_reward_profiles (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null unique,
  total_xp              int         not null default 0,
  level                 int         not null default 1,
  tier                  text        not null default 'bronze'
                          check (tier in ('bronze','silver','gold','platinum','elite')),
  tier_updated_at       timestamptz,
  forecasts_submitted   int         not null default 0,
  questions_resolved    int         not null default 0,
  avg_brier_score       real,
  best_category         text,
  longest_streak        int         not null default 0,
  current_streak        int         not null default 0,
  pro_days_earned       int         not null default 0,
  pro_days_used         int         not null default 0,
  last_forecast_at      timestamptz,
  last_active_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_user_reward_profiles_tier on user_reward_profiles(tier);
create index if not exists idx_user_reward_profiles_xp   on user_reward_profiles(total_xp desc);

-- ─── 4. reward_points_ledger ─────────────────────────────────

create table if not exists reward_points_ledger (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  action        text        not null,
  points        int         not null,
  multiplier    real        not null default 1.0,
  final_points  int         not null,
  reference_id  uuid,
  reference_type text,
  details       jsonb       not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists idx_reward_points_ledger_user on reward_points_ledger(user_id, created_at desc);
create index if not exists idx_reward_points_ledger_action on reward_points_ledger(action);

-- ─── 5. streak_states ────────────────────────────────────────

create table if not exists streak_states (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null,
  streak_type     text        not null
                    check (streak_type in ('daily_forecast','weekly_forecast','category_participation','quality_streak','update_streak')),
  current_count   int         not null default 0,
  longest_count   int         not null default 0,
  last_action_at  timestamptz,
  grace_used      boolean     not null default false,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, streak_type)
);

create index if not exists idx_streak_states_user on streak_states(user_id);
create index if not exists idx_streak_states_expiry on streak_states(expires_at) where expires_at is not null;

-- ─── 6. tier_memberships (history) ───────────────────────────

create table if not exists tier_memberships (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  tier          text        not null
                  check (tier in ('bronze','silver','gold','platinum','elite')),
  promoted_at   timestamptz not null default now(),
  demoted_at    timestamptz,
  season        text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tier_memberships_user on tier_memberships(user_id, promoted_at desc);

-- ─── 7. feature_unlocks ──────────────────────────────────────

create table if not exists feature_unlocks (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  feature       text        not null
                  check (feature in (
                    'pro_access','premium_signals','export_reports',
                    'expert_room','priority_insights','beta_access',
                    'premium_dashboard','advanced_analytics'
                  )),
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz,
  source        text        not null default 'reward'
                  check (source in ('reward','admin','promo','referral','purchase')),
  source_ref    text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_feature_unlocks_user on feature_unlocks(user_id, feature);
create index if not exists idx_feature_unlocks_active on feature_unlocks(user_id, is_active, expires_at)
  where is_active = true;

-- ─── 8. leaderboard_snapshots ────────────────────────────────

create table if not exists leaderboard_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  period_type   text        not null
                  check (period_type in ('weekly','monthly','quarterly','yearly','all_time')),
  period_key    text        not null,
  category      text,
  user_id       uuid        not null,
  rank          int         not null,
  score         real        not null,
  questions_scored int      not null default 0,
  accuracy_pct  real,
  data          jsonb       not null default '{}',
  snapshot_at   timestamptz not null default now()
);

create index if not exists idx_leaderboard_snapshots_period on leaderboard_snapshots(period_type, period_key);
create index if not exists idx_leaderboard_snapshots_user   on leaderboard_snapshots(user_id, period_type);
create unique index if not exists idx_leaderboard_snapshots_unique
  on leaderboard_snapshots(period_type, period_key, category, user_id)
  where category is not null;
create unique index if not exists idx_leaderboard_snapshots_unique_global
  on leaderboard_snapshots(period_type, period_key, user_id)
  where category is null;

-- ─── 9. reward_notifications ─────────────────────────────────

create table if not exists reward_notifications (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null,
  type          text        not null
                  check (type in (
                    'badge_earned','tier_promoted','tier_demoted','streak_milestone',
                    'pro_days_granted','leaderboard_rank','xp_milestone',
                    'feature_unlocked','streak_at_risk','challenge_complete'
                  )),
  title         text        not null,
  body          text,
  data          jsonb       not null default '{}',
  seen          boolean     not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_reward_notifications_user on reward_notifications(user_id, created_at desc);
create index if not exists idx_reward_notifications_unseen on reward_notifications(user_id, seen) where seen = false;

-- ─── 10. RLS ─────────────────────────────────────────────────

do $$ begin alter table tier_definitions      enable row level security; exception when others then null; end $$;
do $$ begin alter table badge_definitions     enable row level security; exception when others then null; end $$;
do $$ begin alter table user_badges           enable row level security; exception when others then null; end $$;
do $$ begin alter table user_reward_profiles  enable row level security; exception when others then null; end $$;
do $$ begin alter table reward_points_ledger  enable row level security; exception when others then null; end $$;
do $$ begin alter table streak_states         enable row level security; exception when others then null; end $$;
do $$ begin alter table tier_memberships      enable row level security; exception when others then null; end $$;
do $$ begin alter table feature_unlocks       enable row level security; exception when others then null; end $$;
do $$ begin alter table leaderboard_snapshots enable row level security; exception when others then null; end $$;
do $$ begin alter table reward_notifications  enable row level security; exception when others then null; end $$;

-- Public read on tier + badge definitions
do $$ begin
  drop policy if exists "tier_definitions_public_read" on tier_definitions;
  create policy "tier_definitions_public_read" on tier_definitions for select using (is_active = true);
exception when others then null; end $$;

do $$ begin
  drop policy if exists "badge_definitions_public_read" on badge_definitions;
  create policy "badge_definitions_public_read" on badge_definitions for select using (is_active = true);
exception when others then null; end $$;

-- Users read own data
do $$ begin
  drop policy if exists "user_badges_read_own" on user_badges;
  create policy "user_badges_read_own" on user_badges for select using (user_id = auth.uid());
exception when others then null; end $$;

do $$ begin
  drop policy if exists "user_badges_public_read" on user_badges;
  create policy "user_badges_public_read" on user_badges for select using (true);
exception when others then null; end $$;

do $$ begin
  drop policy if exists "user_reward_profiles_public_read" on user_reward_profiles;
  create policy "user_reward_profiles_public_read" on user_reward_profiles for select using (true);
exception when others then null; end $$;

do $$ begin
  drop policy if exists "reward_points_ledger_read_own" on reward_points_ledger;
  create policy "reward_points_ledger_read_own" on reward_points_ledger for select using (user_id = auth.uid());
exception when others then null; end $$;

do $$ begin
  drop policy if exists "streak_states_read_own" on streak_states;
  create policy "streak_states_read_own" on streak_states for select using (user_id = auth.uid());
exception when others then null; end $$;

do $$ begin
  drop policy if exists "feature_unlocks_read_own" on feature_unlocks;
  create policy "feature_unlocks_read_own" on feature_unlocks for select using (user_id = auth.uid());
exception when others then null; end $$;

do $$ begin
  drop policy if exists "leaderboard_snapshots_public_read" on leaderboard_snapshots;
  create policy "leaderboard_snapshots_public_read" on leaderboard_snapshots for select using (true);
exception when others then null; end $$;

do $$ begin
  drop policy if exists "reward_notifications_read_own" on reward_notifications;
  create policy "reward_notifications_read_own" on reward_notifications for select using (user_id = auth.uid());
exception when others then null; end $$;

do $$ begin
  drop policy if exists "reward_notifications_update_own" on reward_notifications;
  create policy "reward_notifications_update_own" on reward_notifications for update using (user_id = auth.uid());
exception when others then null; end $$;

-- ─── 11a. Seed tier definitions ──────────────────────────────

insert into tier_definitions (slug, name_fr, name_en, sort_order, min_xp, min_questions, pro_days_reward, benefits_fr, benefits_en, color, icon) values
  ('bronze',   'Bronze',   'Bronze',   1, 0,    0,   0,  'Acces de base',                          'Basic access',                  '#cd7f32', 'shield'),
  ('silver',   'Argent',   'Silver',   2, 200,  10,  0,  'Badge visible sur le profil',             'Visible badge on profile',      '#c0c0c0', 'shield'),
  ('gold',     'Or',       'Gold',     3, 800,  30,  7,  '+7 jours Pro Veille Concurrentielle',     '+7 days Pro Competitive Watch', '#ffd700', 'crown'),
  ('platinum', 'Platine',  'Platinum', 4, 2500, 75,  14, '+14 jours Pro Veille Concurrentielle',    '+14 days Pro Competitive Watch','#e5e4e2', 'gem'),
  ('elite',    'Elite',    'Elite',    5, 8000, 150, 30, '+30 jours Pro Veille Concurrentielle',    '+30 days Pro Competitive Watch','#9b59b6', 'star')
on conflict (slug) do update set
  name_fr = excluded.name_fr,
  name_en = excluded.name_en,
  sort_order = excluded.sort_order,
  min_xp = excluded.min_xp,
  min_questions = excluded.min_questions,
  pro_days_reward = excluded.pro_days_reward,
  benefits_fr = excluded.benefits_fr,
  benefits_en = excluded.benefits_en,
  color = excluded.color,
  icon = excluded.icon;

-- ─── 11b. Seed badge definitions ─────────────────────────────

insert into badge_definitions (slug, name_fr, name_en, description_fr, description_en, icon, category, tier, points_value, sort_order, unlock_rule) values
  -- Onboarding
  ('first-forecast',      'Premiere Prevision',        'First Forecast',          'Soumettez votre premiere prevision',              'Submit your first forecast',              'target',    'onboarding',    'bronze',   10,  1,  '{"type":"forecast_count","threshold":1}'),
  ('profile-complete',    'Profil Complet',            'Profile Complete',         'Completez votre profil',                          'Complete your profile',                   'user',      'onboarding',    'bronze',   10,  2,  '{"type":"profile_complete"}'),
  -- Participation
  ('forecaster-10',       'Analyste Actif',            'Active Analyst',          '10 previsions soumises',                          '10 forecasts submitted',                  'bar-chart', 'participation', 'bronze',   25,  10, '{"type":"forecast_count","threshold":10}'),
  ('forecaster-50',       'Analyste Confirme',         'Confirmed Analyst',       '50 previsions soumises',                          '50 forecasts submitted',                  'bar-chart', 'participation', 'silver',   50,  11, '{"type":"forecast_count","threshold":50}'),
  ('forecaster-100',      'Analyste Expert',           'Expert Analyst',          '100 previsions soumises',                         '100 forecasts submitted',                 'bar-chart', 'participation', 'gold',    100,  12, '{"type":"forecast_count","threshold":100}'),
  ('forecaster-500',      'Grand Analyste',            'Grand Analyst',           '500 previsions soumises',                         '500 forecasts submitted',                 'bar-chart', 'participation', 'platinum',200,  13, '{"type":"forecast_count","threshold":500}'),
  -- Accuracy
  ('sharp-eye',           'Oeil Acere',                'Sharp Eye',               '5 previsions avec Brier < 0.10',                  '5 forecasts with Brier < 0.10',           'eye',       'accuracy',      'silver',   50,  20, '{"type":"accuracy_count","brier_threshold":0.10,"threshold":5}'),
  ('precision-master',    'Maitre Precision',          'Precision Master',        '20 previsions avec Brier < 0.10',                 '20 forecasts with Brier < 0.10',          'crosshair', 'accuracy',      'gold',    150,  21, '{"type":"accuracy_count","brier_threshold":0.10,"threshold":20}'),
  ('oracle',              'Oracle',                    'Oracle',                  'Brier moyen < 0.15 sur 30+ questions',            'Average Brier < 0.15 on 30+ questions',   'sun',       'accuracy',      'platinum',300,  22, '{"type":"avg_brier","brier_threshold":0.15,"min_questions":30}'),
  ('contrarian-winner',   'Contrarian Gagnant',        'Contrarian Winner',       'Predit correctement contre le consensus (>70%)',  'Correctly predicted against consensus',    'zap',       'accuracy',      'gold',    100,  23, '{"type":"contrarian_win","threshold":3}'),
  -- Expertise
  ('macro-specialist',    'Specialiste Macro',         'Macro Specialist',        '15+ previsions en Macro & Commodities',           '15+ forecasts in Macro & Commodities',    'trending-up','expertise',    'silver',   75,  30, '{"type":"category_count","category":"macro-commodities","threshold":15}'),
  ('politics-specialist', 'Specialiste Politique',     'Politics Specialist',     '15+ previsions en Politics & Policy',             '15+ forecasts in Politics & Policy',      'landmark',  'expertise',     'silver',   75,  31, '{"type":"category_count","category":"politics-policy","threshold":15}'),
  ('tech-specialist',     'Specialiste Tech',          'Tech Specialist',         '15+ previsions en Tech & IA',                     '15+ forecasts in Tech & AI',              'cpu',       'expertise',     'silver',   75,  32, '{"type":"category_count","category":"tech-ai","threshold":15}'),
  -- Consistency
  ('streak-7',            'Semaine de Feu',            'Hot Week',                'Serie de 7 jours de previsions consecutifs',       '7-day forecast streak',                   'flame',     'consistency',   'bronze',   30,  40, '{"type":"streak","streak_type":"daily_forecast","threshold":7}'),
  ('streak-30',           'Mois Implacable',           'Relentless Month',        'Serie de 30 jours de previsions consecutifs',      '30-day forecast streak',                  'flame',     'consistency',   'gold',    150,  41, '{"type":"streak","streak_type":"daily_forecast","threshold":30}'),
  ('streak-90',           'Trimestre de Legende',      'Legendary Quarter',       'Serie de 90 jours consecutifs',                    '90-day forecast streak',                  'flame',     'consistency',   'elite',   500,  42, '{"type":"streak","streak_type":"daily_forecast","threshold":90}'),
  -- Prestige
  ('top-10-monthly',      'Top 10 Mensuel',            'Monthly Top 10',          'Classement Top 10 sur un mois',                   'Top 10 on monthly leaderboard',           'trophy',    'prestige',      'gold',    200,  50, '{"type":"leaderboard_rank","period":"monthly","max_rank":10}'),
  ('top-3-monthly',       'Podium Mensuel',            'Monthly Podium',          'Classement Top 3 sur un mois',                    'Top 3 on monthly leaderboard',            'medal',     'prestige',      'platinum',400,  51, '{"type":"leaderboard_rank","period":"monthly","max_rank":3}'),
  ('champion-monthly',    'Champion du Mois',          'Monthly Champion',        'Premier du classement mensuel',                   'First place on monthly leaderboard',      'crown',     'prestige',      'elite',   600,  52, '{"type":"leaderboard_rank","period":"monthly","max_rank":1}'),
  ('most-improved',       'Progression Remarquable',   'Most Improved',           'Plus forte amelioration de score sur un mois',    'Biggest score improvement in a month',    'rocket',    'prestige',      'silver',  100,  53, '{"type":"most_improved","period":"monthly"}'),
  -- Early signal
  ('early-spotter',       'Detecteur Precoce',         'Early Spotter',           'Prevision juste soumise dans les 24h',            'Correct forecast within first 24h',       'radar',     'early_signal',  'silver',   75,  60, '{"type":"early_forecast","hours":24,"threshold":3}'),
  ('trend-setter',        'Faiseur de Tendances',      'Trend Setter',            '10 previsions precoces correctes',                '10 early correct forecasts',              'compass',   'early_signal',  'gold',    200,  61, '{"type":"early_forecast","hours":24,"threshold":10}')
on conflict (slug) do nothing;
