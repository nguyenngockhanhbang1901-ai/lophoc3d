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
import { retakeState, type ViolationKind } from "./anticheat";
import type { StudentAnswer } from "./grading";
import type { QuestionKind } from "./questions";

const token = z.string().regex(/^[0-9a-f]{64}$/);
const uuid = z.string().uuid();
/** random key the exam screen makes once per tab; the paper stays bound to it */
const device = z.string().regex(/^[0-9a-f]{32}$/);

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
  /** a new attempt may be started now (first, next, or automatic retake) */
  canStart: boolean;
  /** the teacher allowed one more attempt (expiry, or null for no limit) */
  grant: { expiresAt: string | null } | null;
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

export interface DropInfo {
  durationMs: number;
  dropNumber: number;
  outcome: "continue" | "new_exam" | "new_exam_counted";
}

export interface AttemptView {
  id: string;
  assignmentId: string;
  violationCount: number;
  disconnectCount: number;
  editWarned: boolean;
  /** a connection drop found by this request */
  drop: DropInfo | null;
  /** for a closed attempt: whether a new exam may be started right away */
  retake: { allowed: boolean; reason: string | null } | null;
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

async function ownAttempt(tokenValue: string, attemptId: string, deviceKey?: string) {
  const { sessionStudent, examDb } = await import("./db.server");
  const { finishIfExpired, touchAttempt } = await import("./attempt.server");
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
  let drop: DropInfo | null = null;
  if (deviceKey && attempt.status === "in_progress") {
    const { hashToken } = await import("./secrets");
    const touched = await touchAttempt(attempt, await hashToken(deviceKey));
    attempt = touched.attempt;
    drop = touched.drop;
  }
  return { student, attempt, drop };
}

async function retakeFor(studentId: string, assignmentId: string) {
  const { examDb } = await import("./db.server");
  const db = examDb();
  const [{ data: a }, { data: rows }] = await Promise.all([
    db
      .from("exam_assignments")
      .select("opens_at,closes_at,max_attempts,settings")
      .eq("id", assignmentId)
      .maybeSingle(),
    db
      .from("exam_attempts")
      .select("status,counts_toward_attempts,attempt_no")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId),
  ]);
  const assignment = a as Pick<
    Assignment,
    "opens_at" | "closes_at" | "max_attempts" | "settings"
  > | null;
  if (!assignment) return { allowed: false, reason: "Không tìm thấy bài được giao" };
  const { activeGrant } = await import("./attempt.server");
  const state = retakeState(
    (rows ?? []) as Parameters<typeof retakeState>[0],
    assignment.max_attempts,
    readSettings(assignment.settings).autoRetakes,
    windowState(assignment.opens_at, assignment.closes_at, Date.now()),
    (await activeGrant(assignmentId, studentId)) !== null,
  );
  if (state.kind === "allowed") return { allowed: true, reason: null };
  return {
    allowed: false,
    reason:
      state.kind === "wait_teacher"
        ? state.reason
        : state.kind === "closed"
          ? "Bài đã đóng"
          : "Bài chưa đến giờ mở",
  };
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
    const { data: grantRows } = list.length
      ? await db
          .from("exam_retake_grants")
          .select("assignment_id,expires_at,used_at,revoked_at")
          .eq("student_id", student.id)
          .is("used_at", null)
          .is("revoked_at", null)
          .in(
            "assignment_id",
            list.map((a) => a.id),
          )
      : { data: [] };
    const grantOf = new Map<string, { expiresAt: string | null }>();
    for (const g of (grantRows ?? []) as { assignment_id: string; expires_at: string | null }[])
      if (!g.expires_at || new Date(g.expires_at).getTime() > now)
        grantOf.set(g.assignment_id, { expiresAt: g.expires_at });
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
          canStart:
            retakeState(
              own,
              a.max_attempts,
              readSettings(a.settings).autoRetakes,
              windowState(a.opens_at, a.closes_at, now),
              grantOf.has(a.id),
            ).kind === "allowed",
          grant: grantOf.get(a.id) ?? null,
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
        .select("id,status,counts_toward_attempts,deadline_at,attempt_no")
        .eq("assignment_id", assignment.id)
        .eq("student_id", student.id),
    ]);
    const now = Date.now();
    const rows = (attempts ?? []) as {
      id: string;
      status: AttemptStatus;
      counts_toward_attempts: boolean;
      deadline_at: string;
      attempt_no: number;
    }[];
    const open = rows.find(
      (r) => r.status === "in_progress" && new Date(r.deadline_at).getTime() > now,
    );
    const used = attemptsUsedOf(rows);
    const state = windowState(assignment.opens_at, assignment.closes_at, now);
    const slots = Array.isArray(assignment.slots) ? assignment.slots : [];
    const partCounts: Record<QuestionKind, number> = { mcq: 0, tf: 0, short: 0 };
    for (const s of slots) partCounts[s.kind] += 1;
    const settings = readSettings(assignment.settings);
    let blocked: string | null = null;
    if (!open) {
      const { activeGrant } = await import("./attempt.server");
      const retake = retakeState(
        rows,
        assignment.max_attempts,
        settings.autoRetakes,
        state,
        (await activeGrant(assignment.id, student.id)) !== null,
      );
      if (retake.kind === "scheduled") blocked = "Bài chưa đến giờ mở";
      else if (retake.kind === "closed") blocked = "Bài đã đóng";
      else if (retake.kind === "wait_teacher") blocked = retake.reason;
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
      settings,
      canStart: !blocked,
      blocked,
    };
  });

/** Start (or resume) an attempt. Requires the rules to have been accepted on this screen. */
export const startAttempt = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, assignmentId: uuid, acceptRules: z.literal(true), device }))
  .handler(async ({ data }): Promise<{ attemptId: string }> => {
    const { requestUserAgent } = await import("./db.server");
    const { beginAttempt } = await import("./attempt.server");
    const { hashToken } = await import("./secrets");
    const { student, assignment } = await studentAndAssignment(data.token, data.assignmentId);
    return {
      attemptId: await beginAttempt(
        student.id,
        assignment,
        requestUserAgent(),
        Date.now(),
        await hashToken(data.device),
      ),
    };
  });

export const attemptView = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, attemptId: uuid, device }))
  .handler(async ({ data }): Promise<AttemptView> => {
    const { examDb } = await import("./db.server");
    const { loadAnswers } = await import("./attempt.server");
    const { attempt, drop, student } = await ownAttempt(data.token, data.attemptId, data.device);
    const { data: a } = await examDb()
      .from("exam_assignments")
      .select("title,settings")
      .eq("id", attempt.assignment_id)
      .maybeSingle();
    const assignment = a as { title: string; settings: unknown } | null;
    return {
      id: attempt.id,
      assignmentId: attempt.assignment_id,
      violationCount: attempt.violation_count ?? 0,
      disconnectCount: attempt.disconnect_count ?? 0,
      editWarned: !!attempt.edit_warned_at,
      drop,
      retake:
        attempt.status === "in_progress"
          ? null
          : await retakeFor(student.id, attempt.assignment_id),
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
  .inputValidator(
    z.object({ token, attemptId: uuid, index: z.number().int().min(0).max(199), device }),
  )
  .handler(async ({ data }): Promise<StudentQuestion> => {
    const { loadBodies } = await import("./attempt.server");
    const { attempt } = await ownAttempt(data.token, data.attemptId, data.device);
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
      device,
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      reachedIndex: number;
      completedAll: boolean;
      editWarning: boolean;
      status: AttemptStatus;
      drop: DropInfo | null;
    }> => {
      const { recordAnswer } = await import("./attempt.server");
      const { attempt, drop } = await ownAttempt(data.token, data.attemptId, data.device);
      if (attempt.status !== "in_progress")
        return {
          reachedIndex: attempt.reached_index,
          completedAll: attempt.completed_all_at !== null,
          editWarning: false,
          status: attempt.status,
          drop,
        };
      return { ...(await recordAnswer(attempt, data.index, data.answer as StudentAnswer)), drop };
    },
  );

/** The exam screen's "still here" signal; also how a lost connection is noticed. */
export const attemptPulse = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, attemptId: uuid, device }))
  .handler(
    async ({
      data,
    }): Promise<{ status: AttemptStatus; serverNow: string; drop: DropInfo | null }> => {
      const { attempt, drop } = await ownAttempt(data.token, data.attemptId, data.device);
      return { status: attempt.status, serverNow: new Date().toISOString(), drop };
    },
  );

export const reportLeave = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      attemptId: uuid,
      device,
      kind: z.enum(["fullscreen_exit", "tab_hidden", "window_blur"]),
      awayMs: z.number().min(0).max(1e9).nullable(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{ violationCount: number; maxWarnings: number; status: AttemptStatus }> => {
      const { reportViolation } = await import("./attempt.server");
      const { attempt } = await ownAttempt(data.token, data.attemptId, data.device);
      return reportViolation(attempt, data.kind as ViolationKind, data.awayMs);
    },
  );

export const submitAttempt = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, attemptId: uuid, device }))
  .handler(
    async ({
      data,
    }): Promise<{ status: AttemptStatus; score: number | null; correctCount: number | null }> => {
      const { finishAttempt, GRACE_MS } = await import("./attempt.server");
      const { attempt } = await ownAttempt(data.token, data.attemptId, data.device);
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

export const myNotices = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const { sessionStudent } = await import("./db.server");
    const { studentNotices } = await import("./retakes.server");
    const { student } = await sessionStudent(data.token);
    return { notices: await studentNotices(student.id, student.class_id) };
  });

export const readNotices = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const { sessionStudent } = await import("./db.server");
    const { markNoticesRead } = await import("./retakes.server");
    const { student } = await sessionStudent(data.token);
    await markNoticesRead(student.id);
    return { ok: true };
  });
