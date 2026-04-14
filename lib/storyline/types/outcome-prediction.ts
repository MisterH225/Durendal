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
