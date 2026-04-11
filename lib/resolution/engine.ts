import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ResolutionJob,
  ResolutionProfile,
  ResolutionEvidence,
  AuditAction,
} from './types'
import {
  RESOLUTION_STATUS,
  DISPUTE_WINDOW_HOURS,
} from './types'
import { fetchResolutionSources } from './source-fetcher'
import { generateProposal } from './proposal-generator'
import { canAutoResolve, computeOverallConfidence, checkSourceAgreement } from './confidence'

// ─── Audit helper ────────────────────────────────────────────────────────────

export async function logAudit(
  supabase: SupabaseClient,
  questionId: string,
  action: AuditAction,
  opts: {
    jobId?: string | null
    actorType?: 'system' | 'admin' | 'user'
    actorId?: string | null
    details?: Record<string, unknown>
  } = {},
) {
  await supabase.from('resolution_audit_log').insert({
    question_id: questionId,
    job_id: opts.jobId ?? null,
    action,
    actor_type: opts.actorType ?? 'system',
    actor_id: opts.actorId ?? null,
    details: opts.details ?? {},
  })
}

// ─── Create a resolution job for a closed question ───────────────────────────

export async function createResolutionJob(
  supabase: SupabaseClient,
  questionId: string,
): Promise<ResolutionJob | null> {
  // Check for existing active job
  const { data: existing } = await supabase
    .from('resolution_jobs')
    .select('id, status')
    .eq('question_id', questionId)
    .not('status', 'in', '("failed","cancelled")')
    .limit(1)
    .maybeSingle()

  if (existing) {
    console.log(`[resolution] Job already exists for ${questionId}: ${existing.id} (${existing.status})`)
    return null
  }

  // Load resolution profile
  const { data: profile } = await supabase
    .from('resolution_profiles')
    .select('*')
    .eq('question_id', questionId)
    .maybeSingle()

  if (!profile) {
    console.log(`[resolution] No profile for ${questionId} — marking needs_review`)
    await supabase
      .from('forecast_questions')
      .update({ status: 'needs_review', updated_at: new Date().toISOString() })
      .eq('id', questionId)
    await logAudit(supabase, questionId, 'escalated', {
      details: { reason: 'no_resolution_profile' },
    })
    return null
  }

  // Check resolve_after
  if (profile.resolve_after) {
    const resolveAfter = new Date(profile.resolve_after).getTime()
    if (Date.now() < resolveAfter) {
      console.log(`[resolution] Question ${questionId} not yet eligible (resolve_after: ${profile.resolve_after})`)
      return null
    }
  }

  const { data: job, error } = await supabase
    .from('resolution_jobs')
    .insert({
      question_id: questionId,
      profile_id: profile.id,
      status: RESOLUTION_STATUS.PENDING,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !job) {
    console.error(`[resolution] Failed to create job for ${questionId}:`, error?.message)
    return null
  }

  await logAudit(supabase, questionId, 'job_created', {
    jobId: job.id,
    details: { profileId: profile.id, class: profile.resolution_class, mode: profile.resolution_mode },
  })

  return job as ResolutionJob
}

// ─── Execute source fetching for a job ───────────────────────────────────────

export async function executeSourceFetch(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ success: boolean; evidenceCount: number }> {
  // Load job + profile + question
  const { data: job } = await supabase
    .from('resolution_jobs')
    .select('*, resolution_profiles(*)')
    .eq('id', jobId)
    .single()

  if (!job) throw new Error(`Job ${jobId} not found`)

  const profile = (job as any).resolution_profiles as ResolutionProfile
  if (!profile) throw new Error(`No profile linked to job ${jobId}`)

  const { data: question } = await supabase
    .from('forecast_questions')
    .select('id, title, description, resolution_criteria, resolution_source')
    .eq('id', job.question_id)
    .single()

  if (!question) throw new Error(`Question ${job.question_id} not found`)

  // Update job status
  await supabase
    .from('resolution_jobs')
    .update({ status: RESOLUTION_STATUS.SOURCE_FETCHING, updated_at: new Date().toISOString() })
    .eq('id', jobId)

  // Fetch sources via Gemini
  const result = await fetchResolutionSources(question, profile)

  // Store evidence
  const evidenceRows = result.evidence.map(e => ({
    job_id: jobId,
    source_type: e.source_type,
    source_url: e.source_url,
    source_trust: e.source_trust,
    title: e.title,
    extracted_text: e.extracted_text,
    raw_data: e.raw_data,
    confidence: e.confidence,
    supports_outcome: e.supports_outcome,
    fetched_at: new Date().toISOString(),
  }))

  if (evidenceRows.length > 0) {
    await supabase.from('resolution_evidence').insert(evidenceRows)
  }

  // Update job
  await supabase
    .from('resolution_jobs')
    .update({
      status: RESOLUTION_STATUS.EVIDENCE_READY,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  await logAudit(supabase, job.question_id, 'source_fetched', {
    jobId,
    details: { evidenceCount: evidenceRows.length, tokensUsed: result.tokensUsed },
  })

  return { success: true, evidenceCount: evidenceRows.length }
}

// ─── Generate proposal from evidence ─────────────────────────────────────────

export async function executeProposalGeneration(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ proposalId: string; autoResolved: boolean }> {
  const { data: job } = await supabase
    .from('resolution_jobs')
    .select('*, resolution_profiles(*)')
    .eq('id', jobId)
    .single()

  if (!job) throw new Error(`Job ${jobId} not found`)

  const profile = (job as any).resolution_profiles as ResolutionProfile

  // Load evidence
  const { data: evidenceItems } = await supabase
    .from('resolution_evidence')
    .select('*')
    .eq('job_id', jobId)

  const evidence = (evidenceItems ?? []) as ResolutionEvidence[]

  if (!evidence.length) {
    await supabase.from('resolution_jobs').update({
      status: RESOLUTION_STATUS.FAILED,
      failure_reason: 'No evidence collected',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId)

    await logAudit(supabase, job.question_id, 'failed', {
      jobId,
      details: { reason: 'no_evidence' },
    })
    throw new Error('No evidence to generate proposal')
  }

  // Generate proposal
  const proposal = generateProposal(evidence, profile)

  // If proposal says needs_review, escalate
  if (proposal.proposed_outcome === 'needs_review') {
    await supabase.from('resolution_jobs').update({
      status: RESOLUTION_STATUS.PROPOSAL_PENDING,
      proposed_outcome: null,
      confidence: proposal.confidence,
      confidence_label: proposal.confidence_label,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId)

    await supabase.from('forecast_questions').update({
      status: 'needs_review',
      updated_at: new Date().toISOString(),
    }).eq('id', job.question_id)

    await logAudit(supabase, job.question_id, 'escalated', {
      jobId,
      details: { reason: 'insufficient_evidence', confidence: proposal.confidence },
    })

    // Still create the proposal record for admin reference
    const { data: proposalRow } = await supabase.from('resolution_proposals').insert({
      job_id: jobId,
      question_id: job.question_id,
      proposed_outcome: 'needs_review',
      confidence: proposal.confidence,
      rationale: proposal.rationale,
      evidence_summary: proposal.evidence_summary,
      source_agreement: proposal.source_agreement,
      fallback_checked: proposal.fallback_checked,
      status: 'pending',
    }).select('id').single()

    return { proposalId: proposalRow!.id, autoResolved: false }
  }

  // Check if we can auto-resolve
  const autoCheck = canAutoResolve({
    resolutionClass: profile.resolution_class,
    autoResolveEligible: profile.auto_resolve_eligible,
    confidence: proposal.confidence,
    sourceAgreement: proposal.source_agreement,
    evidenceItems: evidence,
    proposedOutcome: proposal.proposed_outcome,
  })

  // Create proposal record
  const { data: proposalRow } = await supabase.from('resolution_proposals').insert({
    job_id: jobId,
    question_id: job.question_id,
    proposed_outcome: proposal.proposed_outcome,
    confidence: proposal.confidence,
    rationale: proposal.rationale,
    evidence_summary: proposal.evidence_summary,
    source_agreement: proposal.source_agreement,
    fallback_checked: proposal.fallback_checked,
    status: autoCheck.allowed ? 'approved' : 'pending',
    reviewed_by: autoCheck.allowed ? null : null,
    reviewed_at: autoCheck.allowed ? new Date().toISOString() : null,
  }).select('id').single()

  await logAudit(supabase, job.question_id, 'proposal_created', {
    jobId,
    details: {
      proposalId: proposalRow!.id,
      outcome: proposal.proposed_outcome,
      confidence: proposal.confidence,
      sourceAgreement: proposal.source_agreement,
      autoEligible: autoCheck.allowed,
      autoBlockReason: autoCheck.reason,
    },
  })

  if (autoCheck.allowed) {
    // Auto-resolve
    await applyResolution(supabase, jobId, job.question_id, proposal.proposed_outcome, {
      autoResolved: true,
      confidence: proposal.confidence,
      confidenceLabel: proposal.confidence_label,
    })
    return { proposalId: proposalRow!.id, autoResolved: true }
  }

  // Queue for admin review
  await supabase.from('resolution_jobs').update({
    status: RESOLUTION_STATUS.PROPOSAL_PENDING,
    proposed_outcome: proposal.proposed_outcome,
    confidence: proposal.confidence,
    confidence_label: proposal.confidence_label,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId)

  return { proposalId: proposalRow!.id, autoResolved: false }
}

// ─── Apply a resolution outcome ──────────────────────────────────────────────

export async function applyResolution(
  supabase: SupabaseClient,
  jobId: string,
  questionId: string,
  outcome: string,
  opts: {
    autoResolved?: boolean
    resolvedBy?: string | null
    confidence?: number
    confidenceLabel?: string
    notes?: string
  } = {},
) {
  const now = new Date()
  const disputeWindowEnds = new Date(now.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000)

  // Update question status
  await supabase.from('forecast_questions').update({
    status: outcome,
    resolved_at: now.toISOString(),
    resolved_by: opts.resolvedBy ?? null,
    resolution_notes: opts.notes ?? null,
    dispute_window_ends: disputeWindowEnds.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', questionId)

  // Update job
  await supabase.from('resolution_jobs').update({
    status: RESOLUTION_STATUS.APPROVED,
    proposed_outcome: outcome,
    confidence: opts.confidence ?? null,
    confidence_label: opts.confidenceLabel ?? null,
    auto_resolved: opts.autoResolved ?? false,
    resolved_by: opts.resolvedBy ?? null,
    completed_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', jobId)

  const action: AuditAction = opts.autoResolved ? 'auto_resolved' : 'admin_approved'
  await logAudit(supabase, questionId, action, {
    jobId,
    actorType: opts.autoResolved ? 'system' : 'admin',
    actorId: opts.resolvedBy ?? null,
    details: { outcome, confidence: opts.confidence },
  })
}

// ─── Finalize after dispute window ───────────────────────────────────────────

export async function finalizeResolution(
  supabase: SupabaseClient,
  jobId: string,
  questionId: string,
): Promise<{ finalized: boolean; outcome: string }> {
  // Check for open disputes
  const { data: disputes } = await supabase
    .from('resolution_disputes')
    .select('id')
    .eq('question_id', questionId)
    .in('status', ['open', 'under_review'])

  if (disputes?.length) {
    console.log(`[resolution] Question ${questionId} has ${disputes.length} active dispute(s) — cannot finalize`)
    return { finalized: false, outcome: 'disputed' }
  }

  // Load question to get current outcome
  const { data: question } = await supabase
    .from('forecast_questions')
    .select('status')
    .eq('id', questionId)
    .single()

  if (!question) throw new Error(`Question ${questionId} not found`)

  const resolved = ['resolved_yes', 'resolved_no'].includes(question.status)
  if (!resolved) {
    return { finalized: false, outcome: question.status }
  }

  // Finalize job
  await supabase.from('resolution_jobs').update({
    status: RESOLUTION_STATUS.FINALIZED,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', jobId)

  await logAudit(supabase, questionId, 'finalized', {
    jobId,
    details: { outcome: question.status },
  })

  return { finalized: true, outcome: question.status }
}
