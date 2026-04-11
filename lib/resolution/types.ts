// ─── Enums ──────────────────────────────────────────────────────────────────

export const RESOLUTION_CLASS = { A: 'A', B: 'B', C: 'C' } as const
export type ResolutionClass = (typeof RESOLUTION_CLASS)[keyof typeof RESOLUTION_CLASS]

export const RESOLUTION_MODE = { AUTO: 'auto', ASSISTED: 'assisted', MANUAL: 'manual' } as const
export type ResolutionMode = (typeof RESOLUTION_MODE)[keyof typeof RESOLUTION_MODE]

export const RESOLUTION_STATUS = {
  PENDING: 'pending',
  SOURCE_FETCHING: 'source_fetching',
  EVIDENCE_READY: 'evidence_ready',
  PROPOSAL_PENDING: 'proposal_pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISPUTED: 'disputed',
  FINALIZED: 'finalized',
  ANNULLED: 'annulled',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
} as const
export type ResolutionStatus = (typeof RESOLUTION_STATUS)[keyof typeof RESOLUTION_STATUS]

export const EVIDENCE_CONFIDENCE = {
  VERY_HIGH: 'very_high',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  VERY_LOW: 'very_low',
} as const
export type EvidenceConfidence = (typeof EVIDENCE_CONFIDENCE)[keyof typeof EVIDENCE_CONFIDENCE]

export const DISPUTE_STATUS = {
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  UPHELD: 'upheld',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
} as const
export type DisputeStatus = (typeof DISPUTE_STATUS)[keyof typeof DISPUTE_STATUS]

export const OUTCOME_TYPE = {
  BINARY: 'binary',
  MULTI_CHOICE: 'multi_choice',
  NUMERIC_THRESHOLD: 'numeric_threshold',
  EVENT_OCCURRENCE: 'event_occurrence',
  OFFICIAL_DECLARATION: 'official_declaration',
} as const
export type OutcomeType = (typeof OUTCOME_TYPE)[keyof typeof OUTCOME_TYPE]

export const SOURCE_TYPE = {
  GOVERNMENT: 'government',
  CENTRAL_BANK: 'central_bank',
  ELECTION_COMMISSION: 'election_commission',
  EXCHANGE_FEED: 'exchange_feed',
  NEWS_PUBLISHER: 'news_publisher',
  PRESS_RELEASE: 'press_release',
  REGULATOR: 'regulator',
  ANALYST: 'analyst',
  AI_SEARCH: 'ai_search',
} as const
export type SourceType = (typeof SOURCE_TYPE)[keyof typeof SOURCE_TYPE]

export const SOURCE_TRUST = {
  AUTHORITATIVE: 'authoritative',
  RELIABLE: 'reliable',
  INDICATIVE: 'indicative',
  UNVERIFIED: 'unverified',
} as const
export type SourceTrust = (typeof SOURCE_TRUST)[keyof typeof SOURCE_TRUST]

export const PROPOSAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ESCALATED: 'escalated',
} as const
export type ProposalStatus = (typeof PROPOSAL_STATUS)[keyof typeof PROPOSAL_STATUS]

export const AUDIT_ACTIONS = {
  JOB_CREATED: 'job_created',
  SOURCE_FETCHED: 'source_fetched',
  EVIDENCE_ADDED: 'evidence_added',
  PROPOSAL_CREATED: 'proposal_created',
  AUTO_RESOLVED: 'auto_resolved',
  ADMIN_APPROVED: 'admin_approved',
  ADMIN_REJECTED: 'admin_rejected',
  ADMIN_ANNULLED: 'admin_annulled',
  ADMIN_CANCELLED: 'admin_cancelled',
  DISPUTED: 'disputed',
  DISPUTE_RESOLVED: 'dispute_resolved',
  FINALIZED: 'finalized',
  ESCALATED: 'escalated',
  FAILED: 'failed',
} as const
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

// ─── Row types ──────────────────────────────────────────────────────────────

export interface ResolutionProfile {
  id: string
  question_id: string
  resolution_class: ResolutionClass
  resolution_mode: ResolutionMode
  outcome_type: OutcomeType
  primary_source_type: SourceType | null
  primary_source_url: string | null
  primary_source_config: Record<string, unknown>
  fallback_source_url: string | null
  fallback_source_type: SourceType | null
  resolve_after: string | null
  resolve_deadline: string | null
  threshold_value: number | null
  threshold_operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | null
  tie_break_rule: string | null
  cancellation_rule: string | null
  ambiguity_rule: string | null
  auto_resolve_eligible: boolean
  requires_multi_source: boolean
  min_source_confidence: EvidenceConfidence
  created_at: string
  updated_at: string
}

export interface ResolutionJob {
  id: string
  question_id: string
  profile_id: string | null
  status: ResolutionStatus
  started_at: string | null
  completed_at: string | null
  proposed_outcome: string | null
  confidence: number | null
  confidence_label: EvidenceConfidence | null
  auto_resolved: boolean
  resolved_by: string | null
  failure_reason: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

export interface ResolutionEvidence {
  id: string
  job_id: string
  source_type: SourceType | null
  source_url: string | null
  source_trust: SourceTrust
  title: string | null
  extracted_text: string | null
  raw_data: Record<string, unknown>
  fetched_at: string
  is_stale: boolean
  confidence: EvidenceConfidence
  supports_outcome: string | null
  created_at: string
}

export interface ResolutionProposal {
  id: string
  job_id: string
  question_id: string
  proposed_outcome: string
  confidence: number
  rationale: string | null
  evidence_summary: string | null
  source_agreement: boolean
  fallback_checked: boolean
  status: ProposalStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  created_at: string
}

export interface ResolutionDispute {
  id: string
  question_id: string
  job_id: string | null
  filed_by: string
  reason: string
  evidence_url: string | null
  status: DisputeStatus
  reviewed_by: string | null
  reviewed_at: string | null
  resolution_notes: string | null
  created_at: string
}

export interface ResolutionAuditEntry {
  id: string
  question_id: string
  job_id: string | null
  action: AuditAction
  actor_type: 'system' | 'admin' | 'user'
  actor_id: string | null
  details: Record<string, unknown>
  created_at: string
}

// ─── Payloads for queue events ──────────────────────────────────────────────

export interface ResolutionJobCreatedPayload {
  questionId: string
  jobId: string
  profileId: string
  resolutionClass: ResolutionClass
  resolutionMode: ResolutionMode
}

export interface ResolutionSourceFetchPayload {
  jobId: string
  questionId: string
}

export interface ResolutionEvidenceReadyPayload {
  jobId: string
  questionId: string
  evidenceCount: number
}

export interface ResolutionApprovedPayload {
  jobId: string
  questionId: string
  outcome: string
  approvedBy: string | null
  autoResolved: boolean
}

export interface ResolutionFinalizedPayload {
  jobId: string
  questionId: string
  outcome: string
}

export interface ResolutionDisputedPayload {
  questionId: string
  disputeId: string
  filedBy: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const AUTO_RESOLVE_CONFIDENCE_THRESHOLD = 0.90
export const DISPUTE_WINDOW_HOURS = 24
export const SOURCE_FRESHNESS_AUTO_HOURS = 6
export const SOURCE_FRESHNESS_ASSISTED_HOURS = 24
export const MAX_RESOLUTION_RETRIES = 3

export const TRUSTED_SOURCE_TYPES: SourceTrust[] = ['authoritative', 'reliable']
