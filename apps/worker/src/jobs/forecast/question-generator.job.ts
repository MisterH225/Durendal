/**
 * Point d’entrée worker — délègue à lib/forecast/question-generator.ts
 */

import { createWorkerSupabase } from '../../supabase'
import { runQuestionGenerator } from '../../../../../lib/forecast/question-generator'

export async function runQuestionGeneratorJob(): Promise<void> {
  await runQuestionGenerator(createWorkerSupabase())
}
