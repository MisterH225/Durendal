-- 023: Ajouter name_fr et name_en à forecast_channels pour l'i18n

do $$ begin
  alter table forecast_channels add column name_fr text;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table forecast_channels add column name_en text;
exception when duplicate_column then null;
end $$;

-- Peupler les traductions pour les canaux existants
update forecast_channels set
  name_fr = case slug
    when 'macro-commodities'        then 'Macro & Matières premières'
    when 'politics-policy'          then 'Politique & Réglementation'
    when 'tech-ai'                  then 'Tech & IA'
    when 'agriculture-risk'         then 'Risque Agricole'
    when 'climate'                  then 'Climat'
    when 'logistics'                then 'Logistique'
    when 'regional-business-events' then 'Événements Économiques Régionaux'
    else name
  end,
  name_en = case slug
    when 'macro-commodities'        then 'Macro & Commodities'
    when 'politics-policy'          then 'Politics & Policy'
    when 'tech-ai'                  then 'Tech & AI'
    when 'agriculture-risk'         then 'Agriculture Risk'
    when 'climate'                  then 'Climate'
    when 'logistics'                then 'Logistics'
    when 'regional-business-events' then 'Regional Business Events'
    else name
  end
where name_fr is null or name_en is null;
