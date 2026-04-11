-- Ajouter image_url aux questions forecast (illustration provenant d'articles)
do $$ begin
  alter table forecast_questions add column image_url text;
exception when duplicate_column then null;
end $$;
