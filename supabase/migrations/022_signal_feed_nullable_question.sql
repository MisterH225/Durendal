-- 022: Rendre question_id nullable dans forecast_signal_feed
--
-- Les signaux de type 'news' ne sont liés à aucune question spécifique.
-- Ils sont générés de façon informationnelle par canal/région.
-- La contrainte NOT NULL sur question_id empêchait leur insertion.

do $$ begin
  alter table forecast_signal_feed
    alter column question_id drop not null;
exception when others then null;
end $$;
