export const FORECAST_TOPICS = {
  USER_FORECAST_SUBMITTED:     'forecast.user.forecast.submitted',
  BLENDED_RECOMPUTE_REQUESTED: 'forecast.blended.recompute.requested',
  BLENDED_UPDATED:             'forecast.blended.updated',
  AI_FORECAST_REQUESTED:       'forecast.ai.forecast.requested',
  AI_FORECAST_UPDATED:         'forecast.ai.forecast.updated',
  SIGNAL_EXPORT_REQUESTED:     'forecast.signal.export.requested',
  SIGNAL_EXPORTED:             'forecast.signal.exported',
  QUESTION_CLOSED:             'forecast.question.closed',
  RESOLUTION_READY:            'forecast.resolution.ready',
} as const

export type ForecastTopic = (typeof FORECAST_TOPICS)[keyof typeof FORECAST_TOPICS]
