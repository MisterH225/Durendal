-- 019_sources_forecast_columns.sql
-- Étend la table sources existante pour couvrir les sources du module Forecast

do $$ begin
  alter table sources add column forecast_tier int check (forecast_tier in (1,2,3));
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

-- ── Helper : upsert par nom ──────────────────────────────────────────────────
-- Chaque bloc insère si la source n'existe pas encore, sinon met à jour les champs forecast.

-- ── Tier 1 : Sources primaires officielles ───────────────────────────────────

do $$ begin
  if not exists (select 1 from sources where name = 'World Bank Open Data') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('World Bank Open Data','https://data.worldbank.org','web','api',5,true,1,
            ARRAY['macro-commodities','agriculture-risk','regional-business-events'],
            'Global institution with standardized country-level data and long historical coverage.',
            'Macroeconomic, development, trade and country-level indicators.',
            ARRAY['free','pro','business']);
  else
    update sources set
      forecast_tier          = 1,
      forecast_channel_slugs = ARRAY['macro-commodities','agriculture-risk','regional-business-events'],
      forecast_why           = 'Global institution with standardized country-level data and long historical coverage.'
    where name = 'World Bank Open Data';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'IMF Data') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('IMF Data','https://www.imf.org/en/Data','web','api',5,true,1,
            ARRAY['macro-commodities','politics-policy','climate'],
            'Timely macroeconomic datasets and country surveillance reports.',
            'IMF country surveillance, inflation, FX, fiscal and balance-of-payments data.',
            ARRAY['free','pro','business']);
  else
    update sources set
      forecast_tier=1,
      forecast_channel_slugs=ARRAY['macro-commodities','politics-policy','climate'],
      forecast_why='Timely macroeconomic datasets and country surveillance reports.'
    where name='IMF Data';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'FAOSTAT') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('FAOSTAT','https://www.fao.org/faostat','web','api',5,true,1,
            ARRAY['agriculture-risk'],
            'Core international agriculture database with broad country coverage.',
            'FAO agriculture, crops, food systems, production and trade data.',
            ARRAY['free','pro','business']);
  else
    update sources set forecast_tier=1,
      forecast_channel_slugs=ARRAY['agriculture-risk'],
      forecast_why='Core international agriculture database with broad country coverage.'
    where name='FAOSTAT';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Election Commission websites') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Election Commission websites',null,'web','scraping',5,true,1,
            ARRAY['politics-policy'],
            'Primary source for legally authoritative election outcomes and dates.',
            'Country-specific election commission websites for official results.',
            ARRAY['free','pro','business']);
  else
    update sources set forecast_tier=1,
      forecast_channel_slugs=ARRAY['politics-policy'],
      forecast_why='Primary source for legally authoritative election outcomes and dates.'
    where name='Election Commission websites';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Central bank websites') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Central bank websites',null,'web','scraping',5,true,1,
            ARRAY['politics-policy','macro-commodities'],
            'Primary source for monetary policy and exchange-rate announcements.',
            'Central bank communications, rate decisions and reserve data.',
            ARRAY['free','pro','business']);
  else
    update sources set forecast_tier=1,
      forecast_channel_slugs=ARRAY['politics-policy','macro-commodities'],
      forecast_why='Primary source for monetary policy and exchange-rate announcements.'
    where name='Central bank websites';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Ministry of Finance / Economy websites') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Ministry of Finance / Economy websites',null,'web','scraping',5,true,1,
            ARRAY['politics-policy','regional-business-events'],
            'Primary source for official economic policy actions and fiscal releases.',
            'Budgets, fiscal policy, reforms, subsidies and trade measures.',
            ARRAY['free','pro','business']);
  else
    update sources set forecast_tier=1,
      forecast_channel_slugs=ARRAY['politics-policy','regional-business-events'],
      forecast_why='Primary source for official economic policy actions and fiscal releases.'
    where name='Ministry of Finance / Economy websites';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'National statistics offices') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('National statistics offices',null,'web','scraping',5,true,1,
            ARRAY['macro-commodities','agriculture-risk','logistics'],
            'Primary official source for CPI, GDP, trade and sector indicators.',
            'Country NSO data: CPI, GDP, labor, trade, population, sector indicators.',
            ARRAY['free','pro','business']);
  else
    update sources set forecast_tier=1,
      forecast_channel_slugs=ARRAY['macro-commodities','agriculture-risk','logistics'],
      forecast_why='Primary official source for CPI, GDP, trade and sector indicators.'
    where name='National statistics offices';
  end if;
end $$;

-- ── Tier 2 : Analyses internationales structurées ────────────────────────────

do $$ begin
  if not exists (select 1 from sources where name = 'OECD-FAO Agricultural Outlook') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('OECD-FAO Agricultural Outlook',
            'https://www.oecd-ilibrary.org/agriculture-and-food/oecd-fao-agricultural-outlook_agr_outlook-en',
            'web','scraping',4,true,2,
            ARRAY['agriculture-risk'],
            'Forward-looking analysis built with country and commodity expertise.',
            'Structured agricultural outlooks and commodity projections.',
            ARRAY['pro','business']);
  else
    update sources set forecast_tier=2,
      forecast_channel_slugs=ARRAY['agriculture-risk'],
      forecast_why='Forward-looking analysis built with country and commodity expertise.'
    where name='OECD-FAO Agricultural Outlook';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'USDA Economic Research Service') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('USDA Economic Research Service','https://www.ers.usda.gov',
            'web','scraping',4,true,2,
            ARRAY['agriculture-risk','macro-commodities'],
            'High-quality analytical datasets and long-run agricultural projections.',
            'USDA baselines, commodity projections, farm economics and exchange-rate links.',
            ARRAY['pro','business']);
  else
    update sources set forecast_tier=2,
      forecast_channel_slugs=ARRAY['agriculture-risk','macro-commodities'],
      forecast_why='High-quality analytical datasets and long-run agricultural projections.'
    where name='USDA Economic Research Service';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'OECD iLibrary') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('OECD iLibrary','https://www.oecd-ilibrary.org',
            'web','api',4,true,2,
            ARRAY['politics-policy','macro-commodities','logistics','climate'],
            'Multilateral source for structured data and policy analysis.',
            'OECD policy, trade, energy, macro, transport and environment data.',
            ARRAY['pro','business']);
  else
    update sources set forecast_tier=2,
      forecast_channel_slugs=ARRAY['politics-policy','macro-commodities','logistics','climate'],
      forecast_why='Multilateral source for structured data and policy analysis.'
    where name='OECD iLibrary';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Eurostat') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Eurostat','https://ec.europa.eu/eurostat',
            'web','api',4,true,2,
            ARRAY['macro-commodities','logistics','agriculture-risk'],
            'Official statistical source for EU data across multiple sectors.',
            'EU trade, transport, economy and agriculture statistics.',
            ARRAY['pro','business']);
  else
    update sources set forecast_tier=2,
      forecast_channel_slugs=ARRAY['macro-commodities','logistics','agriculture-risk'],
      forecast_why='Official statistical source for EU data across multiple sectors.'
    where name='Eurostat';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'IEA — International Energy Agency') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('IEA — International Energy Agency','https://www.iea.org',
            'web','scraping',4,true,2,
            ARRAY['climate','macro-commodities'],
            'Widely trusted for energy market and policy intelligence.',
            'Energy transition, supply shocks and climate-adjacent market effects.',
            ARRAY['pro','business']);
  else
    update sources set forecast_tier=2,
      forecast_channel_slugs=ARRAY['climate','macro-commodities'],
      forecast_why='Widely trusted for energy market and policy intelligence.'
    where name='IEA — International Energy Agency';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'International Transport Forum') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('International Transport Forum','https://www.itf-oecd.org',
            'web','scraping',4,true,2,
            ARRAY['logistics'],
            'Recognised transport policy body connected to OECD data ecosystem.',
            'Transport and logistics policy, infrastructure trends.',
            ARRAY['pro','business']);
  else
    update sources set forecast_tier=2,
      forecast_channel_slugs=ARRAY['logistics'],
      forecast_why='Recognised transport policy body connected to OECD data ecosystem.'
    where name='International Transport Forum';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'UN Comtrade') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('UN Comtrade','https://comtradeplus.un.org',
            'web','api',4,true,2,
            ARRAY['logistics','macro-commodities','agriculture-risk'],
            'Standard international trade database for import/export analysis.',
            'Trade flows, import/export analysis by country and commodity.',
            ARRAY['pro','business']);
  else
    update sources set forecast_tier=2,
      forecast_channel_slugs=ARRAY['logistics','macro-commodities','agriculture-risk'],
      forecast_why='Standard international trade database for import/export analysis.'
    where name='UN Comtrade';
  end if;
end $$;

-- ── Tier 3 : Intelligence commerciale spécialisée ────────────────────────────

do $$ begin
  if not exists (select 1 from sources where name = 'Argus Media') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Argus Media','https://www.argusmedia.com',
            'web','scraping',3,true,3,
            ARRAY['macro-commodities'],
            'Specialist commodity publisher with strong price-discovery reputation.',
            'Energy, fertilizers, metals and commodity intelligence.',
            ARRAY['business']);
  else
    update sources set forecast_tier=3,
      forecast_channel_slugs=ARRAY['macro-commodities'],
      forecast_why='Specialist commodity publisher with strong price-discovery reputation.'
    where name='Argus Media';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'FiscalNote') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('FiscalNote','https://fiscalnote.com',
            'web','scraping',3,true,3,
            ARRAY['politics-policy'],
            'Useful specialist source for policy tracking and regulatory developments.',
            'Policy and regulatory monitoring at country and regional level.',
            ARRAY['business']);
  else
    update sources set forecast_tier=3,
      forecast_channel_slugs=ARRAY['politics-policy'],
      forecast_why='Useful specialist source for policy tracking and regulatory developments.'
    where name='FiscalNote';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'ISI Markets') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('ISI Markets','https://www.isimarkets.com',
            'web','scraping',3,true,3,
            ARRAY['regional-business-events','macro-commodities'],
            'Specialist emerging-markets information provider for frontier markets.',
            'Emerging markets intelligence, debt, country risk, sector developments.',
            ARRAY['business']);
  else
    update sources set forecast_tier=3,
      forecast_channel_slugs=ARRAY['regional-business-events','macro-commodities'],
      forecast_why='Specialist emerging-markets information provider for frontier markets.'
    where name='ISI Markets';
  end if;
end $$;
