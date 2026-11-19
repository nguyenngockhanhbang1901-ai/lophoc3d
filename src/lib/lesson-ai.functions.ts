import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { lessonAiInput, requestLessonAi } from './lesson-ai';

/** The teacher key is used for this request only: never persisted, returned or logged. */
export const solveLessonQuestion = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lessonAiInput.parse(input))
  .handler(({ data }) => requestLessonAi(data.apiKey, data.prompt));
