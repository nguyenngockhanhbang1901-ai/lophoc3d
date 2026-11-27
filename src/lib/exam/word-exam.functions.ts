// Server functions for exams made straight from a Word file (teacher only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const level = z.enum(["nb", "th", "vd", "vdc"]);
const points = z.number().min(0).max(100);

export const createExamFromWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      title: z.string().trim().min(1).max(150),
      sourceFile: z.string().max(200),
      questions: z
        .array(z.object({ level, body: z.unknown() }))
        .min(1)
        .max(200),
      points: z.object({ mcq: points, tf: points, short: points }),
      shuffleOptions: z.boolean(),
      shuffleOrder: z.boolean(),
      shuffleStatements: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { createWordExam } = await import("./word-exam.server");
    const { questionBodySchema } = await import("./questions");
    return {
      id: await createWordExam(context.userId, {
        ...data,
        questions: data.questions.map((q) => ({
          level: q.level,
          body: questionBodySchema.parse(q.body),
        })),
      }),
    };
  });

export const removeWordExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid }))
  .handler(async ({ data, context }) => {
    const { deleteWordExam } = await import("./word-exam.server");
    return deleteWordExam(context.userId, data.id);
  });

export const getWordExamQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid }))
  .handler(async ({ data, context }) => {
    const { wordExamQuestions } = await import("./word-exam.server");
    return wordExamQuestions(context.userId, data.id);
  });

export const fixWordExamQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid, questionId: uuid, level, body: z.unknown() }))
  .handler(async ({ data, context }) => {
    const { updateWordExamQuestion } = await import("./word-exam.server");
    return updateWordExamQuestion(context.userId, data.id, data.questionId, data.level, data.body);
  });
