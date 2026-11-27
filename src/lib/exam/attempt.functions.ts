// Student-side server functions for exams. Every call carries the student's session token and
// is checked here: the assignment must belong to the student's class, questions are sent one
// at a time and only once reached, answers never travel to the browser, and the server clock
// alone decides opening, closing and time left.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  readSettings,
  studentAnswerSchema,
  studentQuestion,
  windowState,
  type AssignmentSettings,
  type AttemptStatus,
  type StudentQuestion,
  type WindowState,
} from "./assignment";
import type { StudentAnswer } from "./grading";
import type { QuestionKind } from "./questions";

const token = z.string().regex(/^[0-9a-f]{64}$/);
const uuid = z.string().uuid();

export interface MyAssignment {
  id: string;
  title: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  questionCount: number;
  state: WindowState;
  maxAttempts: number;
  attemptsUsed: number;
  inProgressId: string | null;
  lastStatus: AttemptStatus | null;
  lastScore: number | null;
  scale: number;
}

export interface AssignmentRules {
  id: string;
  title: string;
  className: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  questionCount: number;
  partCounts: Record<QuestionKind, number>;
  state: WindowState;
  serverNow: string;
  maxAttempts: number;
  attemptsUsed: number;
  inProgressId: string | null;
  settings: AssignmentSettings;
  canStart: boolean;
  /** why the start button is disabled, if it is */
  blocked: string | null;
}

export interface AttemptView {
  id: string;
  title: string;
  status: AttemptStatus;
  serverNow: string;
  deadlineAt: string;
  kinds: QuestionKind[];
  points: number[];
  reachedIndex: number;
  answers: (StudentAnswer | null)[];
  settings: AssignmentSettings;
  score: number | null;
  correctCount: number | null;
}

type Assignment = import("./attempt.server").AssignmentRow;

async function studentAndAssignment(tokenValue: string, assignmentId: string) {
  const { sessionStudent, examDb } = await import("./db.server");
  const { student } = await sessionStudent(tokenValue);
  const { data } = await examDb()
    .from("exam_assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("class_id", student.class_id)
    .maybeSingle();
  if (!data) throw new Error("Không tìm thấy bài được giao");
  return { student, assignment: data as Assignment };
}

async function ownAttempt(tokenValue: string, attemptId: string) {
  const { sessionStudent, examDb } = await import("./db.server");
  const { finishIfExpired } = await import("./attempt.server");
  const { student } = await sessionStudent(tokenValue);
  const { data } = await examDb()
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("student_id", student.id)
    .maybeSingle();
  if (!data) throw new Error("Không tìm thấy bài làm");
  let attempt = data as import("./attempt.server").AttemptRow;
  if (attempt.status === "in_progress") attempt = (await finishIfExpired(attempt.id)) ?? attempt;
  return { student, attempt };
}

function attemptsUsedOf(rows: { counts_toward_attempts: boolean }[]): number {
  return rows.filter((r) => r.counts_toward_attempts).length;
}

export const myAssignments = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }): Promise<{ serverNow: string; assignments: MyAssignment[] }> => {
    const { sessionStudent, examDb } = await import("./db.server");
    const { student } = await sessionStudent(data.token);
    const db = examDb();
    const { data: rows } = await db
      .from("exam_assignments")
      .select("id,title,opens_at,closes_at,duration_minutes,max_attempts,slots,settings")
      .eq("class_id", student.class_id)
      .order("opens_at", { ascending: false })
      .limit(100);
    const list = (rows ?? []) as (Pick<
      Assignment,
      "id" | "title" | "opens_at" | "closes_at" | "duration_minutes" | "max_attempts" | "settings"
    > & { slots: unknown[] })[];
    const { data: attempts } = list.length
      ? await db
          .from("exam_attempts")
          .select("id,assignment_id,attempt_no,status,score,counts_toward_attempts,deadline_at")
          .eq("student_id", student.id)
          .in(
            "assignment_id",
            list.map((a) => a.id),
          )
      : { data: [] };
    const now = Date.now();
    type A = {
      id: string;
      assignment_id: string;
      attempt_no: number;
      status: AttemptStatus;
      score: number | null;
      counts_toward_attempts: boolean;
      deadline_at: string;
    };
    const mine = (attempts ?? []) as A[];
    return {
      serverNow: new Date(now).toISOString(),
      assignments: list.map((a) => {
        const own = mine
          .filter((x) => x.assignment_id === a.id)
          .sort((x, y) => x.attempt_no - y.attempt_no);
        const last = own[own.length - 1];
        const open = own.find(
          (x) => x.status === "in_progress" && new Date(x.deadline_at).getTime() > now,
        );
        return {
          id: a.id,
          title: a.title,
          opensAt: a.opens_at,
          closesAt: a.closes_at,
          durationMinutes: a.duration_minutes,
          questionCount: Array.isArray(a.slots) ? a.slots.length : 0,
          state: windowState(a.opens_at, a.closes_at, now),
          maxAttempts: a.max_attempts,
          attemptsUsed: attemptsUsedOf(own),
          inProgressId: open?.id ?? null,
          lastStatus:
            last && !(last.status === "in_progress" && !open)
              ? last.status
              : last
                ? "timeout"
                : null,
          lastScore: last?.score === null || last?.score === undefined ? null : Number(last.score),
          scale: readSettings(a.settings).scale,
        };
      }),
    };
  });

export const assignmentRules = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, assignmentId: uuid }))
  .handler(async ({ data }): Promise<AssignmentRules> => {
    const { examDb } = await import("./db.server");
    const { student, assignment } = await studentAndAssignment(data.token, data.assignmentId);
    const db = examDb();
    const [{ data: cls }, { data: attempts }] = await Promise.all([
      db.from("exam_classes").select("name").eq("id", student.class_id).maybeSingle(),
      db
        .from("exam_attempts")
        .select("id,status,counts_toward_attempts,deadline_at")
        .eq("assignment_id", assignment.id)
        .eq("student_id", student.id),
    ]);
    const now = Date.now();
    const rows = (attempts ?? []) as {
      id: string;
      status: AttemptStatus;
      counts_toward_attempts: boolean;
      deadline_at: string;
    }[];
    const open = rows.find(
      (r) => r.status === "in_progress" && new Date(r.deadline_at).getTime() > now,
    );
    const used = attemptsUsedOf(rows);
    const state = windowState(assignment.opens_at, assignment.closes_at, now);
    const slots = Array.isArray(assignment.slots) ? assignment.slots : [];
    const partCounts: Record<QuestionKind, number> = { mcq: 0, tf: 0, short: 0 };
    for (const s of slots) partCounts[s.kind] += 1;
    let blocked: string | null = null;
    if (!open) {
      if (state === "scheduled") blocked = "Bài chưa đến giờ mở";
      else if (state === "closed") blocked = "Bài đã đóng";
      else if (used >= assignment.max_attempts) blocked = "Em đã dùng hết số lần làm bài";
    }
    return {
      id: assignment.id,
      title: assignment.title,
      className: (cls as { name: string } | null)?.name ?? "",
      opensAt: assignment.opens_at,
      closesAt: assignment.closes_at,
      durationMinutes: assignment.duration_minutes,
      questionCount: slots.length,
      partCounts,
      state,
      serverNow: new Date(now).toISOString(),
      maxAttempts: assignment.max_attempts,
      attemptsUsed: used,
      inProgressId: open?.id ?? null,
      settings: readSettings(assignment.settings),
      canStart: !blocked,
      blocked,
    };
  });

/** Start (or resume) an attempt. Requires the rules to have been accepted on this screen. */
export const startAttempt = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, assignmentId: uuid, acceptRules: z.literal(true) }))
  .handler(async ({ data }): Promise<{ attemptId: string }> => {
    const { requestUserAgent } = await import("./db.server");
    const { beginAttempt } = await import("./attempt.server");
    const { student, assignment } = await studentAndAssignment(data.token, data.assignmentId);
    return { attemptId: await beginAttempt(student.id, assignment, requestUserAgent()) };
  });

export const attemptView = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, attemptId: uuid }))
  .handler(async ({ data }): Promise<AttemptView> => {
    const { examDb } = await import("./db.server");
    const { loadAnswers } = await import("./attempt.server");
    const { attempt } = await ownAttempt(data.token, data.attemptId);
    const { data: a } = await examDb()
      .from("exam_assignments")
      .select("title,settings")
      .eq("id", attempt.assignment_id)
      .maybeSingle();
    const assignment = a as { title: string; settings: unknown } | null;
    return {
      id: attempt.id,
      title: assignment?.title ?? "",
      status: attempt.status,
      serverNow: new Date().toISOString(),
      deadlineAt: attempt.deadline_at,
      kinds: attempt.items.map((i) => i.kind),
      points: attempt.items.map((i) => i.points),
      reachedIndex: attempt.reached_index,
      answers:
        attempt.status === "in_progress" ? await loadAnswers(attempt.id, attempt.items.length) : [],
      settings: readSettings(assignment?.settings),
      score: attempt.score === null ? null : Number(attempt.score),
      correctCount: attempt.correct_count,
    };
  });

/** One question, and only one the student has reached. No answer key is ever included. */
export const attemptQuestion = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, attemptId: uuid, index: z.number().int().min(0).max(199) }))
  .handler(async ({ data }): Promise<StudentQuestion> => {
    const { loadBodies } = await import("./attempt.server");
    const { attempt } = await ownAttempt(data.token, data.attemptId);
    if (attempt.status !== "in_progress") throw new Error("Bài làm đã kết thúc");
    if (data.index > attempt.reached_index || data.index >= attempt.items.length)
      throw new Error("Câu này chưa mở");
    const item = attempt.items[data.index]!;
    const body = (await loadBodies([item.questionId])).get(item.questionId);
    if (!body) throw new Error("Không tải được câu hỏi");
    return studentQuestion(body, item);
  });

export const saveAnswer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      attemptId: uuid,
      index: z.number().int().min(0).max(199),
      answer: studentAnswerSchema,
    }),
  )
  .handler(async ({ data }): Promise<{ reachedIndex: number; completedAll: boolean }> => {
    const { recordAnswer } = await import("./attempt.server");
    const { attempt } = await ownAttempt(data.token, data.attemptId);
    return recordAnswer(attempt, data.index, data.answer as StudentAnswer);
  });

export const submitAttempt = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, attemptId: uuid }))
  .handler(
    async ({
      data,
    }): Promise<{ status: AttemptStatus; score: number | null; correctCount: number | null }> => {
      const { finishAttempt, GRACE_MS } = await import("./attempt.server");
      const { attempt } = await ownAttempt(data.token, data.attemptId);
      if (attempt.status !== "in_progress")
        return {
          status: attempt.status,
          score: attempt.score === null ? null : Number(attempt.score),
          correctCount: attempt.correct_count,
        };
      const late = Date.now() > new Date(attempt.deadline_at).getTime() + GRACE_MS;
      const done = await finishAttempt(attempt, late ? "timeout" : "submitted");
      if (!done) {
        const again = await ownAttempt(data.token, data.attemptId);
        return {
          status: again.attempt.status,
          score: again.attempt.score === null ? null : Number(again.attempt.score),
          correctCount: again.attempt.correct_count,
        };
      }
      return {
        status: done.status,
        score: done.score === null ? null : Number(done.score),
        correctCount: done.correct_count,
      };
    },
  );
