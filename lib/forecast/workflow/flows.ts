/**
 * Narrative sample flows for documentation and integration tests (not executed).
 */

export const SAMPLE_GEOPOLITICAL_FLOW = `
Flow: Strait / Hormuz escalation (geopolitical)

1. signal.ingested: Article "Tanker diverted after incident near Hormuz" from Reuters (trust 5).
2. enrichment: entities [Strait of Hormuz, Iran, US Navy], quality_score 0.82.
3. event.linking: matches intel_event slug "hormuz-transit-risk-2026" with confidence 0.88.
4. intel_event_signal_links insert; event.context.rebuild produces snapshot S2.
5. Materiality: novelty 0.35, contradiction 0.1, severity 3→4, regionChanged false, duplicatePenalty 0.
   → score ~72 → decision recalculate.
6. intel_recalculation_requests: idempotency sha256(eventId + snapshotS2 + sorted(questionIds)).
7. Jobs: one question "Escalation militaire au détroit dans 90j" → ForecastEngineWorker.
8. AI prob 0.41 → 0.48; blended 0.44 → 0.47; intel_probability_change_log row with trigger_signal_ids.
9. Async: alert.triggered for users watching region; optional veille_export.requested.
`

export const SAMPLE_COMMODITY_FLOW = `
Flow: Cocoa futures spike (commodity)

1. signal.ingested: USDA / exchange data release + trade press on Ivory Coast supply.
2. enrichment: commodity entities [Cocoa], region [CI], quality_score 0.76.
3. linking: intel_event "cocoa-supply-2026" confidence 0.91.
4. Context snapshot: structured_facts { stock_estimate: down 8%, rainfall: below avg }.
5. Materiality: novelty 0.22, contradiction 0.05, sectorChanged false, timelineDeltaDays 14 (crop outlook),
   severity stable, trust high → score ~58 → decision review (not auto recalc).
6. intel_analyst_review_tasks OR delayed batch recalc after 15 min if second signal confirms.
7. If analyst approves or second signal pushes score ≥65 → recalculation request → AI prob + blended update.
8. probability_change_log: reason "cocoa_supply_shock_confirmed".
`
