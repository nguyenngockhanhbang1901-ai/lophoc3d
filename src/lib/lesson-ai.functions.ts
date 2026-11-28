import { createServerFn } from '@tanstack/react-start';
import { requireOwner } from '@/lib/owner-middleware';
import { lessonAiInput, requestLessonAi } from './lesson-ai';

/** The teacher key is used for this request only: never persisted, returned or logged. */
export const solveLessonQuestion = createServerFn({ method: 'POST' })
  .middleware([requireOwner])
  .inputValidator((input: unknown) => lessonAiInput.parse(input))
  .handler(({ data }) => requestLessonAi(data.apiKey, data.prompt));
