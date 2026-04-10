export interface SubmitForecastCommand {
  questionId: string
  userId: string
  probability: number
  reasoning?: string
}

export interface RequestAIForecastCommand {
  questionId: string
  channelSlug: string
  force?: boolean
}

export interface ResolveQuestionCommand {
  questionId: string
  outcome: 'resolved_yes' | 'resolved_no' | 'annulled'
  notes?: string
  resolvedBy: string
}
