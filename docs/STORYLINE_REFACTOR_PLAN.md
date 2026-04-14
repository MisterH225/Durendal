# Plan de Refonte — Storyline Intelligence Engine v2

## Problème actuel

Le système de storyline génère des résultats défaillants pour la requête "Blocus du détroit d'Ormuz" :

### Symptômes observés

1. **Dates incorrectes** : Tous les articles affichent `2026-04-13` ou `2026-04-14` → dates de collecte, pas dates d'événement réel
2. **Duplication sémantique** : 5+ articles différents parlent du même événement ("Échec des pourparlers US-Iran") mais sont traités comme événements distincts
3. **Absence d'historique profond** : Pas d'événements antérieurs (2025, 2024...) qui expliqueraient la situation actuelle
4. **Chaîne causale artificielle** : Simple énumération chronologique d'articles récents, sans vraie analyse cause-effet

### Causes techniques

- `HybridRetrievalService` ne déduplique pas sémantiquement les articles
- Le LLM dans `storyline-analysis.ts` reçoit des articles bruts et essaie de construire une chaîne directement
- Les champs `published_at` dans Supabase sont souvent `null` ou égaux à `created_at`
- Pas de clustering d'événements avant l'analyse causale
- La recherche historique multi-window ne récupère pas assez d'événements antérieurs profonds

---

## Architecture proposée — Pipeline en 4 phases

```
Input: Keyword search ou Article ID
  ↓
[Phase 1] Article Summarization & Event Extraction
  → Pour chaque article candidat : extraire date réelle, événement canonique, résumé
  ↓
[Phase 2] Semantic Event Clustering
  → Regrouper articles similaires en EventClusters uniques
  ↓
[Phase 3] Historical Depth Search
  → Si biais de récence détecté → recherche web ciblée pour événements antérieurs
  ↓
[Phase 4] Causal Storyline Assembly
  → Construire chaîne causale depuis EventClusters, pas articles bruts
  → Appliquer CounterfactualCheck entre événements
  ↓
Output: Storyline avec événements uniques, dates réelles, historique profond
```

---

## Phase 1 : Article Summarization & Event Extraction

### Objectif

Pour chaque article candidat récupéré par `HybridRetrievalService`, extraire :

- **Date réelle de l'événement** (pas date de publication/collecte)
- **Titre canonique de l'événement** (normalisé, dédupliquable)
- **Résumé court** (2-3 phrases)
- **Entités principales** (pays, organisations, personnes)
- **Géographie** (région, pays)

### Tâches techniques

#### T1.1 : Créer le type `ExtractedEvent`

**Fichier** : `lib/storyline/types/event-extraction.ts` (nouveau)

```typescript
export interface ExtractedEvent {
  articleId: string
  articleUrl: string
  articleTitle: string
  articleSource: string
  
  // Extraction LLM
  eventDate: string | null // Format YYYY-MM-DD
  eventDateConfidence: 'high' | 'medium' | 'low'
  canonicalEventTitle: string
  eventSummary: string
  entities: string[]
  geography: string[]
  
  // Métadonnées
  extractedAt: string
  rawContent: string // Premier paragraphe ou début de l'article
}
```

#### T1.2 : Créer le service `ArticleExtractor`

**Fichier** : `lib/storyline/services/article-extractor.ts` (nouveau)

**Méthode** : `extractEventFromArticle(article: CandidateItem): Promise<ExtractedEvent>`

**Logique** :

1. Construire un prompt Gemini avec :
  - Titre de l'article
  - Source
  - URL
  - Extrait du contenu (si disponible dans `raw_content` ou via fetch)
2. Demander au LLM d'extraire :
  - La date réelle de l'événement décrit (pas la date de publication)
  - Le titre canonique de l'événement (normalisé, générique)
  - Un résumé court
  - Les entités principales
  - La géographie
3. Parser la réponse JSON
4. Retourner `ExtractedEvent`

**Prompt LLM suggéré** :

```
You are analyzing a news article to extract the core event it describes.

Article:
- Title: {articleTitle}
- Source: {source}
- URL: {url}
- Content excerpt: {contentExcerpt}

Extract:
1. eventDate: The actual date when the event occurred (YYYY-MM-DD format). NOT the publication date. If multiple dates, choose the most significant. If no date found, return null.
2. eventDateConfidence: "high" if explicit date in text, "medium" if inferred from context, "low" if guessed.
3. canonicalEventTitle: A normalized, generic title for this event (e.g., "Échec des pourparlers de paix US-Iran à Islamabad" not "Trump orders blockade after failed talks").
4. eventSummary: 2-3 sentences summarizing what happened.
5. entities: List of key entities (countries, organizations, people).
6. geography: List of countries/regions involved.

Return JSON:
{
  "eventDate": "2026-04-12",
  "eventDateConfidence": "high",
  "canonicalEventTitle": "...",
  "eventSummary": "...",
  "entities": ["USA", "Iran", "Donald Trump"],
  "geography": ["Pakistan", "Middle East"]
}
```

#### T1.3 : Ajouter extraction batch dans `HybridRetrievalService`

**Fichier** : `lib/storyline/services/hybrid-retrieval.ts` (modification)

**Nouvelle méthode** : `extractEventsFromCandidates(candidates: CandidateItem[]): Promise<ExtractedEvent[]>`

**Logique** :

1. Filtrer les candidats ayant du contenu exploitable
2. Appeler `ArticleExtractor.extractEventFromArticle()` pour chaque candidat
3. Paralléliser les appels LLM (max 5-10 en parallèle pour éviter rate limit)
4. Retourner la liste des `ExtractedEvent`

---

## Phase 2 : Semantic Event Clustering

### Objectif

Regrouper les `ExtractedEvent` qui parlent du **même événement canonique** en `EventCluster`.

Exemple :

- Article 1 : "Trump orders blockade after failed Iran talks"
- Article 2 : "Échec des pourparlers US-Iran, blocus du détroit d'Ormuz"
- Article 3 : "US-Iran negotiations collapse in Islamabad"

→ **1 seul EventCluster** : "Échec des pourparlers de paix US-Iran à Islamabad"

### Tâches techniques

#### T2.1 : Créer le type `EventCluster`

**Fichier** : `lib/storyline/types/event-cluster.ts` (nouveau)

```typescript
export interface EventCluster {
  clusterId: string // UUID
  canonicalTitle: string
  eventDate: string | null // Date consensus (médiane ou la plus fiable)
  eventDateConfidence: 'high' | 'medium' | 'low'
  summary: string // Résumé fusionné
  entities: string[] // Union des entités
  geography: string[] // Union des géographies
  
  sourceArticles: {
    articleId: string
    articleUrl: string
    articleTitle: string
    articleSource: string
  }[]
  
  // Métadonnées
  clusterSize: number // Nombre d'articles dans le cluster
  representativeArticle: string // ID de l'article le plus informatif
}
```

#### T2.2 : Créer le service `EventClusterer`

**Fichier** : `lib/storyline/services/event-clusterer.ts` (nouveau)

**Méthode** : `clusterEvents(extractedEvents: ExtractedEvent[]): Promise<EventCluster[]>`

**Stratégie de clustering** :

**Option A : Clustering LLM-based (recommandé pour MVP)**

1. Trier les événements par date
2. Pour chaque événement :
  - Comparer avec les clusters existants
  - Demander au LLM si l'événement appartient à un cluster existant
  - Si oui : ajouter au cluster
  - Si non : créer un nouveau cluster
3. Fusionner les métadonnées (entités, résumés, dates)

**Prompt LLM suggéré** :

```
You are clustering news articles about events.

Existing cluster:
- Title: {clusterCanonicalTitle}
- Date: {clusterDate}
- Summary: {clusterSummary}

New event:
- Title: {eventCanonicalTitle}
- Date: {eventDate}
- Summary: {eventSummary}

Question: Does this new event describe the SAME event as the cluster, or a DIFFERENT event?
- SAME: They describe the same occurrence (e.g., "Échec pourparlers US-Iran" and "US-Iran talks collapse" are the same)
- DIFFERENT: They describe distinct occurrences (e.g., "Blocus US" vs "Hausse prix pétrole" are different, even if related)

Return JSON:
{
  "isSameEvent": true | false,
  "confidence": "high" | "medium" | "low",
  "reasoning": "..."
}
```

**Option B : Clustering par similarité cosine (alternative plus performante)**

1. Générer des embeddings pour chaque `canonicalEventTitle` + `eventSummary`
2. Calculer la matrice de similarité cosine
3. Appliquer un seuil (0.85) pour regrouper
4. Fusionner les clusters proches

#### T2.3 : Implémenter la fusion de métadonnées

**Logique** :

- **Date consensus** : Prendre la date avec `eventDateConfidence = 'high'` en priorité, sinon médiane
- **Résumé fusionné** : Concaténer les résumés uniques ou demander au LLM de synthétiser
- **Entités/géographie** : Union des listes
- **Representative article** : Celui avec le résumé le plus long ou le plus de détails

---

## Phase 3 : Historical Depth Search

### Objectif

Si tous les `EventCluster` sont récents (< 7 jours), forcer une recherche historique profonde pour trouver les événements antérieurs qui expliquent la situation actuelle.

Exemple : Pour "Blocus du détroit d'Ormuz" (avril 2026), on devrait récupérer :

- Bombardements US-Iran (février 2026)
- Cessez-le-feu précédent (janvier 2026)
- Escalade nucléaire iranienne (2025)
- Sanctions US (2024)
- ...

### Tâches techniques

#### T3.1 : Détecter le biais de récence

**Fichier** : `lib/storyline/services/recency-bias-detector.ts` (nouveau)

**Méthode** : `detectRecencyBias(clusters: EventCluster[]): boolean`

**Logique** :

1. Calculer la date médiane des clusters
2. Si > 80% des clusters ont une date dans les 7 derniers jours → `true`
3. Si l'écart entre la date la plus ancienne et la plus récente est < 14 jours → `true`
4. Sinon → `false`

#### T3.2 : Créer le service `HistoricalSearcher`

**Fichier** : `lib/storyline/services/historical-searcher.ts` (nouveau)

**Méthode** : `searchHistoricalContext(anchorKeywords: string[], currentClusters: EventCluster[]): Promise<ExtractedEvent[]>`

**Logique** :

1. Identifier les entités principales depuis les clusters actuels
2. Construire des requêtes historiques ciblées :
  - `"{entité1} {entité2} conflict history 2020-2025"`
  - `"{keyword} timeline before 2026"`
  - `"{entité1} sanctions history"`
3. Appeler Perplexity avec contrainte temporelle :
  ```typescript
   searchDateRange: {
     start: "2020-01-01",
     end: currentDate - 30 days
   }
  ```
4. Parser les résultats Perplexity
5. Extraire les événements avec `ArticleExtractor`
6. Retourner les `ExtractedEvent` historiques

#### T3.3 : Intégrer la recherche historique dans le builder

**Fichier** : `lib/storyline/builder.ts` (modification)

**Logique** :

1. Après la Phase 2 (clustering), appeler `RecencyBiasDetector`
2. Si biais détecté :
  - Appeler `HistoricalSearcher.searchHistoricalContext()`
  - Extraire les événements historiques
  - Re-cluster avec les nouveaux événements
3. Continuer vers Phase 4

---

## Phase 4 : Causal Storyline Assembly (Refactored)

### Objectif

Construire la chaîne causale depuis les `EventCluster` (événements uniques), pas depuis les articles bruts.

### Tâches techniques

#### T4.1 : Modifier le type `StorylineAnalysisEntry`

**Fichier** : `lib/graph/types.ts` (modification)

**Changements** :

```typescript
export interface StorylineAnalysisEntry {
  candidateRef: string // Devient eventClusterId
  
  // Nouveau : référence au cluster, pas à l'article
  clusterId: string
  clusterCanonicalTitle: string
  clusterDate: string | null
  clusterSummary: string
  
  // Relations
  temporalRelation: TemporalSubtype
  causalRelation: CausalSubtype | null
  relationCategory: RelationCategory
  relationSubtype: RelationSubtype
  
  // Evidence
  causalConfidence: number
  causalEvidence?: CausalEvidence
  
  // Chain structure
  chainPredecessorRef?: string // ID du cluster précédent
  isCorollary?: boolean
  attachedToRef?: string // ID du cluster auquel ce corollaire est attaché
  
  // Articles sources (nouveau)
  sourceArticles: SourceArticle[] // Les 2-3 meilleurs articles du cluster
}
```

#### T4.2 : Refactorer `storyline-analysis.ts`

**Fichier** : `lib/storyline/services/storyline-analysis.ts` (modification majeure)

**Nouvelle signature** :

```typescript
export async function analyzeStoryline(
  anchorContext: AnchorContext,
  eventClusters: EventCluster[], // Plus de CandidateItem[]
  signal?: AbortSignal
): Promise<StorylineAnalysisEntry[]>
```

**Modifications du prompt LLM** :

1. Remplacer les "candidates" par "event clusters"
2. Chaque cluster a déjà une date réelle, un titre canonique, et des articles sources
3. Demander au LLM de :
  - Construire la chaîne causale depuis les clusters uniques
  - Identifier les corollaires
  - Sélectionner les 2-3 meilleurs articles par cluster pour les `sourceArticles`

**Nouveau prompt (extrait)** :

```
You are analyzing UNIQUE EVENTS (not raw articles) to build a causal storyline.

Each event cluster represents a single occurrence, with multiple source articles.

Anchor event:
- Title: {anchorTitle}
- Date: {anchorDate}
- Summary: {anchorSummary}

Event clusters:
[
  {
    clusterId: "cluster-001",
    canonicalTitle: "Échec des pourparlers de paix US-Iran à Islamabad",
    eventDate: "2026-04-12",
    summary: "...",
    sourceArticles: [
      { title: "...", url: "...", source: "Reuters" },
      { title: "...", url: "...", source: "BBC" }
    ]
  },
  ...
]

Your task:
1. Build a LINEAR CAUSAL CHAIN of trunk events leading to the anchor
2. For each trunk event, specify chainPredecessorRef (the previous event in the chain)
3. Identify corollary events (side effects) and specify attachedToRef (the trunk event they branch from)
4. For each event, select the 2-3 most informative sourceArticles from its cluster

Return JSON array of StorylineAnalysisEntry.
```

#### T4.3 : Refactorer `storyline-assembler.ts`

**Fichier** : `lib/storyline/services/storyline-assembler.ts` (modification)

**Nouvelle signature** :

```typescript
export async function assembleStoryline(
  anchorContext: AnchorContext,
  eventClusters: EventCluster[], // Plus de CandidateItem[]
  analysisEntries: StorylineAnalysisEntry[]
): Promise<StorylineResult>
```

**Modifications** :

1. Créer les `StorylineCard` depuis les `EventCluster`, pas les articles raw
2. Chaque card affiche :
  - `title` = `clusterCanonicalTitle`
  - `date` = `clusterDate` (date réelle de l'événement)
  - `summary` = `clusterSummary`
  - `sourceArticles` = les 2-3 articles sélectionnés par le LLM
3. Les edges connectent des clusters, pas des articles

#### T4.4 : Mettre à jour `CounterfactualCheckService`

**Fichier** : `lib/storyline/services/counterfactual-check.ts` (modification)

**Changement** : Accepter des `EventCluster` au lieu de `CandidateItem`

**Nouvelle signature** :

```typescript
export async function runCounterfactualCheck(
  eventA: EventCluster, // Cause potentielle
  eventB: EventCluster, // Effet potentiel
  context: string
): Promise<CounterfactualResult>
```

**Avantage** : Analyse plus précise car on compare des événements uniques, pas des articles dupliqués

---

## Phase 5 : Intégration et Orchestration

### Tâches techniques

#### T5.1 : Refactorer le builder principal

**Fichier** : `lib/storyline/builder.ts` (modification majeure)

**Nouvelle méthode** : `buildStorylineV2()`

**Pipeline complet** :

```typescript
export async function buildStorylineV2(
  input: StorylineInput,
  signal?: AbortSignal,
  onProgress?: (update: StorylineProgressUpdate) => void
): Promise<StorylineResult> {
  
  // 1. Résoudre l'ancre
  const anchor = await resolveAnchor(input)
  onProgress?.({ stage: 'anchor_resolved', data: anchor })
  
  // 2. Récupérer les candidats (articles bruts)
  const candidates = await HybridRetrievalService.retrieve(anchor)
  onProgress?.({ stage: 'candidates_retrieved', count: candidates.length })
  
  // 3. PHASE 1 : Extraire les événements
  const extractedEvents = await ArticleExtractor.extractEventsFromCandidates(candidates)
  onProgress?.({ stage: 'events_extracted', count: extractedEvents.length })
  
  // 4. PHASE 2 : Clustériser les événements
  let eventClusters = await EventClusterer.clusterEvents(extractedEvents)
  onProgress?.({ stage: 'events_clustered', count: eventClusters.length })
  
  // 5. PHASE 3 : Détecter biais de récence et recherche historique
  const hasRecencyBias = RecencyBiasDetector.detectRecencyBias(eventClusters)
  if (hasRecencyBias) {
    const historicalEvents = await HistoricalSearcher.searchHistoricalContext(
      anchor.keywords,
      eventClusters
    )
    const historicalClusters = await EventClusterer.clusterEvents(historicalEvents)
    eventClusters = [...eventClusters, ...historicalClusters]
    onProgress?.({ stage: 'historical_context_added', count: historicalClusters.length })
  }
  
  // 6. PHASE 4 : Analyse causale
  const analysisEntries = await analyzeStoryline(anchor, eventClusters, signal)
  onProgress?.({ stage: 'storyline_analyzed', count: analysisEntries.length })
  
  // 7. Vérification counterfactual
  const refinedEntries = await refineWithCounterfactual(eventClusters, analysisEntries)
  
  // 8. Assemblage final
  const storyline = await assembleStoryline(anchor, eventClusters, refinedEntries)
  onProgress?.({ stage: 'storyline_assembled', data: storyline })
  
  return storyline
}
```

#### T5.2 : Ajouter des tests unitaires

**Fichiers** :

- `lib/storyline/services/__tests__/article-extractor.test.ts` (nouveau)
- `lib/storyline/services/__tests__/event-clusterer.test.ts` (nouveau)
- `lib/storyline/services/__tests__/historical-searcher.test.ts` (nouveau)

**Scénarios de test** :

1. Extraction d'événement depuis un article avec date explicite
2. Extraction d'événement depuis un article sans date (inférence)
3. Clustering de 3 articles similaires → 1 cluster
4. Clustering de 3 articles différents → 3 clusters
5. Détection de biais de récence (tous les événements < 7 jours)
6. Recherche historique sur "US-Iran conflict"

---

## Phase 6 : UI/UX Adjustments

### Tâches techniques

#### T6.1 : Afficher les dates réelles dans `IntelNode`

**Fichier** : `components/forecast/graph/IntelNode.tsx` (modification)

**Changement** :

- Remplacer `d.date` (actuellement date de collecte) par `d.eventDate` (date réelle)
- Afficher un indicateur de confiance si `eventDateConfidence = 'low'`

#### T6.2 : Afficher le nombre d'articles sources dans les cards

**Fichier** : `components/forecast/graph/IntelNode.tsx` (modification)

**Ajout** :

- Badge : "3 sources" ou "5 articles"
- Tooltip au survol : liste des sources (Reuters, BBC, Al Jazeera...)

#### T6.3 : Ajouter une timeline historique dans `TimelinePanel`

**Fichier** : `components/forecast/graph/TimelinePanel.tsx` (modification)

**Amélioration** :

- Séparer visuellement les événements récents (< 30 jours) des événements historiques (> 30 jours)
- Ajouter des marqueurs temporels : "2025", "2024", "2023"...

---

## Ordre d'implémentation recommandé

### Sprint 1 : Extraction et Clustering (Phases 1-2)

1. T1.1 : Créer types `ExtractedEvent`
2. T1.2 : Créer `ArticleExtractor` avec prompt LLM
3. T1.3 : Intégrer dans `HybridRetrievalService`
4. T2.1 : Créer type `EventCluster`
5. T2.2 : Créer `EventClusterer` (Option A : LLM-based)
6. T2.3 : Implémenter fusion de métadonnées
7. Tests unitaires pour Phase 1-2

### Sprint 2 : Recherche Historique (Phase 3)

1. T3.1 : Créer `RecencyBiasDetector`
2. T3.2 : Créer `HistoricalSearcher` avec Perplexity
3. T3.3 : Intégrer dans le builder
4. Tests unitaires pour Phase 3

### Sprint 3 : Refactor Causal Assembly (Phase 4)

1. T4.1 : Modifier types `StorylineAnalysisEntry`
2. T4.2 : Refactorer `storyline-analysis.ts` (nouveau prompt)
3. T4.3 : Refactorer `storyline-assembler.ts`
4. T4.4 : Mettre à jour `CounterfactualCheckService`
5. Tests unitaires pour Phase 4

### Sprint 4 : Intégration et UI (Phases 5-6)

1. T5.1 : Refactorer `builder.ts` avec pipeline complet
2. T5.2 : Ajouter tests d'intégration
3. T6.1 : Afficher dates réelles dans UI
4. T6.2 : Afficher sources multiples
5. T6.3 : Améliorer `TimelinePanel`

---

## Métriques de succès

Pour valider que la refonte fonctionne, vérifier :

1. **Dates réelles affichées** : Les cards affichent des dates d'événement (ex: "2025-11-03") au lieu de dates de collecte (2026-04-13)
2. **Déduplication sémantique** : 5 articles sur "Échec pourparlers US-Iran" → 1 seul EventCluster
3. **Profondeur historique** : Au moins 3-5 événements antérieurs à 30 jours dans la storyline
4. **Causalité claire** : Chaîne linéaire visible : "Bombardements US-Iran (fév 2026)" → "Cessez-le-feu (mars 2026)" → "Reprise tensions (avril 2026)" → "Blocus (avril 2026)"
5. **Sources multiples** : Chaque card affiche 2-3 articles sources cliquables

---

## Risques et Alternatives

### Risque 1 : LLM rate limiting pendant l'extraction

**Mitigation** :

- Limiter à 10 extractions parallèles
- Implémenter un cache pour les événements déjà extraits
- Option alternative : extraire seulement les 20 articles les plus pertinents

### Risque 2 : Clustering trop lent avec LLM

**Mitigation** :

- Implémenter l'Option B (clustering par embeddings + cosine similarity)
- Utiliser un modèle plus rapide (Gemini Flash)
- Limiter à 50 clusters max

### Risque 3 : Recherche historique ne trouve pas assez de résultats

**Mitigation** :

- Élargir la fenêtre temporelle (2018-2025 au lieu de 2020-2025)
- Multiplier les requêtes avec des formulations différentes
- Intégrer GDELT Historical comme source additionnelle

---

## Notes techniques additionnelles

### Cache des événements extraits

Pour éviter de re-extraire les mêmes articles à chaque recherche, considérer :

**Option A : Cache Redis** (recommandé)

- Clé : hash(`articleUrl`)
- Valeur : `ExtractedEvent` JSON
- TTL : 7 jours

**Option B : Table Postgres**

```sql
CREATE TABLE extracted_events_cache (
  article_url TEXT PRIMARY KEY,
  extracted_event JSONB NOT NULL,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX idx_extracted_events_expires ON extracted_events_cache(expires_at);
```

### Optimisation des coûts LLM

- Phase 1 (extraction) : ~0.5s + $0.001 par article
- Phase 2 (clustering) : ~1s + $0.002 par comparaison
- Total pour 50 articles : ~$0.10-0.20 par storyline

**Optimisations** :

- Extraire seulement les 30 articles les plus pertinents
- Utiliser Gemini Flash pour l'extraction (50% moins cher)
- Réserver Gemini Pro pour l'analyse causale

---

## Fichiers à créer/modifier — Récapitulatif

### Nouveaux fichiers

```
lib/storyline/types/
  ├── event-extraction.ts
  └── event-cluster.ts

lib/storyline/services/
  ├── article-extractor.ts
  ├── event-clusterer.ts
  ├── historical-searcher.ts
  └── recency-bias-detector.ts

lib/storyline/services/__tests__/
  ├── article-extractor.test.ts
  ├── event-clusterer.test.ts
  └── historical-searcher.test.ts

docs/
  └── STORYLINE_REFACTOR_PLAN.md (ce fichier)
```

### Fichiers modifiés

```
lib/graph/types.ts
lib/storyline/builder.ts
lib/storyline/services/hybrid-retrieval.ts
lib/storyline/services/storyline-analysis.ts
lib/storyline/services/storyline-assembler.ts
lib/storyline/services/counterfactual-check.ts
components/forecast/graph/IntelNode.tsx
components/forecast/graph/TimelinePanel.tsx
```

---

## Conclusion

Cette refonte structurelle transforme le pipeline de storyline d'un système "article-centric" vers un système "event-centric". Les bénéfices attendus :

✅ Dates réelles d'événements (pas dates de collecte)  
✅ Déduplication sémantique automatique  
✅ Profondeur historique (événements de 2024-2025)  
✅ Chaîne causale cohérente (événements uniques, pas articles dupliqués)  
✅ Sources multiples par événement (crédibilité)

La complexité additionnelle est justifiée par l'amélioration qualitative majeure du produit.