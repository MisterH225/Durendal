-- 020_news_sources.sql
-- 1. Étend les contraintes CHECK de forecast_signal_feed pour accepter le type 'news'
--    et les niveaux de sévérité 'high'/'medium'/'low' (normalisés depuis info/warning/critical)
-- 2. Ajoute les sources médias dans la bibliothèque de sources

-- ── Mise à jour de la contrainte signal_type ─────────────────────────────────
do $$ begin
  -- Drop old constraint (nom généré par Postgres : forecast_signal_feed_signal_type_check)
  alter table forecast_signal_feed drop constraint if exists forecast_signal_feed_signal_type_check;
  -- Re-create with extended types
  alter table forecast_signal_feed
    add constraint forecast_signal_feed_signal_type_check
    check (signal_type in (
      'probability_shift','crowd_ai_disagreement','ai_brief_update','resolution','news'
    ));
exception when others then null; -- si la table n'existe pas encore, on ignore
end $$;

-- ── Mise à jour de la contrainte severity ────────────────────────────────────
do $$ begin
  alter table forecast_signal_feed drop constraint if exists forecast_signal_feed_severity_check;
  alter table forecast_signal_feed
    add constraint forecast_signal_feed_severity_check
    check (severity in ('info','warning','critical','high','medium','low'));
exception when others then null;
end $$;

-- ── Colonne pour marquer les sources comme sources d'actualité forecast ───────
do $$ begin
  alter table sources add column is_news_source boolean default false;
exception when duplicate_column then null;
end $$;

-- ── Helper macro ─────────────────────────────────────────────────────────────
-- Chaque bloc : insert si absent, update sinon

do $$ begin
  if not exists (select 1 from sources where name = 'Reuters') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Reuters','https://www.reuters.com','web','rss',5,true,true,2,
            ARRAY['macro-commodities','politics-policy','agriculture-risk','logistics','climate','tech-ai','regional-business-events'],
            'Global wire agency with real-time coverage across all forecast categories.',
            'International news wire — finance, politics, commodities, trade.',
            ARRAY['free','pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=2,
      forecast_channel_slugs=ARRAY['macro-commodities','politics-policy','agriculture-risk','logistics','climate','tech-ai','regional-business-events'],
      forecast_why='Global wire agency with real-time coverage across all forecast categories.'
    where name='Reuters';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Bloomberg') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Bloomberg','https://www.bloomberg.com','web','rss',5,true,true,2,
            ARRAY['macro-commodities','politics-policy','tech-ai'],
            'Leading financial news and data — markets, economics, technology.',
            'Bloomberg financial journalism and markets intelligence.',
            ARRAY['pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=2,
      forecast_channel_slugs=ARRAY['macro-commodities','politics-policy','tech-ai'],
      forecast_why='Leading financial news and data — markets, economics, technology.'
    where name='Bloomberg';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Financial Times') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Financial Times','https://www.ft.com','web','rss',5,true,true,2,
            ARRAY['macro-commodities','politics-policy','tech-ai','regional-business-events'],
            'Premium financial journalism with deep macro and policy analysis.',
            'FT — economics, finance, global politics, business.',
            ARRAY['pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=2,
      forecast_channel_slugs=ARRAY['macro-commodities','politics-policy','tech-ai','regional-business-events'],
      forecast_why='Premium financial journalism with deep macro and policy analysis.'
    where name='Financial Times';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'BBC World News') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('BBC World News','https://www.bbc.com/news/world','web','rss',5,true,true,2,
            ARRAY['politics-policy','regional-business-events','climate','macro-commodities'],
            'Trusted global broadcaster with strong Africa and emerging market coverage.',
            'BBC international news — politics, Africa, world affairs.',
            ARRAY['free','pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=2,
      forecast_channel_slugs=ARRAY['politics-policy','regional-business-events','climate','macro-commodities'],
      forecast_why='Trusted global broadcaster with strong Africa and emerging market coverage.'
    where name='BBC World News';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Al Jazeera') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Al Jazeera','https://www.aljazeera.com','web','rss',4,true,true,2,
            ARRAY['politics-policy','regional-business-events','climate'],
            'Leading perspective on Global South, Africa and Middle East developments.',
            'Al Jazeera — Middle East, Africa, geopolitics, development.',
            ARRAY['free','pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=2,
      forecast_channel_slugs=ARRAY['politics-policy','regional-business-events','climate'],
      forecast_why='Leading perspective on Global South, Africa and Middle East developments.'
    where name='Al Jazeera';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'France 24') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('France 24','https://www.france24.com','web','rss',4,true,true,2,
            ARRAY['politics-policy','regional-business-events','macro-commodities'],
            'French international broadcaster with strong Francophone Africa coverage.',
            'France24 — Africa, Francophone world, politics, economics.',
            ARRAY['free','pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=2,
      forecast_channel_slugs=ARRAY['politics-policy','regional-business-events','macro-commodities'],
      forecast_why='French international broadcaster with strong Francophone Africa coverage.'
    where name='France 24';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'RFI') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('RFI','https://www.rfi.fr','web','rss',4,true,true,2,
            ARRAY['politics-policy','regional-business-events','agriculture-risk'],
            'Radio France Internationale — primary source for Francophone Africa news.',
            'RFI — Afrique francophone, politique, économie, agriculture.',
            ARRAY['free','pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=2,
      forecast_channel_slugs=ARRAY['politics-policy','regional-business-events','agriculture-risk'],
      forecast_why='Radio France Internationale — primary source for Francophone Africa news.'
    where name='RFI';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Euronews') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Euronews','https://www.euronews.com','web','rss',4,true,true,3,
            ARRAY['politics-policy','macro-commodities','climate'],
            'Pan-European multilingual broadcaster covering EU policy and global markets.',
            'Euronews — Europe, policy, economy, climate.',
            ARRAY['free','pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=3,
      forecast_channel_slugs=ARRAY['politics-policy','macro-commodities','climate'],
      forecast_why='Pan-European multilingual broadcaster covering EU policy and global markets.'
    where name='Euronews';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'CNBC') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('CNBC','https://www.cnbc.com','web','rss',4,true,true,3,
            ARRAY['macro-commodities','tech-ai'],
            'US financial television and web — markets, tech earnings, Fed decisions.',
            'CNBC — US markets, tech sector, macroeconomics.',
            ARRAY['pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=3,
      forecast_channel_slugs=ARRAY['macro-commodities','tech-ai'],
      forecast_why='US financial television and web — markets, tech earnings, Fed decisions.'
    where name='CNBC';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'CNN International') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('CNN International','https://edition.cnn.com','web','rss',3,true,true,3,
            ARRAY['politics-policy','regional-business-events'],
            'US international news with broad geopolitical coverage.',
            'CNN — US politics, world affairs, breaking news.',
            ARRAY['free','pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=3,
      forecast_channel_slugs=ARRAY['politics-policy','regional-business-events'],
      forecast_why='US international news with broad geopolitical coverage.'
    where name='CNN International';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Sky News') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Sky News','https://news.sky.com','web','rss',3,true,true,3,
            ARRAY['politics-policy','macro-commodities'],
            'UK broadcaster with live coverage of political and financial events.',
            'Sky News — UK politics, finance, world news.',
            ARRAY['free','pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=3,
      forecast_channel_slugs=ARRAY['politics-policy','macro-commodities'],
      forecast_why='UK broadcaster with live coverage of political and financial events.'
    where name='Sky News';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'BFMTV') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('BFMTV','https://www.bfmtv.com','web','rss',3,true,true,3,
            ARRAY['politics-policy','macro-commodities'],
            'French live news channel covering markets, politics and international news.',
            'BFMTV — actualité française, marchés, politique internationale.',
            ARRAY['free','pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=3,
      forecast_channel_slugs=ARRAY['politics-policy','macro-commodities'],
      forecast_why='French live news channel covering markets, politics and international news.'
    where name='BFMTV';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from sources where name = 'Perplexity') then
    insert into sources (name, url, type, scraping_method, reliability_score, is_active,
                         is_news_source, forecast_tier, forecast_channel_slugs, forecast_why,
                         ai_description, plans_access)
    values ('Perplexity','https://www.perplexity.ai','web','api',4,true,true,3,
            ARRAY['macro-commodities','politics-policy','tech-ai','agriculture-risk','climate','logistics','regional-business-events'],
            'AI-powered search aggregating real-time web results across all categories.',
            'Perplexity Sonar — real-time web search and synthesis.',
            ARRAY['pro','business']);
  else
    update sources set is_news_source=true, forecast_tier=3,
      forecast_channel_slugs=ARRAY['macro-commodities','politics-policy','tech-ai','agriculture-risk','climate','logistics','regional-business-events'],
      forecast_why='AI-powered search aggregating real-time web results across all categories.'
    where name='Perplexity';
  end if;
end $$;
