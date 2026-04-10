-- 018_forecast_channels_i18n.sql
-- Ajout de colonnes de traduction sur forecast_channels
-- Approche multilingue légère : name (EN, référence) + name_fr + name_en

do $$ begin
  alter table forecast_channels add column name_fr text;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table forecast_channels add column name_en text;
exception when duplicate_column then null;
end $$;

-- Renseigner les traductions françaises
update forecast_channels set
  name_fr = 'Macro & Matières premières',
  name_en = 'Macro & Commodities'
where slug = 'macro-commodities';

update forecast_channels set
  name_fr = 'Politique & Réglementation',
  name_en = 'Politics & Policy'
where slug = 'politics-policy';

update forecast_channels set
  name_fr = 'Tech & IA',
  name_en = 'Tech & AI'
where slug = 'tech-ai';

update forecast_channels set
  name_fr = 'Risque agricole',
  name_en = 'Agriculture Risk'
where slug = 'agriculture-risk';

update forecast_channels set
  name_fr = 'Climat',
  name_en = 'Climate'
where slug = 'climate';

update forecast_channels set
  name_fr = 'Logistique',
  name_en = 'Logistics'
where slug = 'logistics';

update forecast_channels set
  name_fr = 'Événements régionaux',
  name_en = 'Regional Business Events'
where slug = 'regional-business-events';
