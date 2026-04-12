/**
 * INTEL_WORKFLOW_ENABLED — désactive les tâches scheduler intel si '0' | 'false' | 'off'.
 * Par défaut : activé.
 */
export function isIntelWorkflowEnabled(): boolean {
  const v = process.env.INTEL_WORKFLOW_ENABLED?.toLowerCase()?.trim()
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false
  return true
}
