-- ══════════════════════════════════════════════
-- MARKETLENS — Schéma base de données complet
-- À coller dans Supabase > SQL Editor > New query
-- ══════════════════════════════════════════════

-- Extension pour les vecteurs (assistant IA RAG)
create extension if not exists vector;

-- ── PLANS ──────────────────────────────────────
create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- 'free', 'pro', 'business'
  display_name text not null, -- 'Free', 'Pro', 'Business'
  price_monthly integer not null default 0, -- en centimes (0, 9900, 24900)
  price_yearly integer not null default 0,
  max_watches integer not null default 1,
  max_companies integer not null default 3,
  max_reports_per_month integer not null default 2,
  agents_enabled integer[] not null default '{1}', -- [1,2,3,4]
  realtime_collection boolean not null default false,
  has_assistant boolean not null default false,
  has_doc_sources boolean not null default false,
  has_export boolean not null default false,
  max_team_members integer default 1,
  support_level text not null default 'faq', -- 'faq', 'chat', 'priority'
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- Plans par défaut
insert into plans (name, display_name, price_monthly, price_yearly, max_watches, max_companies, max_reports_per_month, agents_enabled, realtime_collection, has_assistant, has_doc_sources, has_export, max_team_members, support_level) values
('free',     'Free',     0,     0,      1,  3,  2,   '{1}',       false, false, false, false, 1,  'faq'),
('pro',      'Pro',      9900,  7900,   5,  15, 30,  '{1,2,3,4}', true,  true,  true,  true,  1,  'chat'),
('business', 'Business', 24900, 19900,  999,50, 999, '{1,2,3,4}', true,  true,  true,  true,  10, 'priority');

-- ── ACCOUNTS ───────────────────────────────────
create table accounts (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'individual', -- 'individual', 'enterprise'
  company_name text,
  plan_id uuid references plans(id) not null,
  subscription_status text not null default 'trial', -- 'trial', 'active', 'cancelled', 'suspended'
  trial_ends_at timestamptz default (now() + interval '14 days'),
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── USERS / PROFILS ─────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid references accounts(id),
  full_name text,
  email text not null,
  role text not null default 'individual', -- 'superadmin', 'owner', 'editor', 'reader', 'individual'
  avatar_url text,
  is_active boolean default true,
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── WATCHES (VEILLES) ───────────────────────────
create table watches (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade not null,
  created_by uuid references profiles(id) not null,
  name text not null,
  description text,
  sectors text[] not null default '{}',
  countries text[] not null default '{}',
  frequency text not null default 'daily', -- 'realtime', 'daily', 'weekly'
  is_shared boolean default false, -- partagée avec toute l'équipe
  is_active boolean default true,
  agents_config jsonb default '{"agent1":true,"agent2":true,"agent3":false,"agent4":false}',
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── COMPANIES (entreprises à suivre) ────────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sector text,
  country text,
  website text,
  linkedin_url text,
  description text,
  logo_url text,
  is_global boolean default true, -- dans la base commune
  added_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Lien watch <-> companies
create table watch_companies (
  watch_id uuid references watches(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (watch_id, company_id)
);

-- ── SOURCES BIBLIOTHÈQUE (Admin) ────────────────
create table sources (
  id uuid primary key default gen_random_uuid(),
  type text not null, -- 'web', 'document', 'data'
  name text not null,
  url text, -- pour les sources web
  storage_path text, -- pour les documents
  file_type text, -- 'pdf', 'excel', 'word', 'csv'
  countries text[] default '{}',
  sectors text[] default '{}',
  language text default 'fr',
  source_category text, -- 'press', 'institutional', 'blog', 'social', 'customs'
  scraping_method text default 'rss', -- 'rss', 'scrape', 'api'
  rss_url text,
  css_selector text,
  plans_access text[] default '{"free","pro","business"}',
  reliability_score integer default 3, -- 1-5
  is_active boolean default true,
  last_scraped_at timestamptz,
  error_count integer default 0,
  admin_notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Sources par défaut (presse africaine)
insert into sources (type, name, url, rss_url, countries, sectors, source_category, plans_access, reliability_score) values
('web', 'TechCabal', 'https://techcabal.com', 'https://techcabal.com/feed', '{"NG","GH","KE","SN","CI"}', '{"fintech","tech","ecommerce"}', 'press', '{"free","pro","business"}', 5),
('web', 'Jeune Afrique', 'https://www.jeuneafrique.com', 'https://www.jeuneafrique.com/feed', '{"CI","SN","MA","TN","CM"}', '{"business","finance","politique"}', 'press', '{"free","pro","business"}', 5),
('web', 'Agence Ecofin', 'https://www.agenceecofin.com', 'https://www.agenceecofin.com/rss', '{"CI","SN","GH","NG","CM"}', '{"finance","energie","agriculture"}', 'press', '{"free","pro","business"}', 4),
('web', 'Disrupt Africa', 'https://disrupt-africa.com', 'https://disrupt-africa.com/feed', '{"GH","NG","KE","ZA"}', '{"tech","startup","fintech"}', 'press', '{"pro","business"}', 4),
('web', 'CIO Mag Africa', 'https://www.cio-mag.com', 'https://www.cio-mag.com/feed', '{"CI","SN","MA","GH"}', '{"tech","telecom","digital"}', 'press', '{"pro","business"}', 4),
('web', 'Abidjan.net', 'https://news.abidjan.net', null, '{"CI"}', '{"business","politique","economie"}', 'press', '{"free","pro","business"}', 3),
('web', 'Seneplus', 'https://www.seneplus.com', 'https://www.seneplus.com/rss.xml', '{"SN"}', '{"business","economie","politique"}', 'press', '{"free","pro","business"}', 3),
('web', 'Graphic Online', 'https://www.graphic.com.gh', null, '{"GH"}', '{"business","economie"}', 'press', '{"free","pro","business"}', 3),
('web', 'BCEAO', 'https://www.bceao.int', null, '{"CI","SN","BF","ML","TG","BJ","NE","GW"}', '{"finance","regulation","banque"}', 'institutional', '{"pro","business"}', 5),
('web', 'Africanews', 'https://www.africanews.com', 'https://www.africanews.com/feed/rss', '{"CI","SN","GH","NG","KE","CM"}', '{"business","politique","economie"}', 'press', '{"free","pro","business"}', 4);

-- ── SIGNALS (signaux collectés) ──────────────────
create table signals (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid references watches(id) on delete cascade not null,
  company_id uuid references companies(id),
  source_id uuid references sources(id),
  raw_content text not null,
  title text,
  url text,
  published_at timestamptz,
  relevance_score float default 0.5,
  sentiment text, -- 'positive', 'negative', 'neutral'
  signal_type text, -- 'news', 'job', 'product', 'partnership', 'funding'
  is_processed boolean default false,
  collected_at timestamptz default now()
);

-- ── REPORTS (rapports générés) ───────────────────
create table reports (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid references watches(id) on delete cascade not null,
  account_id uuid references accounts(id) not null,
  type text not null, -- 'synthesis', 'market', 'strategy'
  title text not null,
  content jsonb not null default '{}',
  summary text,
  embedding vector(1536),
  pdf_url text,
  word_url text,
  agent_used integer, -- 2, 3, ou 4
  tokens_used integer default 0,
  is_read boolean default false,
  generated_at timestamptz default now()
);

-- ── RECOMMENDATIONS (Agent 4) ────────────────────
create table recommendations (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid references watches(id) on delete cascade not null,
  account_id uuid references accounts(id) not null,
  title text not null,
  description text not null,
  priority text not null default 'medium', -- 'high', 'medium', 'low'
  type text, -- 'market_entry', 'partnership', 'defense', 'new_segment'
  confidence_score float default 0.5,
  time_horizon text, -- '1-3 months', '3-6 months', '6-12 months'
  risks text[],
  actions text[],
  is_actioned boolean default false,
  created_at timestamptz default now()
);

-- ── ACCÈS SPÉCIAUX ───────────────────────────────
create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null, -- 'percent', 'fixed'
  value integer not null, -- % ou centimes
  duration_months integer, -- null = permanent
  applicable_plans text[] default '{"pro","business"}',
  max_uses integer, -- null = illimité
  used_count integer default 0,
  new_users_only boolean default false,
  expires_at timestamptz,
  is_active boolean default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table promo_code_uses (
  id uuid primary key default gen_random_uuid(),
  code_id uuid references promo_codes(id) not null,
  account_id uuid references accounts(id) not null,
  discount_applied integer not null,
  used_at timestamptz default now()
);

create table special_access (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade not null,
  type text not null, -- 'test_profile', 'plan_upgrade'
  granted_plan text not null,
  original_plan text,
  starts_at timestamptz default now(),
  expires_at timestamptz not null,
  on_expiry text default 'downgrade', -- 'downgrade', 'suspend'
  reminder_sent_7d boolean default false,
  reminder_sent_1d boolean default false,
  converted_to_paid boolean default false,
  admin_note text,
  activation_link text unique,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references profiles(id) not null,
  referee_id uuid references profiles(id),
  ref_code text unique not null,
  status text default 'pending', -- 'pending', 'qualified', 'rewarded'
  referrer_reward jsonb, -- {type: 'month', value: 1}
  referee_reward jsonb, -- {type: 'percent', value: 30}
  qualified_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz default now()
);

-- ── AGENT JOBS (queue de tâches) ─────────────────
create table agent_jobs (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid references watches(id) on delete cascade not null,
  agent_number integer not null, -- 1, 2, 3, 4
  status text default 'pending', -- 'pending', 'running', 'done', 'failed'
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  tokens_used integer default 0,
  cost_usd float default 0,
  result_id uuid, -- report_id ou recommendation_id
  created_at timestamptz default now()
);

-- ── CHAT MESSAGES (Assistant IA) ─────────────────
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  watch_id uuid references watches(id), -- contexte optionnel
  role text not null, -- 'user', 'assistant'
  content text not null,
  tokens_used integer default 0,
  created_at timestamptz default now()
);

-- ── ALERTS (notifications) ───────────────────────
create table alerts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade not null,
  watch_id uuid references watches(id),
  type text not null, -- 'signal', 'report_ready', 'trial_ending', 'plan_limit'
  title text not null,
  message text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ══════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Chaque user ne voit que ses propres données
-- ══════════════════════════════════════════════

alter table profiles enable row level security;
alter table accounts enable row level security;
alter table watches enable row level security;
alter table signals enable row level security;
alter table reports enable row level security;
alter table recommendations enable row level security;
alter table chat_messages enable row level security;
alter table alerts enable row level security;
alter table watch_companies enable row level security;

-- Policies profiles
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Policies accounts
create policy "Users can view own account"
  on accounts for select using (
    id in (select account_id from profiles where id = auth.uid())
  );

-- Policies watches
create policy "Users can CRUD own watches"
  on watches for all using (
    account_id in (select account_id from profiles where id = auth.uid())
  );

-- Policies signals
create policy "Users can view own signals"
  on signals for select using (
    watch_id in (select id from watches where account_id in (
      select account_id from profiles where id = auth.uid()
    ))
  );

-- Policies reports
create policy "Users can view own reports"
  on reports for select using (
    account_id in (select account_id from profiles where id = auth.uid())
  );

-- Policies recommendations
create policy "Users can view own recommendations"
  on recommendations for select using (
    account_id in (select account_id from profiles where id = auth.uid())
  );

-- Policies chat
create policy "Users can manage own chat"
  on chat_messages for all using (
    user_id = auth.uid()
  );

-- Policies alerts
create policy "Users can manage own alerts"
  on alerts for all using (
    account_id in (select account_id from profiles where id = auth.uid())
  );

-- Sources et plans : lisibles par tous les utilisateurs connectés
create policy "Authenticated can view active sources"
  on sources for select using (auth.role() = 'authenticated' and is_active = true);
create policy "Authenticated can view plans"
  on plans for select using (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════
-- TRIGGER : crée automatiquement le profil
-- et le compte Free à l'inscription
-- ══════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger as $$
declare
  free_plan_id uuid;
  new_account_id uuid;
begin
  -- Récupère le plan Free
  select id into free_plan_id from plans where name = 'free' limit 1;

  -- Crée le compte
  insert into accounts (type, plan_id, subscription_status, trial_ends_at)
  values ('individual', free_plan_id, 'active', null)
  returning id into new_account_id;

  -- Crée le profil
  insert into profiles (id, account_id, email, full_name, role)
  values (
    new.id,
    new_account_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when new.email = current_setting('app.superadmin_email', true) then 'superadmin' else 'individual' end
  );

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ══════════════════════════════════════════════
-- INDEX pour les performances
-- ══════════════════════════════════════════════
create index idx_profiles_account on profiles(account_id);
create index idx_watches_account on watches(account_id);
create index idx_signals_watch on signals(watch_id);
create index idx_signals_company on signals(company_id);
create index idx_reports_account on reports(account_id);
create index idx_reports_watch on reports(watch_id);
create index idx_alerts_account on alerts(account_id);
create index idx_agent_jobs_watch on agent_jobs(watch_id);
create index idx_agent_jobs_status on agent_jobs(status);

-- Index vectoriel pour le RAG
create index idx_reports_embedding on reports using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ── INDEX supplémentaire pour les lookups LinkedIn ────────────────────────
create index if not exists idx_companies_linkedin on companies(linkedin_url) where linkedin_url is not null;

-- ── Quelques entreprises africaines avec leurs URLs LinkedIn ─────────────
insert into companies (name, sector, country, website, linkedin_url, is_global) values
('Wave Mobile Money',  'Fintech',    'SN', 'https://www.wave.com',          'https://www.linkedin.com/company/wave-mobile-money', true),
('MTN MoMo',          'Fintech',    'GH', 'https://mtn.com',               'https://www.linkedin.com/company/mtn', true),
('Orange Money',      'Fintech',    'CI', 'https://orange.ci',             'https://www.linkedin.com/company/orange', true),
('Flutterwave',       'Fintech',    'NG', 'https://flutterwave.com',       'https://www.linkedin.com/company/flutterwave-technology', true),
('PayDunya',          'Fintech',    'CI', 'https://paydunya.com',          'https://www.linkedin.com/company/paydunya', true),
('Jumia CI',          'E-commerce', 'CI', 'https://www.jumia.ci',          'https://www.linkedin.com/company/jumia', true),
('Ecobank',           'Banque',     'CI', 'https://ecobank.com',           'https://www.linkedin.com/company/ecobank', true),
('Orange CI',         'Télécom',    'CI', 'https://orange.ci',             'https://www.linkedin.com/company/orange-cote-d-ivoire', true),
('MTN CI',            'Télécom',    'CI', 'https://mtn.ci',                'https://www.linkedin.com/company/mtn-cote-d-ivoire', true),
('Moov Africa',       'Télécom',    'CI', 'https://moov-africa.ci',        'https://www.linkedin.com/company/moov-africa', true)
on conflict do nothing;
