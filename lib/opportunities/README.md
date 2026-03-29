# Module Opportunités Commerciales

## Architecture

```
lib/opportunities/
├── scoring.ts              # Moteur de scoring (fit, intent, recency, engagement, reachability, noise)
├── signals-taxonomy.ts     # Taxonomie des 15 types de signaux commerciaux
├── sector-config.ts        # Configuration sectorielle (10 verticales)
├── normalizer.ts           # Normalisation noms d'entreprises + dédup
├── message-generator.ts    # Génération messages (email, WhatsApp, LinkedIn)
├── opportunity-engine.ts   # Moteur principal (agrégation → scoring → CRUD)
├── seed-opportunities.ts   # Seed de données de démo
├── README.md               # Ce fichier
└── __tests__/
    ├── scoring.test.ts     # 28 tests scoring
    └── normalizer.test.ts  # 16 tests normalisation
```

## Tables SQL (migration 012)

| Table | Rôle |
|-------|------|
| `lead_opportunities` | Objet central : score, heat level, status, breakdown |
| `contact_candidates` | Contacts suggérés par opportunité |
| `opportunity_feedback` | Feedback utilisateur (good_fit, bad_fit, etc.) |
| `opportunity_activity` | Timeline d'activité (logs) |
| `account_signals` | Jointure signals ↔ companies (agrégation) |
| `companies` (étendu) | +normalized_name, domain, employee_range, company_type, etc. |
| `signals` (étendu) | +signal_subtype, extracted_data, confidence_score, dedupe_hash |

## API Routes

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/opportunities` | Liste paginée + filtres + stats |
| POST | `/api/opportunities` | Recalculer toutes les opportunités |
| GET | `/api/opportunities/:id` | Détail (+ signaux, contacts, feedbacks, activité) |
| PATCH | `/api/opportunities/:id` | Mise à jour statut / tags |
| POST | `/api/opportunities/:id/feedback` | Soumettre un feedback |
| POST | `/api/opportunities/:id/generate-message` | Générer un message commercial |
| GET | `/api/opportunities/config` | Taxonomie signaux + secteurs + statuts |

## Formule de scoring

```
totalScore = clamp(
  fitScore     * 0.30 +
  intentScore  * 0.30 +
  recencyScore * 0.15 +
  engagementScore  * 0.10 +
  reachabilityScore * 0.15
  - noisePenalty,
  0, 100
)
```

### Sous-scores (0-100)

- **Fit** : secteur (+25), sous-secteur (+10), pays (+20), taille (+15), type (+10), keywords ICP (+20)
- **Intent** : score de base par type de signal + bonus convergence (2 signaux +8, 3 +15, 4+ +22)
- **Recency** : 100 si ≤7j, 75 si 8-30j, 50 si 31-60j, 25 si 61-90j, 10 si >90j
- **Engagement** : 20 (défaut), 35 (faible), 60 (moyen), 85 (fort)
- **Reachability** : décideur (+30), email (+25), LinkedIn (+15), téléphone (+15), 2+ contacts (+15)
- **Noise penalty** : confiance faible (-5/signal), données incomplètes (-10), type inconnu (-5/signal)

### Heat levels

| Level | Score | Description |
|-------|-------|-------------|
| HOT | ≥ 75 | Opportunité chaude, à traiter en priorité |
| WARM | 50-74 | Opportunité tiède, à surveiller |
| COLD | < 50 | Opportunité froide, potentiel à qualifier |

## UI

Page `/opportunities` avec :
- Header métriques (total, hot, warm, nouveaux)
- Filtres combinables (chaleur, statut, tri, recherche)
- Vue table dense (desktop) + vue cartes (mobile)
- Drawer détail avec 5 onglets : Résumé, Score, Signaux, Contacts, Message
- Actions rapides : feedback, changement statut, génération message

## Lancer les tests

```bash
npx tsx lib/opportunities/__tests__/scoring.test.ts
npx tsx lib/opportunities/__tests__/normalizer.test.ts
```

## Seed / données de démo

```bash
npx tsx lib/opportunities/seed-opportunities.ts
```

## Recalculer les scores

Depuis l'UI : cliquer "Recalculer les scores".
Via API : `POST /api/opportunities` (authentifié).

## Prochaines améliorations

1. **Enrichissement contacts** : intégration avec un service externe (Apollo, Hunter, etc.)
2. **ML scoring** : ajustement des poids par organisation basé sur les feedbacks
3. **Export** : CSV / Excel des opportunités filtrées
4. **Webhooks** : notification sur nouvelle opportunité hot
5. **Pipeline CRM** : intégration Hubspot, Salesforce, Pipedrive
6. **Decay exponentiel** : demi-vie par type de signal au lieu de paliers
7. **Engagement réel** : tracking email ouvertures / clics
8. **Scoring prédictif** : prédiction de conversion via les feedbacks historiques
