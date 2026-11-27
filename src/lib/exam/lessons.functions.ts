// Server functions for giving slide lessons to exam classes (teacher) and reading them (student).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const token = z.string().regex(/^[0-9a-f]{64}$/);

export const listLessonAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { teacherLessonAssignments } = await import("./lessons.server");
    return { items: await teacherLessonAssignments(context.userId) };
  });

export const giveLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      lessonKey: z.string().min(1).max(120),
      opensAt: z.string().datetime({ offset: true }).nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { assignLesson } = await import("./lessons.server");
    return assignLesson(context.userId, data.classId, data.lessonKey, data.opensAt);
  });

export const takeBackLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid }))
  .handler(async ({ data, context }) => {
    const { unassignLesson } = await import("./lessons.server");
    return unassignLesson(context.userId, data.id);
  });

export const myLessons = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const { sessionStudent } = await import("./db.server");
    const { studentLessons } = await import("./lessons.server");
    const { student } = await sessionStudent(data.token);
    return { lessons: await studentLessons(student.id, student.class_id) };
  });

export const openLesson = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: uuid }))
  .handler(async ({ data }) => {
    const { sessionStudent } = await import("./db.server");
    const { openLessonForStudent } = await import("./lessons.server");
    const { student } = await sessionStudent(data.token);
    return openLessonForStudent(student.id, student.class_id, data.id);
  });
