// ── Types ────────────────────────────────────────────────────────────────────

export interface SourceArticle {
  id: string
  title: string
  publisher: string
  publisherUrl?: string
  author?: string
  publishedAt?: string
  canonicalUrl: string
  imageUrl?: string
  excerpt?: string
  body?: string
  category?: string
  regionTags?: string[]
  entityTags?: string[]
}

export interface RegionalImplication {
  region: string
  implications: string[]
}

export interface SectorExposure {
  sector: string
  riskLevel: 'low' | 'medium' | 'high'
  notes: string[]
}

export interface RelatedForecast {
  id: string
  title: string
  crowdProbability: number
  aiProbability: number
  blendedProbability: number
}

export interface ArticleImplicationAnalysis {
  articleId: string
  executiveTakeaway: string
  whyThisMatters: string[]
  immediateImplications: string[]
  secondOrderEffects: string[]
  regionalImplications: RegionalImplication[]
  sectorExposure: SectorExposure[]
  whatToWatch: string[]
  confidenceNote?: string
  relatedForecasts: RelatedForecast[]
}

// ── Mock Articles ────────────────────────────────────────────────────────────

export const MOCK_ARTICLES: SourceArticle[] = [
  {
    id: 'iran-strait-hormuz-2026',
    title: 'US-Iran Tensions Escalate: Naval Standoff in Strait of Hormuz Threatens Global Oil Flows',
    publisher: 'Reuters',
    publisherUrl: 'https://www.reuters.com',
    author: 'Jonathan Landay, Parisa Hafezi',
    publishedAt: '2026-04-09T14:30:00Z',
    canonicalUrl: 'https://www.reuters.com/world/middle-east/us-iran-naval-standoff-hormuz-2026-04-09',
    imageUrl: 'https://images.unsplash.com/photo-1518709766631-a6a7f45921c3?w=1200&h=630&fit=crop',
    excerpt: 'A dangerous escalation between US and Iranian naval forces in the Strait of Hormuz has raised fears of a blockade that could disrupt 21% of global oil transit, sending Brent crude above $98 per barrel.',
    body: `A dangerous escalation between US and Iranian naval forces in the Strait of Hormuz has raised fears of a potential blockade that could disrupt roughly 21% of global petroleum transit.

Brent crude surged above $98 per barrel in early trading Wednesday after Iran's Islamic Revolutionary Guard Corps (IRGC) conducted what it called "defensive naval exercises" within 500 meters of a US carrier strike group transiting the strait.

The Pentagon confirmed that the USS Eisenhower carrier group was forced to alter course after multiple fast attack craft approached at high speed. "We will protect freedom of navigation," said Pentagon spokesperson Patrick Ryder, while emphasizing that the US "does not seek conflict."

Iran's Foreign Ministry described the exercises as "routine and within our sovereign maritime rights," but regional analysts viewed the timing — coinciding with renewed nuclear talks deadlock — as a deliberate signal.

The Strait of Hormuz, a 21-mile-wide chokepoint between Iran and Oman, handles approximately 17-18 million barrels of crude oil per day, roughly one-fifth of global consumption. Any sustained disruption would send shockwaves through energy markets, shipping routes, and inflation expectations worldwide.

Lloyd's of London immediately raised war risk premiums for vessels transiting the Persian Gulf by 40%, while major shipping companies Maersk and MSC issued navigation advisories to their fleets.

Energy analysts at Goldman Sachs revised their Q2 Brent crude forecast upward to $105-115, noting that even a partial disruption would "fundamentally alter the supply-demand balance for the remainder of 2026."

The crisis comes at a particularly vulnerable moment for emerging economies. Many African and South Asian nations are already grappling with elevated food prices and weakening currencies. A sustained oil price shock could tip several import-dependent economies into balance-of-payments crises.

Saudi Arabia and the UAE have signaled readiness to increase production through alternative pipeline routes bypassing Hormuz, but analysts estimate this could only compensate for roughly 40% of the strait's throughput in a full blockade scenario.`,
    category: 'Geopolitics & Energy',
    regionTags: ['Middle East', 'Global', 'West Africa', 'East Africa'],
    entityTags: ['Iran', 'United States', 'OPEC', 'Lloyd\'s of London', 'Goldman Sachs'],
  },
  {
    id: 'wheat-black-sea-crisis-2026',
    title: 'Russia Suspends Black Sea Grain Corridor: Global Wheat Prices Spike 18% in 48 Hours',
    publisher: 'Financial Times',
    publisherUrl: 'https://www.ft.com',
    author: 'Emiko Terazono',
    publishedAt: '2026-04-08T09:15:00Z',
    canonicalUrl: 'https://www.ft.com/content/black-sea-grain-corridor-suspended-wheat-prices',
    imageUrl: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=1200&h=630&fit=crop',
    excerpt: 'Russia\'s sudden suspension of the Black Sea grain corridor has triggered an 18% spike in global wheat futures, reigniting food security fears across Africa, the Middle East and Southeast Asia.',
    body: `Russia's sudden suspension of the Black Sea grain corridor has triggered an 18% spike in global wheat futures, reigniting food security fears across Africa, the Middle East, and Southeast Asia.

Chicago wheat futures surged to $8.45 per bushel on Tuesday, the highest level since the initial grain crisis of 2022, after Moscow announced an "indefinite suspension" of the corridor citing "unfulfilled obligations by Western parties."

The Black Sea grain corridor, initially brokered by Turkey and the UN in 2022, had become a critical lifeline for global food supply chains. Ukraine accounts for approximately 10% of global wheat exports and 15% of corn exports, with the vast majority transiting through Black Sea ports.

The UN World Food Programme immediately warned of "catastrophic consequences" for its operations, noting that 60% of WFP wheat purchases in 2025 came from Ukraine. "We are looking at potential famine conditions in parts of the Sahel, Horn of Africa, and Yemen within months if this is not resolved," said WFP Executive Director Cindy McCain.

Egypt, the world's largest wheat importer, saw its sovereign credit default swap spreads widen by 45 basis points as markets priced in the fiscal impact of higher grain import costs. The Egyptian pound fell 3.2% against the dollar in offshore trading.

Nigeria, which imports approximately 5.5 million tonnes of wheat annually, faces particular exposure. The Nigerian government's grain reserve currently holds less than 60 days of supply, according to trade ministry data.

Fertilizer markets also reacted sharply, with potash and ammonia prices rising 8-12% on concerns that Russian retaliatory measures could extend to fertilizer exports.`,
    category: 'Agriculture & Commodities',
    regionTags: ['Black Sea', 'Sub-Saharan Africa', 'Middle East', 'Global'],
    entityTags: ['Russia', 'Ukraine', 'WFP', 'Egypt', 'Nigeria', 'Turkey'],
  },
  {
    id: 'eu-ai-act-enforcement-2026',
    title: 'EU AI Act Enforcement Begins: $2.3B in Fines Threatened as Big Tech Scrambles to Comply',
    publisher: 'Bloomberg',
    publisherUrl: 'https://www.bloomberg.com',
    publishedAt: '2026-04-07T11:00:00Z',
    canonicalUrl: 'https://www.bloomberg.com/news/articles/eu-ai-act-enforcement-begins-2026',
    imageUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop',
    excerpt: 'The European Union\'s AI Act enters its enforcement phase today, with regulators threatening fines up to 7% of global revenue. Meta, OpenAI, and ByteDance face immediate scrutiny over high-risk AI systems.',
    body: `The European Union's AI Act enters its full enforcement phase today, marking the world's most comprehensive attempt to regulate artificial intelligence. Companies face fines of up to 7% of global revenue for violations — potentially $2.3 billion for the largest tech firms.

The European AI Office, established in Brussels with a staff of 140 regulators, has already opened preliminary investigations into Meta's AI-powered content recommendation systems, OpenAI's GPT-5 deployment in healthcare settings, and ByteDance's algorithmic content curation.

"This is not about stopping innovation. This is about ensuring AI serves European values," said EU Commissioner for Digital Affairs Henna Virkkunen. "Companies that comply will gain a competitive advantage through consumer trust."

The Act classifies AI systems into four risk tiers. "High-risk" systems — including those used in healthcare, employment, credit scoring, law enforcement, and critical infrastructure — must undergo conformity assessments, maintain detailed technical documentation, and implement human oversight mechanisms.

Silicon Valley's response has been mixed. Microsoft announced a €1.2 billion investment in its European compliance infrastructure, while Google said it would restrict certain AI features in the EU market pending compliance reviews.

For African tech ecosystems, the implications are significant. Many African fintech companies use AI-powered credit scoring models trained on European datasets. The Act's extraterritorial provisions mean these companies may need to comply if they process data of EU residents or deploy systems originally developed under EU jurisdiction.

Rwanda's Kigali Innovation City, which hosts 15 international AI companies, has preemptively adopted AI governance frameworks aligned with the EU Act, positioning itself as a "compliance-ready" hub for companies seeking to serve both African and European markets.`,
    category: 'Technology & Regulation',
    regionTags: ['Europe', 'Global', 'East Africa', 'West Africa'],
    entityTags: ['EU', 'Meta', 'OpenAI', 'ByteDance', 'Microsoft', 'Google'],
  },
]

// ── Mock AI Implications ─────────────────────────────────────────────────────

export const MOCK_ANALYSES: ArticleImplicationAnalysis[] = [
  {
    articleId: 'iran-strait-hormuz-2026',
    executiveTakeaway: 'A sustained Hormuz disruption would trigger the most severe energy supply shock since 1973. With 21% of global oil transiting the strait, even a partial blockade could push Brent above $120, cascade through shipping, food, fertilizer, and FX markets, and tip import-dependent African economies into crisis within weeks.',
    whyThisMatters: [
      '17-18 million barrels/day transit the Strait of Hormuz — any disruption immediately tightens global supply',
      'Strategic petroleum reserves across OECD nations have been drawn down significantly since 2022, limiting buffer capacity',
      'Most African nations import 80-100% of refined petroleum products and have zero strategic reserves',
      'The timing coincides with peak agricultural planting season in the Southern Hemisphere, amplifying fertilizer price sensitivity',
      'Global shipping insurance rates have already risen 40%, adding cost pressure across all trade routes',
    ],
    immediateImplications: [
      'Oil prices likely to sustain $95-110 range even without actual blockade — risk premium alone drives prices',
      'Shipping companies rerouting around the Cape of Good Hope adds 10-14 days and $1M+ per voyage',
      'War risk insurance premiums for Gulf-transiting vessels will remain elevated for 3-6 months minimum',
      'LNG spot prices in Asia and Europe will spike 15-25% due to shared transit route dependency',
      'Central banks in emerging markets face impossible choice: raise rates (crush growth) or tolerate imported inflation',
    ],
    secondOrderEffects: [
      'Fertilizer prices (ammonia, urea) will rise 15-30% — Gulf states are major producers. This hits the next agricultural cycle.',
      'Airlines face margin compression — jet fuel accounts for 25-35% of operating costs. Expect route cuts to Africa/Asia first.',
      'Plastics, petrochemicals, and construction materials all face input cost inflation within 4-6 weeks',
      'USD strengthening as safe-haven flows accelerate — devastating for emerging market currencies and dollar-denominated debt',
      'China may accelerate yuan-denominated oil trading agreements with Gulf states, restructuring petrodollar dynamics',
      'European natural gas prices rise in sympathy, reopening energy security debates and potential return to coal',
    ],
    regionalImplications: [
      {
        region: 'West Africa (Nigeria, Ghana, Senegal, Côte d\'Ivoire)',
        implications: [
          'Nigeria paradoxically benefits from higher crude prices but suffers from refined product import dependence',
          'Ghana\'s cedi, already under pressure, faces 10-15% depreciation risk against the dollar',
          'Senegal and Côte d\'Ivoire face 20-30% increase in diesel and cooking fuel costs within weeks',
          'Port of Lagos and Tema container throughput may slow as shipping costs surge',
        ],
      },
      {
        region: 'East Africa (Kenya, Ethiopia, Tanzania)',
        implications: [
          'Kenya imports 100% of petroleum — budget deficit will widen by an estimated $800M-1.2B annually at $110 oil',
          'Ethiopian Airlines, Africa\'s largest carrier, faces severe jet fuel cost pressure',
          'Tanzania\'s fertilizer-dependent agriculture sector faces immediate input cost shock',
          'East African Community trade corridors see transport cost inflation of 15-25%',
        ],
      },
      {
        region: 'Europe',
        implications: [
          'Energy security debates reopen — pressure to accelerate renewables but also extend fossil fuel infrastructure',
          'ECB faces stagflation scenario: energy-driven inflation vs. recession risk',
          'European manufacturers with Gulf supply chain exposure face production disruptions',
        ],
      },
      {
        region: 'South & Southeast Asia',
        implications: [
          'India (3rd largest oil importer) faces current account deterioration and rupee depreciation pressure',
          'Pakistan, Sri Lanka, and Bangladesh — already fragile economies — face potential balance-of-payments crises',
          'Southeast Asian manufacturing competitiveness erodes as energy input costs rise',
        ],
      },
    ],
    sectorExposure: [
      { sector: 'Oil & Gas', riskLevel: 'high', notes: ['Upstream producers benefit from higher prices', 'Downstream refiners face margin pressure if crude outpaces product prices', 'National oil companies in importing countries face fiscal strain'] },
      { sector: 'Shipping & Logistics', riskLevel: 'high', notes: ['War risk premiums already up 40%', 'Rerouting adds $1M+ per voyage and 10-14 day delays', 'Container shipping rates will follow bulk rates upward within 2-3 weeks'] },
      { sector: 'Agriculture & Food', riskLevel: 'high', notes: ['Fertilizer prices rise 15-30% (Gulf ammonia production)', 'Transport costs for food imports spike', 'Food inflation in import-dependent nations within 4-8 weeks'] },
      { sector: 'Aviation', riskLevel: 'high', notes: ['Jet fuel 25-35% of airline costs', 'African and Asian route profitability collapses first', 'Expect capacity cuts and fare increases within weeks'] },
      { sector: 'Financial Services', riskLevel: 'medium', notes: ['FX volatility creates trading opportunities but also credit risk', 'Sovereign credit spreads widen for oil-importing nations', 'Trade finance costs increase with higher commodity prices'] },
      { sector: 'Technology', riskLevel: 'low', notes: ['Indirect impact through energy costs for data centers', 'Cloud computing margins compressed in energy-intensive regions', 'Possible demand reduction from enterprise budget cuts in affected economies'] },
    ],
    whatToWatch: [
      'IRGC naval exercise frequency and proximity to commercial shipping lanes in the next 72 hours',
      'US carrier group redeployment decisions — a second carrier group entering the region signals escalation',
      'Saudi Arabia and UAE statements on alternative pipeline capacity activation (East-West pipeline, Habshan-Fujairah)',
      'Lloyd\'s of London war risk premium adjustments — the insurance market is the best leading indicator',
      'OPEC+ emergency meeting convocation — would signal market participants expect sustained disruption',
      'Chinese and Indian crude purchasing behavior — strategic reserve building would accelerate price rises',
      'Egyptian and Nigerian FX reserve drawdowns — first signs of balance-of-payments stress',
    ],
    confidenceNote: 'High confidence in immediate oil price impact and shipping disruption assessment. Medium confidence in duration estimates — highly dependent on diplomatic developments. Regional impact estimates assume disruption lasting >2 weeks.',
    relatedForecasts: [
      { id: 'brent-crude-q2', title: 'Will Brent crude exceed $110/barrel before end of Q2 2026?', crowdProbability: 0.72, aiProbability: 0.68, blendedProbability: 0.70 },
      { id: 'hormuz-blockade', title: 'Will Iran attempt a partial Strait of Hormuz blockade in 2026?', crowdProbability: 0.28, aiProbability: 0.22, blendedProbability: 0.25 },
      { id: 'gulf-insurance-spike', title: 'Will Gulf shipping war risk premiums exceed 1% of cargo value by May 2026?', crowdProbability: 0.61, aiProbability: 0.55, blendedProbability: 0.58 },
      { id: 'kenya-bop-crisis', title: 'Will Kenya seek IMF emergency support for balance-of-payments in H1 2026?', crowdProbability: 0.35, aiProbability: 0.30, blendedProbability: 0.32 },
    ],
  },
  {
    articleId: 'wheat-black-sea-crisis-2026',
    executiveTakeaway: 'Russia\'s corridor suspension recreates the 2022 food crisis playbook with compounding severity. With WFP sourcing 60% of wheat from Ukraine and African nations holding <60 days of grain reserves, this is a direct famine risk accelerator. Expect wheat above $9/bushel, cascading into bread prices, social unrest risk, and sovereign debt stress across North and Sub-Saharan Africa.',
    whyThisMatters: [
      'Ukraine supplies 10% of global wheat and 15% of corn — the corridor is the only viable export route for most of this',
      'The WFP sources 60% of its wheat from Ukraine — humanitarian operations face immediate supply disruption',
      'Egypt, the world\'s largest wheat importer, is already under fiscal stress',
      'Nigeria holds less than 60 days of grain reserves — a critically thin buffer',
      'Fertilizer disruption compounds the problem: less fertilizer → lower yields → tighter supply in the NEXT harvest cycle',
    ],
    immediateImplications: [
      'Wheat futures likely to test $9-10/bushel range if suspension persists beyond 2 weeks',
      'Egyptian pound faces 5-8% depreciation pressure — grain imports are 12% of total import bill',
      'WFP operations in Sahel, Horn of Africa, and Yemen face immediate funding and supply gaps',
      'Bread price increases of 15-25% in import-dependent nations within 3-6 weeks',
      'Alternative suppliers (Australia, Canada, Argentina) cannot fill the gap at current prices and logistics capacity',
    ],
    secondOrderEffects: [
      'Social unrest risk rises sharply in Egypt, Tunisia, Sudan, and Lebanon — bread price protests have historical precedent',
      'Sovereign credit downgrades likely for most exposed importers within 60-90 days',
      'Fertilizer supply disruption means the NEXT planting season (Oct-Dec 2026) also at risk — compounding multi-season food insecurity',
      'Animal feed price inflation drives poultry and livestock price increases, broadening food inflation beyond staples',
      'EU and US face political pressure to release strategic grain reserves, but stocks are at multi-year lows',
      'Agricultural commodity speculation increases, amplifying price volatility beyond fundamentals',
    ],
    regionalImplications: [
      {
        region: 'North Africa (Egypt, Tunisia, Libya, Algeria, Morocco)',
        implications: [
          'Egypt\'s grain subsidy program costs surge by $2-3B annually at current prices — fiscal deficit widens sharply',
          'Tunisia faces renewed social instability — bread riots preceded the 2011 revolution',
          'Morocco\'s domestic wheat production only covers 50% of needs — import dependence leaves it exposed',
          'Algeria can partially buffer with hydrocarbon export revenues but faces inflationary pressure',
        ],
      },
      {
        region: 'Sahel & Horn of Africa',
        implications: [
          'WFP operations in Mali, Burkina Faso, Niger, and Chad face 30-40% budget shortfalls',
          'Somalia and Ethiopia, already in humanitarian crisis, lose access to affordable grain imports',
          'Displacement and migration pressures intensify — food insecurity is the primary driver of Sahel displacement',
        ],
      },
      {
        region: 'Middle East',
        implications: [
          'Yemen, already in famine conditions, faces catastrophic supply disruption',
          'Lebanon, with collapsed grain storage since the 2020 Beirut explosion, has zero buffer capacity',
          'Gulf states (UAE, Saudi Arabia) accelerate strategic grain reserve programs',
        ],
      },
    ],
    sectorExposure: [
      { sector: 'Agriculture & Food', riskLevel: 'high', notes: ['Wheat, corn, and barley prices all affected', 'Fertilizer disruption compounds multi-season risk', 'Food processing companies face severe margin compression'] },
      { sector: 'Retail & Consumer', riskLevel: 'high', notes: ['Bread and staple food price inflation hits lowest-income consumers hardest', 'Consumer spending on discretionary goods declines as food takes larger budget share'] },
      { sector: 'Sovereign Debt', riskLevel: 'high', notes: ['Egypt, Pakistan, Nigeria CDS spreads widening', 'IMF program countries face conditionality pressure', 'Eurobond refinancing costs rise for affected sovereigns'] },
      { sector: 'Shipping & Trade', riskLevel: 'medium', notes: ['Black Sea shipping pauses, but alternative routes see increased demand', 'Bulk carrier rates for grain routes spike', 'Port congestion at alternative export hubs (Australia, Argentina)'] },
      { sector: 'Financial Services', riskLevel: 'medium', notes: ['Agricultural commodity trading volumes surge', 'Trade finance demand increases but credit risk also rises', 'Microfinance institutions in affected regions face higher default rates'] },
    ],
    whatToWatch: [
      'Turkey-Russia diplomatic contacts in the next 48-72 hours — Turkey mediated the original deal',
      'UN Security Council emergency session convocation and tone of major power statements',
      'Egyptian central bank FX reserve data and offshore pound trading',
      'WFP emergency appeal announcements and donor response speed',
      'Alternative grain export logistics activation (Danube river routes, rail-to-Baltic corridors)',
      'Russian rhetoric: temporary tactical pressure vs. sustained strategic disruption',
      'Bread price monitoring in Cairo, Tunis, Khartoum — early social stability indicators',
    ],
    confidenceNote: 'Very high confidence in immediate price impact. High confidence in food security risk assessment for import-dependent nations. Medium confidence in duration — previous suspensions lasted 2-6 weeks before diplomatic resolution.',
    relatedForecasts: [
      { id: 'wheat-price-q2', title: 'Will Chicago wheat futures exceed $9/bushel before June 2026?', crowdProbability: 0.65, aiProbability: 0.71, blendedProbability: 0.68 },
      { id: 'egypt-imf-review', title: 'Will Egypt request an expanded IMF program in H1 2026?', crowdProbability: 0.55, aiProbability: 0.48, blendedProbability: 0.51 },
      { id: 'sahel-famine-declaration', title: 'Will the UN declare famine in at least one Sahel nation by Q3 2026?', crowdProbability: 0.42, aiProbability: 0.38, blendedProbability: 0.40 },
    ],
  },
  {
    articleId: 'eu-ai-act-enforcement-2026',
    executiveTakeaway: 'The EU AI Act creates the world\'s first comprehensive AI regulatory framework with extraterritorial reach. Companies serving EU markets face fines up to 7% of global revenue. For African tech companies, this is both a compliance challenge and a strategic opportunity — early adopters of EU-aligned AI governance gain a competitive moat in cross-border markets.',
    whyThisMatters: [
      'First binding comprehensive AI regulation with real enforcement teeth — 7% of global revenue is existential-level for most companies',
      'Extraterritorial scope means non-EU companies processing EU data or deploying EU-origin models must comply',
      'Sets the global regulatory template — other jurisdictions will follow (UK, Japan, India already drafting similar frameworks)',
      'African fintech companies using AI credit scoring are directly in scope if they process EU resident data',
      'Creates a "Brussels Effect" — companies will build to EU standards globally rather than maintaining separate systems',
    ],
    immediateImplications: [
      'Big Tech compliance costs estimated at $500M-1.5B per company for high-risk AI system documentation and auditing',
      'AI startups face regulatory barrier to EU market entry — advantages incumbents with compliance resources',
      'Healthcare AI, recruitment AI, and credit scoring AI face immediate scrutiny and potential market withdrawal',
      'AI model transparency requirements may conflict with trade secret protections — legal battles ahead',
      'Compliance consulting and AI auditing emerge as high-growth service sectors',
    ],
    secondOrderEffects: [
      'Global AI talent migration to jurisdictions with clearer regulatory frameworks — EU becomes more attractive for responsible AI researchers',
      'Open-source AI models face ambiguous status — community-developed models may not have a liable party for compliance',
      'Insurance industry develops AI liability products — new asset class of AI risk transfer instruments',
      'African AI hubs (Kigali, Lagos, Nairobi, Cape Town) can differentiate by pre-adopting EU-aligned governance',
      'China\'s competing AI regulatory framework creates a bifurcated global standard — companies must choose compliance paths',
      'Venture capital shifts toward "regulation-proof" AI companies with built-in compliance architecture',
    ],
    regionalImplications: [
      {
        region: 'Africa (Continental)',
        implications: [
          'African fintech companies (Flutterwave, Chipper Cash, M-Pesa) using AI credit scoring need EU compliance roadmaps',
          'Rwanda\'s Kigali Innovation City gains advantage as pre-compliant AI hub',
          'African Union\'s draft AI Continental Strategy gains urgency — harmonization with EU standards recommended',
          'Opportunity: African AI companies that achieve EU compliance first gain premium market positioning',
        ],
      },
      {
        region: 'United States',
        implications: [
          'US-EU regulatory divergence creates compliance complexity for transatlantic AI companies',
          'Pressure on Congress to pass federal AI legislation increases — state-level fragmentation is untenable',
          'US companies may restrict AI features in EU markets, creating a two-tier product experience',
        ],
      },
      {
        region: 'Asia (China, India, Japan)',
        implications: [
          'China\'s competing AI governance framework creates risk of global regulatory fragmentation',
          'India\'s AI regulation, still in draft, likely pivots closer to EU model given trade relationship importance',
          'Japanese companies with EU operations face immediate compliance requirements',
        ],
      },
    ],
    sectorExposure: [
      { sector: 'Technology (AI/ML)', riskLevel: 'high', notes: ['Direct compliance requirements for high-risk AI systems', 'Model documentation and transparency obligations', 'Market access depends on conformity assessments'] },
      { sector: 'Financial Services (Fintech)', riskLevel: 'high', notes: ['AI credit scoring classified as high-risk', 'Algorithmic trading systems face transparency requirements', 'African fintechs with EU exposure need immediate compliance plans'] },
      { sector: 'Healthcare', riskLevel: 'high', notes: ['AI diagnostic tools classified as high-risk medical devices', 'Clinical AI requires human oversight mechanisms', 'Telemedicine AI platforms face market access restrictions'] },
      { sector: 'Consulting & Legal', riskLevel: 'low', notes: ['AI compliance consulting is a major growth opportunity', 'Demand for AI auditors, ethicists, and compliance officers surges', 'Law firms developing AI regulatory practice groups'] },
      { sector: 'Recruitment & HR', riskLevel: 'medium', notes: ['AI-powered hiring tools classified as high-risk', 'Bias auditing requirements for automated candidate screening', 'Companies may revert to human-led processes in EU markets'] },
    ],
    whatToWatch: [
      'European AI Office investigation outcomes for Meta, OpenAI, and ByteDance — first enforcement actions set precedent',
      'Microsoft\'s €1.2B compliance investment — signals industry\'s assessment of enforcement seriousness',
      'First formal fines and enforcement actions — expected within 6-9 months',
      'US Congressional response — federal AI legislation timeline and scope',
      'African Union AI Strategy publication — alignment with EU standards signals market integration intent',
      'Open-source AI community response — potential legal challenges to transparency requirements',
    ],
    confidenceNote: 'High confidence in regulatory impact assessment. Medium confidence in enforcement timeline — regulators may prioritize high-profile cases. High confidence in extraterritorial impact on African fintech sector.',
    relatedForecasts: [
      { id: 'eu-ai-fine-2026', title: 'Will the EU issue its first AI Act fine exceeding €100M by end of 2026?', crowdProbability: 0.38, aiProbability: 0.32, blendedProbability: 0.35 },
      { id: 'us-federal-ai-law', title: 'Will the US pass federal AI regulation by end of 2026?', crowdProbability: 0.22, aiProbability: 0.18, blendedProbability: 0.20 },
      { id: 'african-ai-compliance', title: 'Will at least 3 African nations adopt EU-aligned AI governance frameworks by 2027?', crowdProbability: 0.45, aiProbability: 0.52, blendedProbability: 0.49 },
    ],
  },
]

// ── Lookup helpers ───────────────────────────────────────────────────────────

export function getArticle(id: string): SourceArticle | undefined {
  return MOCK_ARTICLES.find(a => a.id === id)
}

export function getAnalysis(articleId: string): ArticleImplicationAnalysis | undefined {
  return MOCK_ANALYSES.find(a => a.articleId === articleId)
}
