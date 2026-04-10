-- 019_sources_forecast_columns.sql
-- Étend la table sources existante pour couvrir les sources du module Forecast

do $$ begin
  alter table sources add column forecast_tier        int     check (forecast_tier in (1,2,3));
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table sources add column forecast_channel_slugs text[];
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table sources add column forecast_why text;
exception when duplicate_column then null;
end $$;

-- ── Seed : 17 sources forecast (on conflict → on met à jour les champs forecast) ──

-- Tier 1 — Sources primaires officielles
insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                     forecast_tier, forecast_channel_slugs, forecast_why,
                     ai_description, plans_access)
values
  ('World Bank Open Data',
   'https://data.worldbank.org',
   'web', 'api', 5, true, 1,
   ARRAY['macro-commodities','agriculture-risk','regional-business-events'],
   'Global institution with standardized country-level data and long historical coverage.',
   'Macroeconomic, development, trade and country-level indicators.',
   ARRAY['free','pro','business']),

  ('IMF Data',
   'https://www.imf.org/en/Data',
   'web', 'api', 5, true, 1,
   ARRAY['macro-commodities','politics-policy','climate'],
   'Timely macroeconomic datasets and country surveillance reports.',
   'IMF country surveillance, inflation, FX, fiscal and balance-of-payments data.',
   ARRAY['free','pro','business']),

  ('FAOSTAT',
   'https://www.fao.org/faostat',
   'web', 'api', 5, true, 1,
   ARRAY['agriculture-risk'],
   'Core international agriculture database with broad country coverage.',
   'FAO agriculture, crops, food systems, production and trade data.',
   ARRAY['free','pro','business']),

  ('Election Commission websites',
   null,
   'web', 'scraping', 5, true, 1,
   ARRAY['politics-policy'],
   'Primary source for legally authoritative election outcomes and dates.',
   'Country-specific election commission websites for official results.',
   ARRAY['free','pro','business']),

  ('Central bank websites',
   null,
   'web', 'scraping', 5, true, 1,
   ARRAY['politics-policy','macro-commodities'],
   'Primary source for monetary policy and exchange-rate announcements.',
   'Central bank communications, rate decisions and reserve data.',
   ARRAY['free','pro','business']),

  ('Ministry of Finance / Economy websites',
   null,
   'web', 'scraping', 5, true, 1,
   ARRAY['politics-policy','regional-business-events'],
   'Primary source for official economic policy actions and fiscal releases.',
   'Budgets, fiscal policy, reforms, subsidies and trade measures.',
   ARRAY['free','pro','business']),

  ('National statistics offices',
   null,
   'web', 'scraping', 5, true, 1,
   ARRAY['macro-commodities','agriculture-risk','logistics'],
   'Primary official source for CPI, GDP, trade and sector indicators.',
   'Country NSO data: CPI, GDP, labor, trade, population, sector indicators.',
   ARRAY['free','pro','business']),

-- Tier 2 — Analyses internationales structurées
  ('OECD-FAO Agricultural Outlook',
   'https://www.oecd-ilibrary.org/agriculture-and-food/oecd-fao-agricultural-outlook_agr_outlook-en',
   'web', 'scraping', 4, true, 2,
   ARRAY['agriculture-risk'],
   'Forward-looking analysis built with country and commodity expertise.',
   'Structured agricultural outlooks and commodity projections.',
   ARRAY['pro','business']),

  ('USDA Economic Research Service',
   'https://www.ers.usda.gov',
   'web', 'scraping', 4, true, 2,
   ARRAY['agriculture-risk','macro-commodities'],
   'High-quality analytical datasets and long-run agricultural projections.',
   'USDA baselines, commodity projections, farm economics and exchange-rate links.',
   ARRAY['pro','business']),

  ('OECD iLibrary',
   'https://www.oecd-ilibrary.org',
   'web', 'api', 4, true, 2,
   ARRAY['politics-policy','macro-commodities','logistics','climate'],
   'Multilateral source for structured data and policy analysis.',
   'OECD policy, trade, energy, macro, transport and environment data.',
   ARRAY['pro','business']),

  ('Eurostat',
   'https://ec.europa.eu/eurostat',
   'web', 'api', 4, true, 2,
   ARRAY['macro-commodities','logistics','agriculture-risk'],
   'Official statistical source for EU data across multiple sectors.',
   'EU trade, transport, economy and agriculture statistics.',
   ARRAY['pro','business']),

  ('IEA — International Energy Agency',
   'https://www.iea.org',
   'web', 'scraping', 4, true, 2,
   ARRAY['climate','macro-commodities'],
   'Widely trusted for energy market and policy intelligence.',
   'Energy transition, supply shocks and climate-adjacent market effects.',
   ARRAY['pro','business']),

  ('International Transport Forum',
   'https://www.itf-oecd.org',
   'web', 'scraping', 4, true, 2,
   ARRAY['logistics'],
   'Recognised transport policy body connected to OECD data ecosystem.',
   'Transport and logistics policy, infrastructure trends.',
   ARRAY['pro','business']),

  ('UN Comtrade',
   'https://comtradeplus.un.org',
   'web', 'api', 4, true, 2,
   ARRAY['logistics','macro-commodities','agriculture-risk'],
   'Standard international trade database for import/export analysis.',
   'Trade flows, import/export analysis by country and commodity.',
   ARRAY['pro','business']),

-- Tier 3 — Intelligence commerciale spécialisée
  ('Argus Media',
   'https://www.argusmedia.com',
   'web', 'scraping', 3, true, 3,
   ARRAY['macro-commodities'],
   'Specialist commodity publisher with strong price-discovery reputation.',
   'Energy, fertilizers, metals and commodity intelligence.',
   ARRAY['business']),

  ('FiscalNote',
   'https://fiscalnote.com',
   'web', 'scraping', 3, true, 3,
   ARRAY['politics-policy'],
   'Useful specialist source for policy tracking and regulatory developments.',
   'Policy and regulatory monitoring at country and regional level.',
   ARRAY['business']),

  ('ISI Markets',
   'https://www.isimarkets.com',
   'web', 'scraping', 3, true, 3,
   ARRAY['regional-business-events','macro-commodities'],
   'Specialist emerging-markets information provider for frontier markets.',
   'Emerging markets intelligence, debt, country risk, sector developments.',
   ARRAY['business'])

on conflict (name) do update set
  forecast_tier          = excluded.forecast_tier,
  forecast_channel_slugs = excluded.forecast_channel_slugs,
  forecast_why           = excluded.forecast_why,
  url                    = coalesce(excluded.url, sources.url),
  reliability_score      = excluded.reliability_score,
  is_active              = excluded.is_active;
