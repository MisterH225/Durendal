# Pipeline V2 — Plan de Refactorisation du Storyline Engine

> Refactorisation incrémentale de l'existant. Pas de système parallèle.
> Date : 2026-04-14

---

## 0. Audit du code existant

### Cartographie fichier → phase

| Phase pipeline | Fichier(s) | Rôle |
|---|---|---|
| **Point d'entrée SSE** | `app/api/forecast/graph/search/route.ts` | API route GET, SSE stream, `maxDuration=300` |
| **Anchor resolution** | `lib/storyline/builder.ts` — `resolveAnchor()`, `resolveKeywordToEvent()` | Transforme keyword/articleId en `AnchorContext` via Gemini |
| **Retrieval interne** | `lib/storyline/services/hybrid-retrieval.ts` — `retrieveInternalCandidates()` | 5 requêtes Supabase parallèles (signals, ext_signals, forecast_events, intel_events, questions) |
| **Retrieval externe** | `lib/storyline/services/hybrid-retrieval.ts` — `retrieveExternalCandidates()` | 5 fenêtres temporelles Perplexity **séquentielles** |
| **Ranking/pruning** | `lib/storyline/services/candidate-ranking.ts` | Dédup titre, scoring keyword/entité, max 40 candidats |
| **Extraction événements** | `lib/storyline/services/article-extractor.ts` | Batch Gemini (10/batch), extraction date/titre/pertinence |
| **Clustering** | `lib/storyline/services/event-clusterer.ts` | 2-pass : token overlap + LLM borderline |
| **Détection biais récence** | `lib/storyline/services/recency-bias-detector.ts` | Heuristique date-span / ratio recent |
| **Recherche historique** | `lib/storyline/services/historical-searcher.ts` | 2 requêtes Perplexity séquentielles |
| **Analyse causale LLM** | `lib/storyline/services/storyline-analysis.ts` — `analyzeStorylineFromClusters()` | UN appel Gemini+Search, prompt monolithique |
| **Counterfactual check** | `lib/storyline/services/counterfactual-check.ts` | Service complet (7 dimensions), **NON BRANCHÉ dans le pipeline** |
| **Outcome generation** | `lib/storyline/services/outcome-generator.ts` | Fallback conditionnel (`if < 2 outcomes`) |
| **Assemblage** | `lib/storyline/services/storyline-assembler.ts` | Construit `StorylineResult` (cards + edges) |
| **Orchestrateur** | `lib/storyline/builder.ts` — `buildStoryline()` | Séquence phases 0-5, SSE events |
| **Legacy V1** | `buildStorylineV1()`, `analyzeStoryline()`, `assembleStoryline()` | Ancien pipeline candidat-basé, encore présent |

### Types / data contracts

| Type | Fichier | Rôle |
|---|---|---|
| `AnchorContext` | `hybrid-retrieval.ts:35-44` | Input pour tout le pipeline |
| `CandidateItem` | `lib/graph/types.ts:269-283` | Résultat brut du retrieval |
| `ExtractedEvent` | `lib/storyline/types/event-extraction.ts` | Sortie de l'extraction LLM |
| `EventCluster` | `lib/storyline/types/event-cluster.ts` | Groupe d'événements dédupliqués |
| `StorylineAnalysis` | `lib/graph/types.ts:312-317` | Sortie de l'analyse LLM (timeline + outcomes + narrative) |
| `StorylineAnalysisEntry` | `lib/graph/types.ts:285-300` | Une entrée de timeline analysée |
| `StorylineCard` | `lib/graph/types.ts:208-234` | Noeud du graphe final |
| `StorylineEdge` | `lib/graph/types.ts:236-246` | Arête du graphe final |
| `StorylineResult` | `lib/graph/types.ts:248-258` | Résultat complet envoyé au frontend |
| `CounterfactualCheckInput/Result` | `lib/graph/types.ts:357-384` | Types pour le service CF (non branché) |

### Modules centraux vs wrappers

**Centraux** (logique métier substantielle) :
- `hybrid-retrieval.ts` — logique de requête multi-source
- `article-extractor.ts` — extraction structurée par LLM
- `event-clusterer.ts` — algorithme de clustering 2-pass
- `storyline-analysis.ts` — prompt engineering causal
- `counterfactual-check.ts` — scoring causal multi-dimensionnel
- `storyline-assembler.ts` — construction du graphe cards/edges

**Wrappers / utilitaires** :
- `candidate-ranking.ts` — scoring simple, pas de logique complexe
- `recency-bias-detector.ts` — 20 lignes de heuristique date
- `historical-searcher.ts` — wrapper autour de Perplexity
- `outcome-generator.ts` — prompt + fallback

### Comment React Flow consomme les données

1. `route.ts` envoie des SSE events
2. `GraphExplorerClient.tsx` consomme le SSE via `EventSource`
3. `storylineToGraphResult()` (dans `GraphExplorerClient.tsx`) transforme `StorylineResult` → `IntelligenceGraphNode[]` + `IntelligenceGraphEdge[]`
4. `GraphCanvas.tsx` → `layoutStorylineCards()` calcule les positions x/y
5. `IntelNode.tsx` rend chaque noeud

**Fait observé** : React Flow ne porte pas de logique métier. La transformation `StorylineResult → GraphSearchResult` est déjà dans le client. C'est correct.

**Fait observé** : Le layout (positionnement x/y) est calculé côté frontend dans `GraphCanvas.tsx`. Ce n'est pas critique car c'est purement du rendu.

### Structures de données inter-phases

```
AnchorContext
    → retrieveInternalCandidates()  → CandidateItem[]
    → retrieveExternalCandidates()  → CandidateItem[]
        → rankAndPruneCandidates()  → CandidateItem[] (scored)
            → extractEventsFromCandidates() → ExtractedEvent[]
                → clusterEvents()           → EventCluster[]
                    → analyzeStorylineFromClusters() → StorylineAnalysis
                        → assembleStorylineFromClusters() → StorylineResult
```

---

## 1. Diagnostic architectural

### 1.1 — Causal analysis monolithique et linéaire

**Problème central** : `analyzeStorylineFromClusters()` fait UN SEUL appel LLM qui doit simultanément :
- classifier 25 clusters
- construire une chaîne linéaire (trunk)
- identifier les corollaires
- fournir les articles sources
- générer 3 outcomes
- rédiger un narratif

C'est trop pour un seul prompt. Le LLM prend des raccourcis :
- Il assigne `causal` à tout ce qui est `before` temporellement
- Il ne produit pas toujours les outcomes
- Les corollaires sont sous-détectés

**Le modèle linéaire (A→B→C→Anchor)** est structurellement incapable de représenter :
- Deux causes indépendantes qui convergent vers un effet
- Un corollaire attaché à un événement non-trunk
- Un contexte historique profond qui n'est pas une cause

### 1.2 — CounterfactualCheckService non branché

Le service existe, il est testé (10 tests passent), il a 7 dimensions de scoring. Mais **il n'est appelé nulle part dans le pipeline V2**. La causalité repose entièrement sur le jugement LLM non vérifié.

### 1.3 — Outcome generation conditionnelle

L'outcome generation est un `if (outcomeCards.length < 2)`. Trois problèmes :
1. Elle dépend du succès de la Phase 4 (qui demande déjà les outcomes)
2. Si Phase 4 produit 2 outcomes médiocres, Phase 5 ne se déclenche pas
3. Le `generateOutcomes()` est un fallback, pas une phase structurante

### 1.4 — Bias detection + historical search faibles

- Le détecteur est purement heuristique (ratio dates < 7 jours)
- La recherche historique fait 2 requêtes Perplexity **séquentielles** avec `recency: 'year'`
- Le merge des clusters historiques fait une comparaison naïve sur 40 chars
- Aucun re-ranking après injection des historiques

### 1.5 — Retrieval externe séquentiel

5 fenêtres Perplexity exécutées en boucle `for...of` = 25-75s de latence évitable. C'est le plus gros goulet.

### 1.6 — Couplage faible mais types pollués

`lib/graph/types.ts` est un fichier fourre-tout (468 lignes) qui mélange :
- Types du graph explorer legacy
- Types du storyline engine
- Types du counterfactual check
- Config visuelle des noeuds/edges

Ce n'est pas un blocage mais c'est un frein à la maintenabilité.

---

## 2. Stratégie de refactor

### Classification des modules

| Module | Décision | Justification |
|---|---|---|
| `hybrid-retrieval.ts` — `retrieveInternalCandidates()` | **KEEP WITH REFACTOR** | La logique est correcte mais les fenêtres externes doivent être parallélisées |
| `hybrid-retrieval.ts` — `retrieveExternalCandidates()` | **REWRITE** | Séquentiel → parallèle. Restructurer les fenêtres temporelles |
| `candidate-ranking.ts` | **KEEP WITH REFACTOR** | Ajouter score minimum + meilleure pondération |
| `article-extractor.ts` | **KEEP** | Le batch processing fonctionne bien |
| `event-clusterer.ts` | **KEEP WITH REFACTOR** | Remplacer la variable globale mutable, ajouter re-clustering post-historique |
| `recency-bias-detector.ts` | **KEEP WITH REFACTOR** | Garder l'heuristique, enrichir avec span-by-category |
| `historical-searcher.ts` | **REWRITE** | Paralléliser, ajouter fenêtres progressives, meilleur merge |
| `storyline-analysis.ts` — `analyzeStorylineFromClusters()` | **REWRITE** | Éclater le prompt monolithique en 3 appels spécialisés |
| `storyline-analysis.ts` — `analyzeStoryline()` (V1) | **DELETE** | Legacy, plus utilisé |
| `counterfactual-check.ts` | **EXTRACT AND REUSE** | Brancher dans le pipeline entre relation detection et assembly |
| `outcome-generator.ts` | **REWRITE** | Phase obligatoire, pas un fallback |
| `storyline-assembler.ts` — `assembleStorylineFromClusters()` | **KEEP WITH REFACTOR** | Adapter pour le modèle graphe (pas chaîne) |
| `storyline-assembler.ts` — `assembleStoryline()` (V1) | **DELETE** | Legacy |
| `builder.ts` — `buildStoryline()` | **REWRITE** | Nouvel orchestrateur avec phases granulaires |
| `builder.ts` — `buildStorylineV1()` | **DELETE** | Legacy |
| `builder.ts` — `resolveAnchor()` | **KEEP** | Fonctionne correctement |
| `lib/graph/types.ts` — types storyline | **KEEP WITH REFACTOR** | Restructurer, ajouter `EventRelation`, séparer les concerns |
| `lib/graph/types.ts` — types counterfactual | **KEEP** | Déjà bien structurés |
| `lib/graph/types.ts` — types graph explorer legacy | **KEEP** | Utilisés par le frontend, ne pas toucher |
| `lib/storyline/types/event-extraction.ts` | **KEEP** | Stable |
| `lib/storyline/types/event-cluster.ts` | **KEEP WITH REFACTOR** | Ajouter champ `relations` |
| Frontend (`GraphExplorerClient`, `GraphCanvas`, `IntelNode`, etc.) | **KEEP WITH REFACTOR** | Adapter la transformation pour le nouveau modèle edge |

### Suppressions explicites planifiées

1. `buildStorylineV1()` dans `builder.ts`
2. `analyzeStoryline()` (V1) dans `storyline-analysis.ts`
3. `assembleStoryline()` (V1) dans `storyline-assembler.ts`
4. `matchCandidateToAnalysis()`, `inferCardType()`, `resolveTemporalPosition()`, `inferPositionFromDate()`, `buildFallbackAnalysis()` — toutes les fonctions V1

---

## 3. Pipeline V2 proposé

```
Entrée utilisateur (keyword / articleId)
│
├─ 1. Anchor Resolution                    [KEEP]
│     builder.ts → resolveAnchor()
│
├─ 2. Hybrid Retrieval                     [REFACTOR]
│     hybrid-retrieval.ts
│     • Supabase interne (parallèle, 5 tables)
│     • Perplexity externe (parallèle, 5 fenêtres)   ← CHANGEMENT
│
├─ 3. Candidate Ranking                    [KEEP WITH REFACTOR]
│     candidate-ranking.ts
│     • Score minimum = 5
│     • MAX_CANDIDATES = 40
│
├─ 4. Event Extraction                     [KEEP]
│     article-extractor.ts
│     • Batch LLM (10/batch, 2 en parallèle)
│
├─ 5. Event Clustering                     [KEEP WITH REFACTOR]
│     event-clusterer.ts
│     • Token overlap + LLM borderline
│     • ID sans variable globale mutable
│
├─ 6. Historical Expansion                 [REWRITE]
│     historical-searcher.ts + recency-bias-detector.ts
│     • Détection biais → recherche progressive
│     • Re-extraction + re-clustering des historiques
│     • Re-ranking unifié post-merge
│
├─ 7. Relation Graph Building              [NEW — remplace storyline-analysis monolithique]
│     NEW: relation-detector.ts
│     Trois sous-phases :
│     ├─ 7a. Temporal Linking (déterministe, sans LLM)
│     ├─ 7b. Causal Candidate Detection (LLM)
│     └─ 7c. Corollary / Response / Spillover Detection (LLM)
│
├─ 8. Counterfactual Causal Scoring        [EXTRACT AND REUSE]
│     counterfactual-check.ts ← déjà écrit, juste brancher
│     • Post-process les relations causales de 7b
│     • Downgrade ou upgrade
│
├─ 9. Mandatory Outcome Generation         [REWRITE]
│     outcome-generator.ts
│     • Phase obligatoire (pas fallback)
│     • Entrées : anchor + clusters analysés + relations
│     • 2-3 outcomes avec evidence for/against
│
├─ 10. Storyline Assembly                  [REFACTOR]
│      storyline-assembler.ts
│      • Accepte un graphe de relations (pas une chaîne)
│      • Produit StorylineResult avec edges multi-catégorie
│
├─ 11. Narrative Generation                [EXTRACTED FROM analysis]
│      NEW: narrative-generator.ts
│      • Dernier appel LLM, prend le graphe assemblé
│      • Génère le narratif en français
│
└─ 12. SSE Projection                      [KEEP]
       route.ts → stream events
```

### Détail par phase

#### Phase 1 — Anchor Resolution
- **Responsabilité** : Transformer l'entrée utilisateur en contexte structuré
- **Input** : `{ query?: string, articleId?: string }`
- **Output** : `AnchorContext`
- **Module** : `builder.ts:resolveAnchor()` — INCHANGÉ
- **Ce qui change** : Rien

#### Phase 2 — Hybrid Retrieval
- **Responsabilité** : Collecter les candidats bruts depuis toutes les sources
- **Input** : `AnchorContext`
- **Output** : `CandidateItem[]`
- **Module** : `hybrid-retrieval.ts`
- **Ce qui change** :
  - `retrieveExternalCandidates()` passe de boucle `for...of` à `Promise.allSettled()` sur les 5 fenêtres
  - Gain latence estimé : ~60% (5 appels en parallèle au lieu de séquentiels)

#### Phase 3 — Candidate Ranking
- **Responsabilité** : Déduplication et scoring
- **Input** : `CandidateItem[]`
- **Output** : `CandidateItem[]` (scored, pruned)
- **Module** : `candidate-ranking.ts`
- **Ce qui change** : Ajout d'un score minimum (candidats avec score < 5 éliminés)

#### Phase 4 — Event Extraction
- **Responsabilité** : Extraire les événements structurés des candidats
- **Input** : `CandidateItem[]`, `anchorTitle`
- **Output** : `ExtractedEvent[]`
- **Module** : `article-extractor.ts` — INCHANGÉ

#### Phase 5 — Event Clustering
- **Responsabilité** : Grouper les événements dédupliqués
- **Input** : `ExtractedEvent[]`
- **Output** : `EventCluster[]`
- **Module** : `event-clusterer.ts`
- **Ce qui change** : Remplacer `let clusterSeq = 0` par UUID, ajouter export `reclusterMerged()`

#### Phase 6 — Historical Expansion
- **Responsabilité** : Combler le déficit temporel si recency bias détecté
- **Input** : `EventCluster[]`, `AnchorContext`
- **Output** : `EventCluster[]` (enrichis)
- **Modules** : `recency-bias-detector.ts` + `historical-searcher.ts`
- **Ce qui change** :
  - Recherche historique parallélisée (les 2 requêtes Perplexity)
  - Re-extraction et re-clustering des résultats historiques
  - **Nouveau** : re-ranking unifié sur l'ensemble (anciens + historiques)
  - **Nouveau** : reclustering cross (historiques vs récents) pour éviter les doublons

#### Phase 7 — Relation Graph Building (NOUVEAU — remplace le prompt monolithique)
- **Responsabilité** : Construire le graphe de relations entre les clusters
- **Input** : `EventCluster[]`, `AnchorContext`
- **Output** : `EventRelation[]`
- **Module** : NOUVEAU `lib/storyline/services/relation-detector.ts`

Se décompose en 3 sous-phases :

##### 7a. Temporal Linking (déterministe, SANS LLM)
```
Pour chaque paire (clusterA, clusterB) où dateA < dateB :
  - diffDays = dateB - dateA
  - if diffDays <= 3 → immediate_precursor
  - if diffDays <= 30 → before
  - if diffDays <= 365 → long_term_precursor
  - if concurrent → concurrent_with
```
- **Coût LLM** : 0
- **Output** : `EventRelation[]` avec `category: 'temporal'`

##### 7b. Causal Candidate Detection (LLM)
Un appel LLM spécialisé pour les seuls clusters qui sont en relation temporelle `before` ou `immediate_precursor` avec un autre cluster.

Le prompt :
- Reçoit les paires candidates
- Pour chaque paire, doit identifier si c'est `causes`, `contributes_to`, `enables`, `triggers`, `prevents`, ou `not_causal`
- Doit fournir une evidence causale
- Doit identifier le mécanisme

- **Output** : `EventRelation[]` avec `category: 'causal'` et `mechanismEvidence`

##### 7c. Corollary / Response / Spillover Detection (LLM)
Un appel LLM séparé pour les clusters qui sont en relation temporelle `after` ou `concurrent_with`.

Le prompt :
- Reçoit les paires candidates
- Pour chaque paire, doit identifier si c'est `response_to`, `spillover_from`, `retaliation_to`, `market_reaction_to`, `policy_reaction_to`, `parallel_development`, ou `unrelated`

- **Output** : `EventRelation[]` avec `category: 'corollary'`

#### Phase 8 — Counterfactual Causal Scoring
- **Responsabilité** : Vérifier et corriger les labels causaux du LLM
- **Input** : `EventRelation[]` (les causals de 7b), `AnchorContext`, `EventCluster[]`
- **Output** : `EventRelation[]` (avec labels potentiellement downgraded)
- **Module** : `counterfactual-check.ts` — EXISTANT, juste brancher
- **Ce qui change** :
  - Appel `runCounterfactualChecks()` sur toutes les relations `category === 'causal'`
  - `mapCounterfactualToRelation()` pour convertir le label final en relation du graphe

#### Phase 9 — Mandatory Outcome Generation
- **Responsabilité** : Produire 2-3 outcomes systématiquement
- **Input** : `AnchorContext`, `EventCluster[]`, `EventRelation[]`
- **Output** : `OutcomePrediction[]`
- **Module** : `outcome-generator.ts` — REWRITE
- **Ce qui change** :
  - N'est plus conditionnel
  - Reçoit les relations causales vérifiées comme contexte
  - Structure de sortie enrichie (confidence, status)

#### Phase 10 — Storyline Assembly
- **Responsabilité** : Construire le `StorylineResult` final
- **Input** : `AnchorContext`, `EventCluster[]`, `EventRelation[]`, `OutcomePrediction[]`
- **Output** : `StorylineResult`
- **Module** : `storyline-assembler.ts` — REFACTOR
- **Ce qui change** :
  - N'attend plus un `StorylineAnalysis` (structure linéaire)
  - Consomme des `EventRelation[]` directement
  - Edges multi-catégorie (pas forcé en chaîne)

#### Phase 11 — Narrative Generation (NOUVEAU — extrait de analysis)
- **Responsabilité** : Générer le narratif textuel
- **Input** : `StorylineResult`
- **Output** : `string` (narrative en français)
- **Module** : NOUVEAU `lib/storyline/services/narrative-generator.ts`
- **Ce qui change** : Séparé de l'analyse causale. Dernier appel LLM, purement rédactionnel.

#### Phase 12 — SSE Projection
- **Responsabilité** : Streamer les résultats progressifs
- **Module** : `route.ts` — INCHANGÉ côté API, adaptation des événements SSE

---

## 4. Refactor des relations

### Modèle actuel (problème)

```
StorylineAnalysisEntry {
  relationCategory: 'causal' | 'contextual' | 'corollary'
  relationSubtype: string
  causalConfidence: number
  causalEvidence: string
  isCorollary: boolean
  chainPredecessorRef: string  // ← forçage linéaire
}
```

Le `chainPredecessorRef` impose une structure de chaîne. Chaque noeud a UN prédécesseur.

### Modèle cible

```typescript
interface EventRelation {
  id: string
  sourceClusterId: string
  targetClusterId: string

  // Classification multi-couche
  temporalRelation: TemporalSubtype         // TOUJOURS renseigné
  semanticCategory: RelationCategory         // causal | contextual | corollary | outcome
  semanticSubtype: RelationSubtype           // causes | spillover_from | etc.

  // Scoring
  confidence: number                         // [0,1]
  mechanismEvidence: string                  // pour les causals
  counterfactualScore?: number               // si passé par le CF check

  // Metadata
  wasDowngraded: boolean
  originalLlmLabel?: string
  explanation: string
}
```

**Changements clés** :
1. **Séparation temporel / sémantique** : Chaque relation a TOUJOURS un `temporalRelation` (déterministe) ET un `semanticCategory` (LLM + CF check)
2. **Pas de `chainPredecessorRef`** : Les relations sont des arêtes d'un graphe, pas les maillons d'une chaîne
3. **`wasDowngraded` + `originalLlmLabel`** : Traçabilité du counterfactual check
4. **`mechanismEvidence`** : Obligatoire pour toute relation causale

### Comment les relations vivent dans le pipeline

```
Phase 7a → EventRelation[] avec temporalRelation renseigné, semanticCategory = 'temporal'
Phase 7b → Certaines relations upgrade vers semanticCategory = 'causal'
Phase 7c → Ajout de relations semanticCategory = 'corollary'
Phase 8  → Les 'causal' passent par le CF check, certaines downgrade vers 'contextual' ou 'temporal'
Phase 10 → L'assembleur consomme toutes les EventRelation[] pour construire les edges
```

---

## 5. Historical expansion

### Architecture cible

```
detectRecencyBias(clusters)
  │
  ├─ hasRecencyBias = true
  │    │
  │    ├─ searchHistoricalContext()     // parallèle, 3 fenêtres
  │    │    ├─ window: "1-6 months ago"     (recency: month)
  │    │    ├─ window: "6-24 months ago"    (recency: year)
  │    │    └─ window: "2-10 years ago"     (recency: year, prompt "deep historical")
  │    │
  │    ├─ extractEventsFromCandidates()    // réutilise Phase 4
  │    ├─ clusterEvents()                  // réutilise Phase 5
  │    │
  │    ├─ reclusterMerged(existingClusters, newClusters)   // NOUVEAU
  │    │    Cross-clustering pour éviter doublons
  │    │
  │    └─ reRankByExplanatoryValue()       // NOUVEAU
  │         Score = keywordMatch * 0.3 + entityOverlap * 0.3 + temporalDistance * 0.2 + sourceQuality * 0.2
  │
  └─ hasRecencyBias = false
       → pass through
```

### Comment différencier background context et real cause

Ce n'est PAS le rôle de la phase historique. C'est le rôle de la Phase 7b (causal detection) + Phase 8 (counterfactual check).

La phase historique se contente de :
1. Détecter le manque de profondeur temporelle
2. Chercher des événements historiquement pertinents
3. Les injecter dans le pool de clusters

La classification causale vs contextuelle est faite ENSUITE par le pipeline de relations.

---

## 6. Counterfactual causal scoring

### Point d'insertion dans le pipeline

```
Phase 7b (Causal Candidate Detection)
    │
    ▼ EventRelation[] where semanticCategory === 'causal'
    │
Phase 8 (Counterfactual Scoring)         ← ICI
    │
    ▼ EventRelation[] avec labels vérifiés
```

### Inputs

Pour chaque `EventRelation` avec `semanticCategory === 'causal'` :

```typescript
{
  anchorTitle: anchor.title,
  anchorSummary: anchor.summary,
  anchorDate: anchor.date,
  anchorEntities: anchor.entities,
  candidateTitle: sourceCluster.canonicalTitle,
  candidateSummary: sourceCluster.summary,
  candidateDate: sourceCluster.eventDate,
  candidateEntities: sourceCluster.entities,
  candidateRegions: sourceCluster.regionTags,
  candidateSectors: sourceCluster.sectorTags,
  temporalRelation: relation.temporalRelation,
  llmRelationCategory: 'causal',
  llmRelationSubtype: relation.semanticSubtype,
  llmCausalConfidence: relation.confidence,
  llmCausalEvidence: relation.mechanismEvidence,
  llmExplanation: relation.explanation,
  competingCauses: [/* autres relations causales vers la même cible */],
}
```

### Outputs

`CounterfactualCheckResult` par relation, contenant :
- `finalLabel`: `'triggers'` | `'likely_cause'` | `'contributes_to'` | `'background_context'` | `'preceded_by'` | etc.
- `wasDowngraded`: boolean
- `confidence`: number

### Logique de downgrade

```
LLM dit "causes" + CF score composite < 0.35  →  downgrade à 'background_context'
LLM dit "causes" + CF score composite < 0.15  →  downgrade à 'preceded_by' (temporel pur)
LLM dit "triggers" + mechanism score < 0.5    →  downgrade à 'contributes_to'
LLM dit "contributes_to" + CF score > 0.55    →  upgrade à 'likely_cause'
```

### Mapping retour vers EventRelation

```typescript
function applyCounterfactualResult(
  relation: EventRelation,
  cfResult: CounterfactualCheckResult,
): EventRelation {
  const mapped = mapCounterfactualToRelation(cfResult.finalLabel)
  return {
    ...relation,
    semanticCategory: mapped.category,
    semanticSubtype: mapped.subtype as RelationSubtype,
    confidence: cfResult.confidence,
    counterfactualScore: cfResult.scores.composite,
    wasDowngraded: cfResult.wasDowngraded,
    originalLlmLabel: `${relation.semanticCategory}/${relation.semanticSubtype}`,
  }
}
```

---

## 7. Outcome generation refactor

### Changement structurel

**Avant** : `if (outcomeCards.length < 2) { generateOutcomes() }`
**Après** : Phase 9 obligatoire, toujours exécutée.

### Input enrichi

```typescript
interface OutcomeGenerationContext {
  anchor: AnchorContext
  clusters: EventCluster[]
  relations: EventRelation[]       // ← NOUVEAU : les relations vérifiées
  causalDrivers: EventCluster[]    // clusters avec relation causale vers anchor
  corollaryEvents: EventCluster[]  // clusters corollaires
  narrative?: string
}
```

### Output enrichi

```typescript
interface OutcomePrediction {
  id: string
  title: string
  probability: number
  probabilitySource: 'ai_estimate' | 'crowd' | 'blended' | 'market'
  confidenceLevel: 'high' | 'medium' | 'low'
  reasoning: string
  timeHorizon: 'days' | 'weeks' | '1-3 months' | '3-12 months'
  supportingEvidence: string[]
  contradictingEvidence: string[]
  status: 'open' | 'unfolding' | 'occurred' | 'did_not_occur' | 'expired'

  // Liens vers les drivers
  drivenByClusterIds: string[]
  raisedByRelationIds: string[]
  loweredByRelationIds: string[]
}
```

### Comment éviter les outcomes génériques

1. **Le prompt reçoit les relations causales vérifiées**, pas juste les titres des clusters
2. **Le prompt demande des outcomes SPÉCIFIQUES** : pas "tensions increase" mais "Iran ferme le détroit d'Ormuz pendant 72h provoquant une hausse du Brent à 120$/baril"
3. **Chaque outcome doit citer au moins 1 supporting evidence** issue des clusters
4. **Validation post-LLM** : si un outcome ne contient pas de supporting evidence, il est marqué `confidenceLevel: 'low'`
5. **Les outcomes doivent être mutuellement exclusifs ou complémentaires** — le prompt l'impose

---

## 8. Storyline assembly

### Changement structurel

L'assembleur actuel attend un `StorylineAnalysis` avec une `timeline[]` (structure linéaire).
Le nouvel assembleur prend un graphe de relations.

### Input

```typescript
function assembleStorylineGraph(
  anchor: AnchorContext,
  clusters: EventCluster[],
  relations: EventRelation[],
  outcomes: OutcomePrediction[],
  narrative: string,
): StorylineResult
```

### Algorithme d'assemblage

```
1. Créer la card anchor

2. Pour chaque cluster, créer une StorylineCard :
   - cardType inféré du cluster
   - temporalPosition inférée de la date vs anchor
   - isTrunk = cluster a une relation causale vers anchor (directe ou transitive)
   - isCorollary = cluster a une relation corollary
   - importance = f(nombre de relations, confiance causale)

3. Pour chaque EventRelation, créer un StorylineEdge :
   - relationCategory et relationSubtype directement depuis la relation
   - confidence depuis la relation (post-CF check)
   - causalEvidence si disponible
   - isTrunk = la relation est sur le chemin causal vers anchor

4. Pour chaque OutcomePrediction, créer une card outcome :
   - probability, probabilitySource, supportingEvidence, contradictingEvidence
   - Edge: anchor → outcome (may_lead_to)
   - Edges optionnels: driver clusters → outcome (raises_probability_of / lowers_probability_of)

5. Calculer sortOrder :
   - deep_past < past < recent < anchor < concurrent < consequence < future
   - À position égale, trier par date puis importance

6. Attacher le narrative
```

### Trunk detection (graphe, pas chaîne)

```typescript
function detectTrunkNodes(
  anchorClusterId: string,
  relations: EventRelation[],
): Set<string> {
  // BFS inversé depuis anchor sur les relations causales
  const trunk = new Set<string>([anchorClusterId])
  const queue = [anchorClusterId]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const rel of relations) {
      if (rel.targetClusterId === current &&
          rel.semanticCategory === 'causal' &&
          !trunk.has(rel.sourceClusterId)) {
        trunk.add(rel.sourceClusterId)
        queue.push(rel.sourceClusterId)
      }
    }
  }

  return trunk
}
```

Ce n'est plus une chaîne A→B→C mais un **DAG** (directed acyclic graph) où deux causes indépendantes peuvent converger vers le même effet.

---

## 9. Impact frontend / React Flow

### Ce qui change côté frontend

**Rien de structurel.** Le frontend reçoit déjà un `StorylineResult` (cards + edges) et le projette. Les changements sont :

1. **Plus d'edges** : Le modèle graphe produit plus d'edges que la chaîne linéaire
2. **Edges typés plus finement** : `wasDowngraded`, `counterfactualScore` dans les metadata
3. **Cards outcome enrichies** : `confidenceLevel`, `status`, `drivenByClusterIds`

### Shape des nodes (inchangé)

```typescript
interface IntelligenceGraphNode {
  id: string
  type: GraphNodeType          // 'event' | 'article' | 'outcome' | 'context'
  label: string                // titre
  subtitle?: string            // date
  summary?: string             // résumé
  score?: number               // importance
  probability?: number         // pour outcomes
  metadata?: {
    clusterSize?: number
    eventDateConfidence?: string
    isTrunk?: boolean
    isCorollary?: boolean
    confidenceLevel?: string   // NOUVEAU pour outcomes
    outcomeStatus?: string     // NOUVEAU
  }
}
```

### Shape des edges (enrichi)

```typescript
interface IntelligenceGraphEdge {
  id: string
  source: string
  target: string
  type: GraphEdgeType
  weight?: number
  confidence?: number
  explanation?: string
  metadata?: {
    wasDowngraded?: boolean       // NOUVEAU
    counterfactualScore?: number  // NOUVEAU
    originalLabel?: string        // NOUVEAU
    mechanismEvidence?: string    // NOUVEAU
  }
}
```

### Layout

Le layout dans `GraphCanvas.tsx` (`layoutStorylineCards`) fonctionne déjà avec des positions basées sur `temporalPosition` et `isTrunk/isCorollary`. **Il s'adaptera naturellement** à un graphe plus riche car il ne dépend pas de la structure chaîne.

---

## 10. Data contracts et types

### Types à ajouter / refactorer

```typescript
// ── lib/storyline/types/event-relation.ts ────────────────────────────

export interface EventRelation {
  id: string
  sourceClusterId: string
  targetClusterId: string

  temporalRelation: TemporalSubtype
  semanticCategory: RelationCategory
  semanticSubtype: RelationSubtype

  confidence: number
  mechanismEvidence: string
  counterfactualScore?: number

  wasDowngraded: boolean
  originalLlmLabel?: string
  explanation: string
}

// ── lib/storyline/types/outcome-prediction.ts ────────────────────────

export type OutcomeStatus = 'open' | 'unfolding' | 'occurred' | 'did_not_occur' | 'expired'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface OutcomePrediction {
  id: string
  title: string
  probability: number
  probabilitySource: 'ai_estimate' | 'crowd' | 'blended' | 'market'
  confidenceLevel: ConfidenceLevel
  reasoning: string
  timeHorizon: 'days' | 'weeks' | '1-3 months' | '3-12 months'
  supportingEvidence: string[]
  contradictingEvidence: string[]
  status: OutcomeStatus
  drivenByClusterIds: string[]
  raisedByRelationIds: string[]
  loweredByRelationIds: string[]
}

// ── lib/storyline/types/storyline-graph.ts ───────────────────────────

export interface StorylineNode {
  clusterId: string
  card: StorylineCard
  incomingRelations: string[]   // relation IDs
  outgoingRelations: string[]   // relation IDs
  isTrunk: boolean
  depth: number                 // distance from anchor in causal graph
}

export interface StorylineGraph {
  anchor: AnchorContext
  nodes: Map<string, StorylineNode>
  relations: EventRelation[]
  outcomes: OutcomePrediction[]
  narrative: string
  metadata: {
    totalClusters: number
    totalRelations: number
    causalChainDepth: number
    historicalExpansionApplied: boolean
    counterfactualChecksRun: number
    counterfactualDowngrades: number
  }
}
```

### Types existants conservés

- `ExtractedEvent` — INCHANGÉ
- `EventCluster` — INCHANGÉ
- `AnchorContext` — INCHANGÉ
- `CandidateItem` — INCHANGÉ
- `StorylineCard` — INCHANGÉ (c'est la projection finale)
- `StorylineEdge` — INCHANGÉ
- `StorylineResult` — INCHANGÉ (c'est ce que le frontend consomme)
- `CounterfactualCheckInput/Result` — INCHANGÉ
- `StorylineSSEEvent` — INCHANGÉ

### Types à supprimer

- `StorylineAnalysis` — remplacé par `EventRelation[]` + `OutcomePrediction[]`
- `StorylineAnalysisEntry` — remplacé par `EventRelation`
- `StorylineOutcome` — remplacé par `OutcomePrediction`

**Note migration** : `StorylineAnalysis` sera conservé temporairement dans le code pour la compatibilité du fallback, puis supprimé.

---

## 11. Plan de migration

### Ordre des refactors

| Étape | Fichier(s) | Changement | Risque | Checkpoint |
|-------|-----------|-----------|--------|-----------|
| **M1** | `lib/storyline/types/event-relation.ts` | Créer `EventRelation`, `OutcomePrediction` | Nul | Types compilent |
| **M2** | `hybrid-retrieval.ts` | Paralléliser `retrieveExternalCandidates` | Faible | Même résultats, ~60% plus rapide |
| **M3** | `event-clusterer.ts` | Remplacer `clusterSeq` par crypto UUID, ajouter `reclusterMerged()` | Faible | Tests de clustering passent |
| **M4** | `historical-searcher.ts` | Paralléliser, 3 fenêtres, meilleur merge | Faible | Résultats historiques plus riches |
| **M5** | `relation-detector.ts` | NOUVEAU service : temporal + causal + corollary detection | Moyen | Tests de classification |
| **M6** | `builder.ts` | Brancher `relation-detector` + `counterfactual-check` dans le pipeline | Élevé | Pipeline complet fonctionne |
| **M7** | `outcome-generator.ts` | Rendre obligatoire, enrichir inputs/outputs | Moyen | Outcomes systématiques |
| **M8** | `storyline-assembler.ts` | Adapter pour `EventRelation[]` au lieu de `StorylineAnalysis` | Élevé | Graphe final correct |
| **M9** | `narrative-generator.ts` | Extraire le narratif dans un service dédié | Faible | Narratif généré |
| **M10** | `builder.ts` | Supprimer V1, nettoyer | Faible | Code V1 absent |
| **M11** | `storyline-analysis.ts` | Supprimer `analyzeStoryline()` V1, garder temporairement `analyzeStorylineFromClusters()` comme fallback | Moyen | Fallback fonctionne |
| **M12** | `storyline-analysis.ts` | Supprimer complètement quand M5-M8 sont stables | Faible | Plus de legacy |
| **M13** | `lib/graph/types.ts` | Supprimer `StorylineAnalysis`, `StorylineAnalysisEntry`, `StorylineOutcome` | Faible | Compile |
| **M14** | Frontend | Adapter `storylineToGraphResult()` pour les metadata enrichies | Faible | UI fonctionne |

### Compatibilité temporaire

Pendant M5-M8, le builder aura deux chemins :
```typescript
try {
  // Nouveau pipeline (relations → CF → assembly)
  const relations = await detectRelations(clusters, anchor)
  const verified = applyCounterfactualChecks(relations, anchor, clusters)
  // ...
} catch (err) {
  // Fallback temporaire vers l'ancien analyzeStorylineFromClusters
  console.warn('[builder] V2 relation pipeline failed, falling back to V1.5')
  const analysis = await analyzeStorylineFromClusters(anchor, clusters)
  return assembleStorylineFromClusters(anchor, clusters, analysis)
}
```

Ce fallback sera supprimé à M12.

---

## 12. Tests

### Stratégie

| Catégorie | Fichier test | Ce qui est testé |
|-----------|-------------|-----------------|
| **Temporal linking** | `relation-detector.test.ts` | Calcul déterministe des relations temporelles |
| **Causal classification** | `relation-detector.test.ts` | Labels causaux du LLM (mock) |
| **CF downgrade** | `counterfactual-check.test.ts` | **EXISTE DÉJÀ** — 10 tests passent |
| **CF intégration** | `counterfactual-integration.test.ts` | CF branché dans le pipeline avec vrais clusters |
| **Historical expansion** | `historical-searcher.test.ts` | Détection bias + merge + re-clustering |
| **Outcome generation** | `outcome-generator.test.ts` | Phase obligatoire, structure de sortie |
| **Assembly** | `storyline-assembler.test.ts` | Trunk detection (DAG), edges multi-catégorie, outcome cards |
| **Relation model** | `event-relation.test.ts` | Validation des types, séparation temporel/causal |
| **SSE shape** | `sse-projection.test.ts` | Format des events SSE, compatibilité frontend |
| **E2E pipeline** | `builder.integration.test.ts` | Pipeline complet avec mocks LLM |

### Tests prioritaires (existants à conserver)

- `counterfactual-check.test.ts` — **10 tests, tous passent**. Conserver et étendre.

### Nouveaux tests critiques

```typescript
// relation-detector.test.ts
describe('temporal linking', () => {
  test('events 2 days apart → immediate_precursor')
  test('events 45 days apart → before')
  test('events 400 days apart → long_term_precursor')
  test('same-day events → concurrent_with')
  test('post-anchor events → after')
})

describe('causal vs temporal', () => {
  test('UN summit before war ≠ causes war')
  test('sanctions before retaliation = causes')
  test('background treaty = contextual, not causal')
})

// outcome-generator.test.ts
describe('mandatory outcomes', () => {
  test('always produces >= 2 outcomes')
  test('each outcome has supporting evidence')
  test('probabilities sum <= 1.0')
  test('no generic "tensions increase" outcomes')
})

// storyline-assembler.test.ts
describe('graph assembly', () => {
  test('trunk detected via BFS on causal relations')
  test('two independent causes can converge')
  test('corollary attached to correct trunk node')
  test('outcomes connected to anchor')
})
```

---

## 13. Implémentation concrète

### Structure de dossiers (changements)

```
lib/storyline/
├── builder.ts                          [REWRITE]
├── types/
│   ├── index.ts                        [REFACTOR: ajouter exports]
│   ├── event-extraction.ts             [KEEP]
│   ├── event-cluster.ts                [KEEP]
│   ├── event-relation.ts               [NEW]
│   └── outcome-prediction.ts           [NEW]
├── services/
│   ├── hybrid-retrieval.ts             [REFACTOR]
│   ├── candidate-ranking.ts            [REFACTOR minor]
│   ├── article-extractor.ts            [KEEP]
│   ├── event-clusterer.ts              [REFACTOR minor]
│   ├── recency-bias-detector.ts        [REFACTOR minor]
│   ├── historical-searcher.ts          [REWRITE]
│   ├── relation-detector.ts            [NEW]
│   ├── counterfactual-check.ts         [KEEP — brancher]
│   ├── outcome-generator.ts            [REWRITE]
│   ├── storyline-assembler.ts          [REFACTOR]
│   ├── narrative-generator.ts          [NEW]
│   ├── storyline-analysis.ts           [DELETE après migration]
│   └── __tests__/
│       ├── counterfactual-check.test.ts    [KEEP]
│       ├── relation-detector.test.ts       [NEW]
│       ├── outcome-generator.test.ts       [NEW]
│       ├── storyline-assembler.test.ts     [NEW]
│       └── builder.integration.test.ts     [NEW]
```

### Pseudocode — relation-detector.ts

```typescript
import type { EventCluster } from '../types/event-cluster'
import type { EventRelation } from '../types/event-relation'
import type { AnchorContext } from './hybrid-retrieval'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

// ── 7a. Temporal linking (déterministe) ──────────────────────────────

export function buildTemporalRelations(
  clusters: EventCluster[],
  anchor: AnchorContext,
): EventRelation[] {
  const relations: EventRelation[] = []
  const anchorDate = anchor.date ?? new Date().toISOString().slice(0, 10)

  for (const cluster of clusters) {
    if (!cluster.eventDate) continue
    const diffDays = dateDiffDays(cluster.eventDate, anchorDate)

    let temporalRelation: TemporalSubtype
    if (diffDays > 365) temporalRelation = 'long_term_precursor'
    else if (diffDays > 0) temporalRelation = diffDays <= 3 ? 'immediate_precursor' : 'before'
    else if (diffDays < 0) temporalRelation = 'after'
    else temporalRelation = 'concurrent_with'

    relations.push({
      id: crypto.randomUUID(),
      sourceClusterId: cluster.clusterId,
      targetClusterId: '__anchor__',
      temporalRelation,
      semanticCategory: 'temporal',
      semanticSubtype: temporalRelation,
      confidence: cluster.eventDateConfidence === 'high' ? 0.9 : 0.6,
      mechanismEvidence: '',
      wasDowngraded: false,
      explanation: `${cluster.canonicalTitle} — ${Math.abs(diffDays)} jours ${diffDays > 0 ? 'avant' : 'après'} l'ancre`,
    })
  }

  // Inter-cluster temporal relations (optional, pour les paires proches)
  // ...

  return relations
}

// ── 7b. Causal candidate detection (LLM) ────────────────────────────

export async function detectCausalRelations(
  clusters: EventCluster[],
  temporalRelations: EventRelation[],
  anchor: AnchorContext,
): Promise<EventRelation[]> {
  // Sélectionner les clusters "before" ou "immediate_precursor"
  const precursors = temporalRelations
    .filter(r => r.temporalRelation === 'before' || r.temporalRelation === 'immediate_precursor')
    .map(r => r.sourceClusterId)

  const precursorClusters = clusters.filter(c => precursors.includes(c.clusterId))
  if (precursorClusters.length === 0) return []

  const prompt = buildCausalDetectionPrompt(precursorClusters, anchor)
  const { text } = await callGemini(prompt, { maxOutputTokens: 4000, temperature: 0.1 })
  const parsed = parseGeminiJson<CausalDetectionResult>(text)

  return (parsed?.relations ?? []).map(r => ({
    id: crypto.randomUUID(),
    sourceClusterId: r.clusterId,
    targetClusterId: '__anchor__',
    temporalRelation: temporalRelations.find(tr => tr.sourceClusterId === r.clusterId)?.temporalRelation ?? 'before',
    semanticCategory: 'causal' as const,
    semanticSubtype: r.subtype,
    confidence: r.confidence,
    mechanismEvidence: r.mechanism,
    wasDowngraded: false,
    explanation: r.explanation,
  }))
}

// ── 7c. Corollary detection (LLM) ──────────────────────────────────

export async function detectCorollaryRelations(
  clusters: EventCluster[],
  temporalRelations: EventRelation[],
  anchor: AnchorContext,
): Promise<EventRelation[]> {
  const postAnchor = temporalRelations
    .filter(r => r.temporalRelation === 'after' || r.temporalRelation === 'concurrent_with')
    .map(r => r.sourceClusterId)

  const corollaryCandidates = clusters.filter(c => postAnchor.includes(c.clusterId))
  if (corollaryCandidates.length === 0) return []

  const prompt = buildCorollaryDetectionPrompt(corollaryCandidates, anchor)
  const { text } = await callGemini(prompt, { maxOutputTokens: 3000, temperature: 0.1 })
  const parsed = parseGeminiJson<CorollaryDetectionResult>(text)

  return (parsed?.relations ?? []).map(r => ({
    id: crypto.randomUUID(),
    sourceClusterId: '__anchor__',
    targetClusterId: r.clusterId,
    temporalRelation: 'after' as const,
    semanticCategory: 'corollary' as const,
    semanticSubtype: r.subtype,
    confidence: r.confidence,
    mechanismEvidence: '',
    wasDowngraded: false,
    explanation: r.explanation,
  }))
}
```

### Pseudocode — builder.ts rewrite (orchestrateur)

```typescript
export async function buildStoryline(
  anchor: AnchorContext,
  stream: StorylineBuilderStream,
): Promise<StorylineResult> {
  // Phase 2: Retrieval
  const [internalCandidates, externalCandidates] = await Promise.all([
    retrieveInternalCandidates(anchor),
    retrieveExternalCandidates(anchor, stream),  // maintenant parallèle
  ])
  const allCandidates = [...internalCandidates, ...externalCandidates]

  // Phase 3: Ranking
  const ranked = rankAndPruneCandidates(allCandidates, anchor.keywords, anchor.entities ?? [])

  // Phase 4: Extraction
  const extractedEvents = await extractEventsFromCandidates(ranked, 30, anchor.title)

  // Phase 5: Clustering
  let clusters = await clusterEvents(extractedEvents)

  // Phase 6: Historical expansion
  const biasResult = detectRecencyBias(clusters)
  if (biasResult.hasRecencyBias) {
    clusters = await expandHistoricalContext(clusters, anchor)
  }

  // Phase 7: Relation graph building
  const temporalRelations = buildTemporalRelations(clusters, anchor)
  const [causalRelations, corollaryRelations] = await Promise.all([
    detectCausalRelations(clusters, temporalRelations, anchor),
    detectCorollaryRelations(clusters, temporalRelations, anchor),
  ])

  let allRelations = [...temporalRelations, ...causalRelations, ...corollaryRelations]

  // Phase 8: Counterfactual check
  allRelations = applyCounterfactualChecks(allRelations, clusters, anchor)

  stream.onEvent({ phase: 'analysis', narrative: '' })

  // Phase 9: Outcome generation (MANDATORY)
  const outcomes = await generateOutcomes({
    anchor,
    clusters,
    relations: allRelations,
  })

  stream.onEvent({ phase: 'outcomes', cards: outcomesToPreviewCards(outcomes) })

  // Phase 10: Assembly
  const storyline = assembleStorylineGraph(anchor, clusters, allRelations, outcomes)

  // Phase 11: Narrative
  storyline.narrative = await generateNarrative(anchor, clusters, allRelations, outcomes)

  stream.onEvent({ phase: 'complete', storyline })
  return storyline
}
```

### Signatures TypeScript des nouvelles fonctions

```typescript
// relation-detector.ts
export function buildTemporalRelations(clusters: EventCluster[], anchor: AnchorContext): EventRelation[]
export async function detectCausalRelations(clusters: EventCluster[], temporalRelations: EventRelation[], anchor: AnchorContext): Promise<EventRelation[]>
export async function detectCorollaryRelations(clusters: EventCluster[], temporalRelations: EventRelation[], anchor: AnchorContext): Promise<EventRelation[]>

// counterfactual integration
export function applyCounterfactualChecks(relations: EventRelation[], clusters: EventCluster[], anchor: AnchorContext): EventRelation[]

// outcome-generator.ts (rewrite)
export async function generateOutcomes(context: OutcomeGenerationContext): Promise<OutcomePrediction[]>

// narrative-generator.ts
export async function generateNarrative(anchor: AnchorContext, clusters: EventCluster[], relations: EventRelation[], outcomes: OutcomePrediction[]): Promise<string>

// storyline-assembler.ts (refactor)
export function assembleStorylineGraph(anchor: AnchorContext, clusters: EventCluster[], relations: EventRelation[], outcomes: OutcomePrediction[]): StorylineResult

// historical-searcher.ts (rewrite)
export async function expandHistoricalContext(clusters: EventCluster[], anchor: AnchorContext): Promise<EventCluster[]>

// event-clusterer.ts (addition)
export async function reclusterMerged(existing: EventCluster[], incoming: EventCluster[]): Promise<EventCluster[]>
```

---

## 14. Livrables finaux

### Pipeline V2 final

```
INPUT: keyword / articleId
    │
    ▼
[1] Anchor Resolution ──────────────── builder.ts:resolveAnchor()
    │
    ▼
[2] Hybrid Retrieval (PARALLÈLE) ──── hybrid-retrieval.ts
    ├── Supabase (5 tables en parallèle)
    └── Perplexity (5 fenêtres en parallèle)    ← était séquentiel
    │
    ▼
[3] Candidate Ranking ─────────────── candidate-ranking.ts
    │
    ▼
[4] Event Extraction (batch LLM) ──── article-extractor.ts
    │
    ▼
[5] Event Clustering (2-pass) ─────── event-clusterer.ts
    │
    ▼
[6] Historical Expansion ──────────── recency-bias-detector.ts + historical-searcher.ts
    ├── Détection biais
    ├── Recherche parallèle (3 fenêtres)
    ├── Re-extraction + re-clustering
    └── Re-ranking unifié
    │
    ▼
[7] Relation Graph Building ───────── relation-detector.ts          ← NOUVEAU
    ├── 7a: Temporal linking (déterministe, 0 LLM)
    ├── 7b: Causal detection (1 appel LLM)
    └── 7c: Corollary detection (1 appel LLM)
    │
    ▼
[8] Counterfactual Scoring ────────── counterfactual-check.ts       ← BRANCHÉ
    │
    ▼
[9] Outcome Generation (MANDATORY) ── outcome-generator.ts          ← REWRITE
    │
    ▼
[10] Storyline Assembly ───────────── storyline-assembler.ts         ← REFACTOR
     (graphe, pas chaîne)
    │
    ▼
[11] Narrative Generation ─────────── narrative-generator.ts         ← NOUVEAU
    │
    ▼
[12] SSE Projection ───────────────── route.ts → React Flow
```

### Liste des services finaux

| Service | Status |
|---------|--------|
| `builder.ts` | REWRITE |
| `hybrid-retrieval.ts` | REFACTOR |
| `candidate-ranking.ts` | REFACTOR minor |
| `article-extractor.ts` | KEEP |
| `event-clusterer.ts` | REFACTOR minor |
| `recency-bias-detector.ts` | REFACTOR minor |
| `historical-searcher.ts` | REWRITE |
| `relation-detector.ts` | **NEW** |
| `counterfactual-check.ts` | KEEP (brancher) |
| `outcome-generator.ts` | REWRITE |
| `storyline-assembler.ts` | REFACTOR |
| `narrative-generator.ts` | **NEW** |
| `storyline-analysis.ts` | **DELETE** (après migration) |

### Liste des types finaux

| Type | Status |
|------|--------|
| `ExtractedEvent` | KEEP |
| `EventCluster` | KEEP |
| `EventRelation` | **NEW** |
| `OutcomePrediction` | **NEW** |
| `StorylineNode` | **NEW** |
| `StorylineGraph` | **NEW** |
| `AnchorContext` | KEEP |
| `CandidateItem` | KEEP |
| `StorylineCard` | KEEP |
| `StorylineEdge` | KEEP |
| `StorylineResult` | KEEP |
| `StorylineSSEEvent` | KEEP |
| `CounterfactualCheckInput/Result` | KEEP |
| `StorylineAnalysis` | **DELETE** (après migration) |
| `StorylineAnalysisEntry` | **DELETE** (après migration) |
| `StorylineOutcome` | **DELETE** (après migration) |

### 20 premières tâches concrètes

| # | Tâche | Fichier(s) | Dépend de |
|---|-------|-----------|-----------|
| 1 | Créer `EventRelation` type | `lib/storyline/types/event-relation.ts` | — |
| 2 | Créer `OutcomePrediction` type | `lib/storyline/types/outcome-prediction.ts` | — |
| 3 | Mettre à jour `lib/storyline/types/index.ts` avec les nouveaux exports | `types/index.ts` | 1, 2 |
| 4 | Paralléliser `retrieveExternalCandidates()` | `hybrid-retrieval.ts` | — |
| 5 | Remplacer `clusterSeq` mutable par `crypto.randomUUID()` | `event-clusterer.ts` | — |
| 6 | Ajouter `reclusterMerged()` à `event-clusterer.ts` | `event-clusterer.ts` | 5 |
| 7 | Paralléliser les 2 requêtes dans `historical-searcher.ts` | `historical-searcher.ts` | — |
| 8 | Ajouter 3e fenêtre historique "deep" dans `historical-searcher.ts` | `historical-searcher.ts` | 7 |
| 9 | Créer `relation-detector.ts` — `buildTemporalRelations()` | `relation-detector.ts` | 1 |
| 10 | Écrire tests pour `buildTemporalRelations()` | `__tests__/relation-detector.test.ts` | 9 |
| 11 | Créer `relation-detector.ts` — `detectCausalRelations()` | `relation-detector.ts` | 9 |
| 12 | Créer `relation-detector.ts` — `detectCorollaryRelations()` | `relation-detector.ts` | 9 |
| 13 | Créer `applyCounterfactualChecks()` wrapper dans `relation-detector.ts` | `relation-detector.ts` | 11 |
| 14 | Écrire tests d'intégration CF dans le pipeline | `__tests__/counterfactual-integration.test.ts` | 13 |
| 15 | Réécrire `outcome-generator.ts` — phase obligatoire | `outcome-generator.ts` | 1, 2 |
| 16 | Écrire tests pour outcome generation | `__tests__/outcome-generator.test.ts` | 15 |
| 17 | Refactorer `assembleStorylineGraph()` pour accepter `EventRelation[]` | `storyline-assembler.ts` | 1, 9, 15 |
| 18 | Créer `narrative-generator.ts` | `narrative-generator.ts` | — |
| 19 | Réécrire `buildStoryline()` dans `builder.ts` avec le nouveau pipeline | `builder.ts` | 4-18 |
| 20 | Supprimer code V1 legacy (buildStorylineV1, analyzeStoryline, assembleStoryline) | `builder.ts`, `storyline-analysis.ts`, `storyline-assembler.ts` | 19 |
