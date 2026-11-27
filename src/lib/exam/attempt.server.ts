// Server-only attempt engine: drawing a student's exam, closing an attempt and grading it.
// The clock is the server's; an attempt past its deadline is collected on the next request
// that touches it (student or teacher), so no timer job is needed.
import { examDb } from "./db.server";
import {
  answerComplete,
  readSettings,
  scoreAttempt,
  studentAnswerSchema,
  windowState,
  type AttemptStatus,
} from "./assignment";
import type { StudentAnswer } from "./grading";
import { drawExam, matrixSlotsSchema, type DrawnItem, type MatrixSlot } from "./matrix";
import { POOL_COLUMNS, toPool, type PoolRow } from "./pool";
import { questionBodySchema, type QuestionBody } from "./questions";

/** Seconds of network delay tolerated after the deadline for answers already on their way. */
export const GRACE_MS = 5_000;

export interface AttemptRow {
  id: string;
  assignment_id: string;
  student_id: string;
  owner_id: string;
  attempt_no: number;
  status: AttemptStatus;
  counts_toward_attempts: boolean;
  code: string;
  items: DrawnItem[];
  reached_index: number;
  started_at: string;
  deadline_at: string;
  completed_all_at: string | null;
  finished_at: string | null;
  score: number | null;
  correct_count: number | null;
  results: unknown;
}

export interface AssignmentRow {
  id: string;
  owner_id: string;
  class_id: string;
  title: string;
  slots: MatrixSlot[];
  shuffle_options: boolean;
  shuffle_order: boolean;
  opens_at: string;
  closes_at: string;
  duration_minutes: number;
  max_attempts: number;
  settings: unknown;
}

function cryptoRandom(): () => number {
  return () => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return (a[0] ?? 0) / 4294967296;
  };
}

/** A fresh exam for this student, preferring questions they have not had in earlier attempts. */
export async function drawForStudent(assignment: AssignmentRow, studentId: string) {
  const db = examDb();
  const slots = matrixSlotsSchema.parse(assignment.slots);
  const bankIds = [...new Set(slots.map((s) => s.bankId))];
  const { data: rows, error } = await db
    .from("exam_questions")
    .select(POOL_COLUMNS)
    .eq("owner_id", assignment.owner_id)
    .in("bank_id", bankIds);
  if (error) throw new Error("Không đọc được ngân hàng đề");
  const { data: earlier } = await db
    .from("exam_attempts")
    .select("items")
    .eq("assignment_id", assignment.id)
    .eq("student_id", studentId);
  const avoid = new Set(
    ((earlier ?? []) as { items: DrawnItem[] }[]).flatMap((a) =>
      (a.items ?? []).map((i) => i.questionId),
    ),
  );
  return drawExam(
    slots,
    toPool((rows ?? []) as unknown as PoolRow[]),
    cryptoRandom(),
    { shuffleOptions: assignment.shuffle_options, shuffleOrder: assignment.shuffle_order },
    avoid,
  );
}

export async function loadBodies(ids: string[]): Promise<Map<string, QuestionBody>> {
  const { data } = await examDb().from("exam_questions").select("id,body").in("id", ids);
  const out = new Map<string, QuestionBody>();
  for (const r of (data ?? []) as { id: string; body: unknown }[]) {
    const parsed = questionBodySchema.safeParse(r.body);
    if (parsed.success) out.set(r.id, parsed.data);
  }
  return out;
}

export async function loadAnswers(
  attemptId: string,
  count: number,
): Promise<(StudentAnswer | null)[]> {
  const { data } = await examDb()
    .from("exam_answers")
    .select("item_index,answer")
    .eq("attempt_id", attemptId);
  const out: (StudentAnswer | null)[] = Array.from({ length: count }, () => null);
  for (const r of (data ?? []) as { item_index: number; answer: unknown }[]) {
    const parsed = studentAnswerSchema.safeParse(r.answer);
    if (parsed.success && r.item_index < count) out[r.item_index] = parsed.data;
  }
  return out;
}

/**
 * Grade and close an attempt that is still in progress. Returns the closed row, or null when
 * another request closed it first (the update only applies while the status is in_progress).
 */
export async function finishAttempt(
  attempt: AttemptRow,
  status: Exclude<AttemptStatus, "in_progress">,
): Promise<AttemptRow | null> {
  const db = examDb();
  const { data: a } = await db
    .from("exam_assignments")
    .select("settings")
    .eq("id", attempt.assignment_id)
    .maybeSingle();
  const settings = readSettings((a as { settings: unknown } | null)?.settings);
  const bodies = await loadBodies(attempt.items.map((i) => i.questionId));
  const answers = await loadAnswers(attempt.id, attempt.items.length);
  const graded = scoreAttempt(
    attempt.items,
    attempt.items.map((i) => bodies.get(i.questionId) ?? null),
    answers,
    settings.scale,
  );
  const finishedAt = new Date(
    Math.min(Date.now(), new Date(attempt.deadline_at).getTime() + GRACE_MS),
  ).toISOString();
  const { data, error } = await db
    .from("exam_attempts")
    .update({
      status,
      finished_at: finishedAt,
      score: graded.score,
      correct_count: graded.correctCount,
      results: graded.results,
    })
    .eq("id", attempt.id)
    .eq("status", "in_progress")
    .select("*")
    .maybeSingle();
  if (error) throw new Error("Không nộp được bài");
  return (data as AttemptRow | null) ?? null;
}

/** Collect the paper if its time is up; returns the closed row when it did. */
export async function finishIfExpired(attemptId: string): Promise<AttemptRow | null> {
  const { data } = await examDb()
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  const attempt = data as AttemptRow | null;
  if (!attempt || attempt.status !== "in_progress") return null;
  if (Date.now() <= new Date(attempt.deadline_at).getTime() + GRACE_MS) return null;
  return finishAttempt(attempt, "timeout");
}

/** Start a new attempt, or return the one already running. Throws the reason when not allowed. */
export async function beginAttempt(
  studentId: string,
  assignment: AssignmentRow,
  userAgent: string,
  now = Date.now(),
): Promise<string> {
  const db = examDb();
  const { data: rows } = await db
    .from("exam_attempts")
    .select("id,status,counts_toward_attempts,attempt_no,deadline_at")
    .eq("assignment_id", assignment.id)
    .eq("student_id", studentId);
  const attempts = (rows ?? []) as {
    id: string;
    status: AttemptStatus;
    counts_toward_attempts: boolean;
    attempt_no: number;
    deadline_at: string;
  }[];
  for (const a of attempts)
    if (a.status === "in_progress" && now > new Date(a.deadline_at).getTime() + GRACE_MS) {
      const closed = await finishIfExpired(a.id);
      if (closed) a.status = closed.status;
    }
  const open = attempts.find((a) => a.status === "in_progress");
  if (open) return open.id;

  const state = windowState(assignment.opens_at, assignment.closes_at, now);
  if (state === "scheduled") throw new Error("Bài chưa đến giờ mở");
  if (state === "closed") throw new Error("Bài đã đóng");
  if (attempts.filter((a) => a.counts_toward_attempts).length >= assignment.max_attempts)
    throw new Error("Em đã dùng hết số lần làm bài");

  const exam = await drawForStudent(assignment, studentId);
  const { data: created, error } = await db
    .from("exam_attempts")
    .insert({
      assignment_id: assignment.id,
      student_id: studentId,
      owner_id: assignment.owner_id,
      attempt_no: attempts.reduce((m, a) => Math.max(m, a.attempt_no), 0) + 1,
      code: exam.code,
      items: exam.items,
      rules_accepted_at: new Date(now).toISOString(),
      started_at: new Date(now).toISOString(),
      deadline_at: new Date(now + assignment.duration_minutes * 60_000).toISOString(),
      user_agent: userAgent,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    // started twice at the same moment (double click, two tabs): use the one that won
    const { data: winner } = await db
      .from("exam_attempts")
      .select("id")
      .eq("assignment_id", assignment.id)
      .eq("student_id", studentId)
      .eq("status", "in_progress")
      .maybeSingle();
    if (winner) return (winner as { id: string }).id;
  }
  if (error || !created) throw new Error("Không bắt đầu được bài làm, hãy thử lại");
  return (created as { id: string }).id;
}

/**
 * Save one answer. Only reached questions accept answers; a complete answer to the furthest
 * question opens the next one. When the last question is first answered, every answer is
 * copied aside (the reference the edit rule compares against).
 */
export async function recordAnswer(
  attempt: AttemptRow,
  index: number,
  answer: StudentAnswer,
  now = Date.now(),
): Promise<{ reachedIndex: number; completedAll: boolean }> {
  if (attempt.status !== "in_progress") throw new Error("Bài làm đã kết thúc");
  if (now > new Date(attempt.deadline_at).getTime() + GRACE_MS)
    throw new Error("Đã hết giờ làm bài");
  const item = attempt.items[index];
  if (!item || index > attempt.reached_index) throw new Error("Câu này chưa mở");
  if (item.kind !== answer.kind) throw new Error("Câu trả lời không đúng dạng câu");
  const db = examDb();
  const at = new Date(now).toISOString();
  const [{ error }] = await Promise.all([
    db
      .from("exam_answers")
      .upsert({ attempt_id: attempt.id, item_index: index, answer, updated_at: at }),
    db.from("exam_answer_events").insert({ attempt_id: attempt.id, item_index: index, answer, at }),
  ]);
  if (error) throw new Error("Không lưu được câu trả lời");

  let reached = attempt.reached_index;
  let completedAll = attempt.completed_all_at !== null;
  if (index === reached && answerComplete(answer)) {
    const next = Math.min(reached + 1, attempt.items.length);
    const finishing = next >= attempt.items.length && !completedAll;
    const { data: moved } = await db
      .from("exam_attempts")
      .update({ reached_index: next, ...(finishing ? { completed_all_at: at } : {}) })
      .eq("id", attempt.id)
      .eq("reached_index", reached)
      .select("reached_index")
      .maybeSingle();
    if (moved) {
      reached = next;
      if (finishing) {
        completedAll = true;
        const { data: all } = await db
          .from("exam_answers")
          .select("item_index,answer")
          .eq("attempt_id", attempt.id);
        for (const r of (all ?? []) as { item_index: number; answer: unknown }[])
          await db
            .from("exam_answers")
            .update({ answer_at_completion: r.answer })
            .eq("attempt_id", attempt.id)
            .eq("item_index", r.item_index);
      }
    }
  }
  return { reachedIndex: reached, completedAll };
}
