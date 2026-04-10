-- 021_african_gov_sources.sql
-- Sources officielles africaines : présidences, ministères des finances,
-- ministères de la défense, primatures/chefs de gouvernement.
-- Ces sources de Tier 1 enrichissent le contexte du job news-signal
-- et constituent la référence de premier rang pour les canaux
-- politics-policy, macro-commodities, regional-business-events.

-- ── Nouvelle colonne ──────────────────────────────────────────────────────────
do $$ begin
  alter table sources add column is_gov_source boolean default false;
exception when duplicate_column then null;
end $$;

-- ── Fonction helper : insert si absent ───────────────────────────────────────
create or replace function _upsert_gov_source(
  p_name         text,
  p_url          text,
  p_channels     text[],
  p_why          text,
  p_reliability  int default 5
) returns void language plpgsql as $$
begin
  if not exists (select 1 from sources where name = p_name) then
    insert into sources (
      name, url, type, scraping_method, reliability_score, is_active,
      is_gov_source, forecast_tier, forecast_channel_slugs, forecast_why,
      ai_description, plans_access
    ) values (
      p_name, p_url, 'web', 'scraping', p_reliability, true,
      true, 1, p_channels, p_why,
      p_why,
      ARRAY['free','pro','business']
    );
  else
    update sources set
      is_gov_source = true,
      forecast_tier = 1,
      forecast_channel_slugs = p_channels,
      forecast_why = p_why
    where name = p_name;
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- AFRIQUE DU NORD
-- ════════════════════════════════════════════════════════════════════════════

-- MAROC
select _upsert_gov_source('Présidence du Gouvernement - Maroc','https://www.pm.gov.ma',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Chef du gouvernement marocain — politique économique, réformes, décrets.');
select _upsert_gov_source('Ministère des Finances - Maroc','https://www.finances.gov.ma',
  ARRAY['macro-commodities','regional-business-events'],
  'Politique budgétaire, fiscalité, dette publique, projets de loi de finances du Maroc.');
select _upsert_gov_source('Forces Armées Royales - Maroc','https://www.fam.ma',
  ARRAY['politics-policy'],
  'Défense nationale, sécurité régionale, coopération militaire du Maroc.');

-- ALGÉRIE
select _upsert_gov_source('Présidence de la République - Algérie','https://www.el-mouradia.dz',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence algérienne — décisions stratégiques, politique pétrolière et gazière.');
select _upsert_gov_source('Services du Premier Ministre - Algérie','https://www.premier-ministre.gov.dz',
  ARRAY['politics-policy','macro-commodities'],
  'Primature algérienne — plans de développement, coordination interministérielle.');
select _upsert_gov_source('Ministère des Finances - Algérie','https://www.mf.gov.dz',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances publiques, budget, fiscalité, douanes algériennes.');
select _upsert_gov_source('Ministère de la Défense Nationale - Algérie','https://www.mdn.gov.dz',
  ARRAY['politics-policy'],
  'Défense nationale algérienne, sécurité du Sahel, coopération régionale.');

-- TUNISIE
select _upsert_gov_source('Présidence de la République - Tunisie','https://www.presidencetunisie.tn',
  ARRAY['politics-policy','regional-business-events'],
  'Présidence tunisienne — réformes constitutionnelles, politique étrangère.');
select _upsert_gov_source('Ministère des Finances - Tunisie','https://www.finances.gov.tn',
  ARRAY['macro-commodities','regional-business-events'],
  'Budget de l''État, réformes fiscales, dette souveraine tunisienne.');
select _upsert_gov_source('Ministère de la Défense - Tunisie','https://www.defense.tn',
  ARRAY['politics-policy'],
  'Défense nationale tunisienne, sécurité aux frontières.');

-- ÉGYPTE
select _upsert_gov_source('Présidence de la République - Égypte','https://www.presidency.eg',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence égyptienne — décisions stratégiques, Canal de Suez, investissements.');
select _upsert_gov_source('Cabinet du Premier Ministre - Égypte','https://www.cabinet.gov.eg',
  ARRAY['politics-policy','macro-commodities'],
  'Gouvernement égyptien — réformes économiques, plans sectoriels, Corridor de Suez.');
select _upsert_gov_source('Ministère des Finances - Égypte','https://www.mof.gov.eg',
  ARRAY['macro-commodities','regional-business-events'],
  'Politique budgétaire, programme FMI, dette publique et réformes fiscales égyptiennes.');
select _upsert_gov_source('Ministère de la Défense - Égypte','https://www.mod.gov.eg',
  ARRAY['politics-policy'],
  'Défense nationale égyptienne, sécurité régionale, coopération militaire.');

-- ════════════════════════════════════════════════════════════════════════════
-- AFRIQUE DE L'OUEST
-- ════════════════════════════════════════════════════════════════════════════

-- SÉNÉGAL
select _upsert_gov_source('Présidence de la République - Sénégal','https://www.presidence.sn',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence sénégalaise — Vision Sénégal 2050, pétrole/gaz offshore, politique régionale CEDEAO.');
select _upsert_gov_source('Primature - Sénégal','https://www.primature.gouv.sn',
  ARRAY['politics-policy','regional-business-events'],
  'Premier Ministre sénégalais — coordination des politiques publiques, plans sectoriels.');
select _upsert_gov_source('Ministère des Finances - Sénégal','https://www.finances.gouv.sn',
  ARRAY['macro-commodities','regional-business-events'],
  'Budget, fiscalité, dette publique et réformes financières du Sénégal.');
select _upsert_gov_source('Ministère des Forces Armées - Sénégal','https://www.defense.gouv.sn',
  ARRAY['politics-policy'],
  'Défense nationale sénégalaise, sécurité sous-régionale, CEDEAO.');

-- CÔTE D'IVOIRE
select _upsert_gov_source('Présidence de la République - Côte d''Ivoire','https://www.presidence.ci',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence ivoirienne — 1ère économie d''Afrique de l''Ouest, cacao, pétrole, IDE.');
select _upsert_gov_source('Premier Ministre - Côte d''Ivoire','https://www.premier-ministre.gouv.ci',
  ARRAY['politics-policy','macro-commodities'],
  'Primature ivoirienne — plan de développement national, projets d''infrastructure.');
select _upsert_gov_source('Ministère du Budget - Côte d''Ivoire','https://www.budget.gouv.ci',
  ARRAY['macro-commodities','regional-business-events'],
  'Budget et finances publiques ivoiriennes.');

-- GHANA
select _upsert_gov_source('Office of the President - Ghana','https://www.presidency.gov.gh',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence ghanéenne — économie minière (or, bauxite), politiques monétaires, démocratie stable.');
select _upsert_gov_source('Ministry of Finance - Ghana','https://www.mofep.gov.gh',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances publiques ghanéennes — FMI, dette, réformes fiscales, recettes pétrolières.');
select _upsert_gov_source('Ministry of Defence - Ghana','https://www.mod.gov.gh',
  ARRAY['politics-policy'],
  'Défense nationale ghanéenne, opérations de maintien de la paix ONU.');

-- NIGERIA
select _upsert_gov_source('State House - Nigeria','https://www.statehouse.gov.ng',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence nigériane — 1ère économie d''Afrique, pétrole (OPEC+), politique régionale.');
select _upsert_gov_source('Federal Ministry of Finance - Nigeria','https://www.finance.gov.ng',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances fédérales nigérianes — recettes pétrolières, budget, réformes fiscales, FIRS.');
select _upsert_gov_source('Federal Ministry of Defence - Nigeria','https://www.mod.gov.ng',
  ARRAY['politics-policy'],
  'Défense fédérale nigériane, lutte contre Boko Haram, sécurité dans le Golfe de Guinée.');

-- MALI
select _upsert_gov_source('Présidence de la République - Mali','https://www.presidence.gov.ml',
  ARRAY['politics-policy','regional-business-events'],
  'Transition politique malienne, or (2e producteur africain), sécurité Sahel, Alliance des États du Sahel.');
select _upsert_gov_source('Ministère de l''Économie - Mali','https://www.finances.gov.ml',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances publiques maliennes, budget de transition, secteur minier aurifère.');

-- BURKINA FASO
select _upsert_gov_source('Gouvernement du Burkina Faso','https://www.gouvernement.bf',
  ARRAY['politics-policy','agriculture-risk'],
  'Gouvernement de transition burkinabè — Alliance des États du Sahel, sécurité alimentaire.');

-- BÉNIN
select _upsert_gov_source('Présidence de la République - Bénin','https://www.presidence.bj',
  ARRAY['politics-policy','regional-business-events'],
  'Présidence béninoise — Plan Bénin Révélé, corridor logistique (port de Cotonou), agriculture.');
select _upsert_gov_source('Ministère des Finances - Bénin','https://www.finances.gouv.bj',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances publiques béninoises, eurobonds, fiscalité et investissements.');

-- TOGO
select _upsert_gov_source('Présidence de la République - Togo','https://www.presidence.tg',
  ARRAY['politics-policy','regional-business-events'],
  'Présidence togolaise — hub logistique régional (port de Lomé), zones économiques spéciales.');
select _upsert_gov_source('Ministère des Finances - Togo','https://www.finances.gouv.tg',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances publiques togolaises, budget, phosphates et exportations.');

-- GUINÉE
select _upsert_gov_source('Présidence - Guinée','https://www.presidentguinee.gov.gn',
  ARRAY['politics-policy','macro-commodities'],
  'Présidence de Guinée — 1ère réserve mondiale de bauxite, secteur minier, transition politique.');

-- MAURITANIE
select _upsert_gov_source('Présidence de la République - Mauritanie','https://www.presidence.mr',
  ARRAY['politics-policy','macro-commodities'],
  'Présidence mauritanienne — développement gazier offshore (GTA), fer de la SNIM, sécurité Sahel.');

-- ════════════════════════════════════════════════════════════════════════════
-- AFRIQUE CENTRALE
-- ════════════════════════════════════════════════════════════════════════════

-- CAMEROUN
select _upsert_gov_source('Présidence de la République - Cameroun','https://www.prc.cm',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence camerounaise — hub économique CEMAC, pétrole, bois, agriculture d''exportation.');
select _upsert_gov_source('Services du Premier Ministre - Cameroun','https://www.spm.gov.cm',
  ARRAY['politics-policy','regional-business-events'],
  'Primature camerounaise — plan de développement, coordination sectorielle.');
select _upsert_gov_source('Ministère des Finances - Cameroun','https://www.minfi.gov.cm',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances publiques camerounaises, budget pétrolier, recettes douanières CEMAC.');
select _upsert_gov_source('Ministère de la Défense - Cameroun','https://www.mindef.gov.cm',
  ARRAY['politics-policy'],
  'Défense nationale camerounaise, lutte contre Boko Haram (Lac Tchad), sécurité régionale.');

-- RDC
select _upsert_gov_source('Présidence de la République - RDC','https://www.presidentrdc.cd',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence congolaise — cobalt (60% mondial), coltan, or, cuivre, est du Congo, SADC.');
select _upsert_gov_source('Primature - RDC','https://www.primature.cd',
  ARRAY['politics-policy','macro-commodities'],
  'Premier Ministre de RDC — coordination économique, partenariats miniers, plan de développement.');

-- GABON
select _upsert_gov_source('Comité pour la Transition et la Restauration - Gabon','https://www.ctri.ga',
  ARRAY['politics-policy','macro-commodities'],
  'Gouvernement de transition gabonais — pétrole, manganèse, bois, OPEC+.');

-- TCHAD
select _upsert_gov_source('Présidence de la République - Tchad','https://www.presidence.td',
  ARRAY['politics-policy','macro-commodities'],
  'Présidence tchadienne — pétrole, sécurité Sahel/Lac Tchad, Alliance des États du Sahel.');

-- CONGO BRAZZAVILLE
select _upsert_gov_source('Présidence de la République - Congo','https://www.presidence.cg',
  ARRAY['politics-policy','macro-commodities'],
  'Présidence congolaise — pétrole (OPEC+), potasse, économie CEMAC.');

-- ════════════════════════════════════════════════════════════════════════════
-- AFRIQUE DE L'EST
-- ════════════════════════════════════════════════════════════════════════════

-- KENYA
select _upsert_gov_source('Office of the President - Kenya','https://www.president.go.ke',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence kényane — hub financier et technologique de l''Afrique de l''Est, obligations vertes.');
select _upsert_gov_source('National Treasury - Kenya','https://www.treasury.go.ke',
  ARRAY['macro-commodities','regional-business-events'],
  'Trésor national kényan — budget, dette souveraine, politique fiscale, eurobonds.');
select _upsert_gov_source('Ministry of Defence - Kenya','https://www.mod.go.ke',
  ARRAY['politics-policy'],
  'Défense nationale kényane, sécurité régionale Afrique de l''Est, lutte contre Al-Shabaab.');

-- ÉTHIOPIE
select _upsert_gov_source('Office of the Prime Minister - Ethiopia','https://www.pmo.gov.et',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'PM éthiopien — 2e plus grande population africaine, corridor de Berbera, GERD (barrage Renaissance).');
select _upsert_gov_source('Ministry of Finance - Ethiopia','https://www.mofec.gov.et',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances publiques éthiopiennes — FMI, restructuration dette, investissements IDE.');
select _upsert_gov_source('Ministry of National Defence - Ethiopia','https://www.mod.gov.et',
  ARRAY['politics-policy'],
  'Défense nationale éthiopienne, sécurité post-Tigray, frontières somaliennes.');

-- RWANDA
select _upsert_gov_source('Office of the President - Rwanda','https://www.presidency.gov.rw',
  ARRAY['politics-policy','regional-business-events','tech-ai'],
  'Présidence rwandaise — hub financier Vision 2050, technologie, stabilité politique, EAC.');
select _upsert_gov_source('MINECOFIN - Rwanda','https://www.minecofin.gov.rw',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances et planification économique du Rwanda — financement du développement, budget.');
select _upsert_gov_source('Ministry of Defence - Rwanda','https://www.mod.gov.rw',
  ARRAY['politics-policy'],
  'Défense rwandaise — forces de maintien de la paix, sécurité régionale, Est-Congo.');

-- TANZANIE
select _upsert_gov_source('State House - Tanzania','https://www.statehouse.go.tz',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence tanzanienne — or, gaz naturel (LNG), port de Dar-es-Salam, EAC.');
select _upsert_gov_source('Ministry of Finance - Tanzania','https://www.mof.go.tz',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances tanzaniennes — budget, investissements pétroliers et gaziers, recettes minières.');

-- OUGANDA
select _upsert_gov_source('State House - Uganda','https://www.statehouse.go.ug',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence ougandaise — pétrole (EACOP), agriculture, sécurité régionale (RDC, Soudan du Sud).');
select _upsert_gov_source('Ministry of Finance - Uganda','https://www.finance.go.ug',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances publiques ougandaises, budget pétrolier, plan de développement national.');

-- DJIBOUTI
select _upsert_gov_source('Présidence de la République - Djibouti','https://www.presidence.dj',
  ARRAY['politics-policy','logistics'],
  'Présidence djiboutienne — hub logistique stratégique (détroit de Bab-el-Mandeb), bases militaires.');

-- ════════════════════════════════════════════════════════════════════════════
-- AFRIQUE AUSTRALE
-- ════════════════════════════════════════════════════════════════════════════

-- AFRIQUE DU SUD
select _upsert_gov_source('The Presidency - South Africa','https://www.presidency.gov.za',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence sud-africaine — 1ère économie industrialisée d''Afrique, BRICS, G20, mines, finance.');
select _upsert_gov_source('National Treasury - South Africa','https://www.treasury.gov.za',
  ARRAY['macro-commodities','regional-business-events'],
  'Trésor national sud-africain — politique budgétaire, dette souveraine, réformes Eskom/Transnet.');
select _upsert_gov_source('Department of Defence - South Africa','https://www.dod.mil.za',
  ARRAY['politics-policy'],
  'Défense nationale sud-africaine, opérations SADC, maintien de la paix continentale.');

-- ANGOLA
select _upsert_gov_source('Casa Civil da Presidência - Angola','https://www.governo.gov.ao',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence angolaise — 2e producteur pétrolier africain, reconstruction post-guerre, SADC.');
select _upsert_gov_source('Ministério das Finanças - Angola','https://www.minfin.gov.ao',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances publiques angolaises — recettes pétrolières, dette FMI, diversification économique.');

-- MOZAMBIQUE
select _upsert_gov_source('Presidência da República - Moçambique','https://www.presidencia.gov.mz',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence mozambicaine — gaz naturel liquéfié (LNG, TotalEnergies), sécurité dans le Cabo Delgado.');
select _upsert_gov_source('Ministério da Economia e Finanças - Moçambique','https://www.mef.gov.mz',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances mozambicaines — recettes gazières et minières, budget national, dette publique.');

-- ZIMBABWE
select _upsert_gov_source('Office of the President and Cabinet - Zimbabwe','https://www.zim.gov.zw',
  ARRAY['politics-policy','macro-commodities'],
  'Gouvernement zimbabwéen — politique agricole (tabac, maïs), mines (platine, lithium), monnaie.');
select _upsert_gov_source('Ministry of Finance - Zimbabwe','https://www.zimtreasury.gov.zw',
  ARRAY['macro-commodities','regional-business-events'],
  'Trésor zimbabwéen — politique monétaire ZiG, restructuration dette, mines de platine.');

-- ZAMBIE
select _upsert_gov_source('State House - Zambia','https://www.statehouse.gov.zm',
  ARRAY['politics-policy','macro-commodities','regional-business-events'],
  'Présidence zambienne — 1er producteur de cuivre africain, restructuration dette FMI/Chine.');
select _upsert_gov_source('Ministry of Finance - Zambia','https://www.mof.gov.zm',
  ARRAY['macro-commodities','regional-business-events'],
  'Finances zambiennes — recettes cuivrières, restructuration dette souveraine, budget.');

-- NAMIBIE
select _upsert_gov_source('Office of the President - Namibia','https://www.op.gov.na',
  ARRAY['politics-policy','macro-commodities'],
  'Présidence namibienne — hydrogène vert, diamants, uranium, côte Atlantique.');

-- MADAGASCAR
select _upsert_gov_source('Présidence de la République - Madagascar','https://www.presidence.gov.mg',
  ARRAY['politics-policy','agriculture-risk','regional-business-events'],
  'Présidence malgache — vanille, nickel/cobalt, insécurité alimentaire, changement climatique.');

-- ÎLE MAURICE
select _upsert_gov_source('Prime Minister''s Office - Mauritius','https://www.pmo.govmu.org',
  ARRAY['politics-policy','regional-business-events','macro-commodities'],
  'PM mauricien — hub financier offshore de l''océan Indien, tourisme, fintech.');

-- ── Suppression de la fonction helper ────────────────────────────────────────
drop function if exists _upsert_gov_source(text,text,text[],text,int);
