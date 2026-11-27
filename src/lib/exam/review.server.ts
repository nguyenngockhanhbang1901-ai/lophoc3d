// Reading attempts back: the teacher's detail and report, the student's history and review.
// Server-only; ownership (teacher) or the student's own id is checked before anything is read.
import { readSettings, scoreAttempt, type AttemptStatus } from "./assignment";
import { loadAnswers, loadBodies, type AttemptRow } from "./attempt.server";
import { examDb } from "./db.server";
import type { StudentAnswer } from "./grading";
import { studentAnswerSchema } from "./assignment";
import {
  answerLog,
  attemptTimeline,
  itemLabels,
  reviewAllowed,
  reviewQuestion,
  type AnswerEvent,
  type LoggedAnswer,
  type ReviewQuestion,
  type TimelineEntry,
} from "./review";

interface AssignmentMeta {
  id: string;
  title: string;
  owner_id: string;
  class_id: string;
  closes_at: string;
  settings: unknown;
}

interface ViolationRow {
  attempt_id: string;
  kind: string;
  at: string;
  counted: boolean;
  away_ms: number | null;
}
interface DropRow {
  attempt_id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  drop_number: number;
  outcome: string;
}

async function questionsOf(attempt: AttemptRow, scale: number): Promise<ReviewQuestion[]> {
  const [bodies, answers] = await Promise.all([
    loadBodies(attempt.items.map((i) => i.questionId)),
    loadAnswers(attempt.id, attempt.items.length),
  ]);
  const list = attempt.items.map((i) => bodies.get(i.questionId) ?? null);
  const graded = scoreAttempt(attempt.items, list, answers, scale);
  return attempt.items.map((item, i) =>
    reviewQuestion(item, list[i] ?? null, answers[i] ?? null, graded.results[i] ?? null),
  );
}

function parseEvents(rows: unknown[]): AnswerEvent[] {
  const out: AnswerEvent[] = [];
  for (const r of rows as { item_index: number; answer: unknown; at: string }[]) {
    const a = studentAnswerSchema.safeParse(r.answer);
    if (a.success)
      out.push({ item_index: r.item_index, answer: a.data as StudentAnswer, at: r.at });
  }
  return out;
}

export interface AttemptDetail {
  id: string;
  attemptNo: number;
  status: AttemptStatus;
  code: string;
  startedAt: string;
  completedAllAt: string | null;
  finishedAt: string | null;
  deadlineAt: string;
  score: number | null;
  scale: number;
  violationCount: number;
  disconnectCount: number;
  editCount: number;
  userAgent: string;
  labels: string[];
  questions: ReviewQuestion[];
  log: LoggedAnswer[];
  timeline: TimelineEntry[];
}

/** Everything about one attempt, for its teacher. */
export async function teacherAttemptDetail(
  ownerId: string,
  attemptId: string,
): Promise<AttemptDetail> {
  const db = examDb();
  const { data } = await db
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data) throw new Error("Không tìm thấy lượt làm bài");
  const attempt = data as AttemptRow & { user_agent: string | null };
  const [{ data: a }, { data: events }, { data: violations }, { data: drops }] = await Promise.all([
    db.from("exam_assignments").select("settings").eq("id", attempt.assignment_id).maybeSingle(),
    db
      .from("exam_answer_events")
      .select("item_index,answer,at")
      .eq("attempt_id", attempt.id)
      .order("at"),
    db
      .from("exam_violations")
      .select("attempt_id,kind,at,counted,away_ms")
      .eq("attempt_id", attempt.id),
    db
      .from("exam_connection_events")
      .select("attempt_id,started_at,ended_at,duration_ms,drop_number,outcome")
      .eq("attempt_id", attempt.id),
  ]);
  const scale = readSettings((a as { settings: unknown } | null)?.settings).scale;
  const labels = itemLabels(attempt.items.map((i) => i.kind));
  const log = answerLog(parseEvents(events ?? []), attempt.completed_all_at);
  return {
    id: attempt.id,
    attemptNo: attempt.attempt_no,
    status: attempt.status,
    code: attempt.code,
    startedAt: attempt.started_at,
    completedAllAt: attempt.completed_all_at,
    finishedAt: attempt.finished_at,
    deadlineAt: attempt.deadline_at,
    score: attempt.score === null ? null : Number(attempt.score),
    scale,
    violationCount: attempt.violation_count ?? 0,
    disconnectCount: attempt.disconnect_count ?? 0,
    editCount: attempt.edit_count ?? 0,
    userAgent: attempt.user_agent ?? "",
    labels,
    questions: await questionsOf(attempt, scale),
    log,
    timeline: attemptTimeline({
      startedAt: attempt.started_at,
      completedAllAt: attempt.completed_all_at,
      finishedAt: attempt.finished_at,
      status: attempt.status,
      labels,
      log,
      violations: (violations ?? []) as ViolationRow[],
      drops: (drops ?? []) as DropRow[],
    }),
  };
}

export interface ReportAttempt {
  studentId: string;
  attemptNo: number;
  status: AttemptStatus;
  counts: boolean;
  code: string;
  startedAt: string;
  completedAllAt: string | null;
  finishedAt: string | null;
  score: number | null;
  correctCount: number | null;
  questionCount: number;
  violationCount: number;
  disconnectCount: number;
  editCount: number;
}
export interface AssignmentReport {
  title: string;
  scale: number;
  scoreRule: string;
  students: { id: string; fullName: string; username: string; studentCode: string | null }[];
  attempts: ReportAttempt[];
  edits: {
    studentId: string;
    attemptNo: number;
    at: string;
    label: string;
    before: StudentAnswer | null;
    after: StudentAnswer;
    afterCompletion: boolean;
  }[];
  incidents: {
    studentId: string;
    attemptNo: number;
    at: string;
    kind: string;
    counted: boolean;
    durationMs: number | null;
    outcome: string | null;
  }[];
}

/** All attempts of an assignment with their logs, for the Excel export. */
export async function teacherAssignmentReport(
  ownerId: string,
  assignmentId: string,
): Promise<AssignmentReport> {
  const db = examDb();
  const { data: a } = await db
    .from("exam_assignments")
    .select("id,title,owner_id,class_id,closes_at,settings")
    .eq("id", assignmentId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!a) throw new Error("Không tìm thấy bài giao");
  const assignment = a as AssignmentMeta;
  const settings = readSettings(assignment.settings);
  const [{ data: students }, { data: rows }] = await Promise.all([
    db
      .from("exam_students")
      .select("id,full_name,username,student_code")
      .eq("class_id", assignment.class_id)
      .order("created_at")
      .order("full_name"),
    db.from("exam_attempts").select("*").eq("assignment_id", assignment.id).order("attempt_no"),
  ]);
  const attempts = (rows ?? []) as AttemptRow[];
  const ids = attempts.map((x) => x.id);
  const byId = new Map(attempts.map((x) => [x.id, x]));
  const [events, violations, drops] = ids.length
    ? await Promise.all([
        inChunks(ids, (chunk) =>
          db
            .from("exam_answer_events")
            .select("attempt_id,item_index,answer,at")
            .in("attempt_id", chunk)
            .order("at"),
        ),
        inChunks(ids, (chunk) =>
          db
            .from("exam_violations")
            .select("attempt_id,kind,at,counted,away_ms")
            .in("attempt_id", chunk),
        ),
        inChunks(ids, (chunk) =>
          db
            .from("exam_connection_events")
            .select("attempt_id,started_at,ended_at,duration_ms,drop_number,outcome")
            .in("attempt_id", chunk),
        ),
      ])
    : [[], [], []];
  const eventsBy = new Map<string, unknown[]>();
  for (const e of events as { attempt_id: string }[])
    eventsBy.set(e.attempt_id, [...(eventsBy.get(e.attempt_id) ?? []), e]);
  const edits: AssignmentReport["edits"] = [];
  for (const at of attempts) {
    const labels = itemLabels(at.items.map((i) => i.kind));
    for (const l of answerLog(parseEvents(eventsBy.get(at.id) ?? []), at.completed_all_at))
      if (l.before)
        edits.push({
          studentId: at.student_id,
          attemptNo: at.attempt_no,
          at: l.at,
          label: labels[l.index] ?? `Câu ${l.index + 1}`,
          before: l.before,
          after: l.after,
          afterCompletion: l.afterCompletion,
        });
  }
  const incidents: AssignmentReport["incidents"] = [
    ...(violations as ViolationRow[]).map((v) => ({
      studentId: byId.get(v.attempt_id)?.student_id ?? "",
      attemptNo: byId.get(v.attempt_id)?.attempt_no ?? 0,
      at: v.at,
      kind: v.kind,
      counted: v.counted,
      durationMs: v.away_ms,
      outcome: null,
    })),
    ...(drops as DropRow[]).map((d) => ({
      studentId: byId.get(d.attempt_id)?.student_id ?? "",
      attemptNo: byId.get(d.attempt_id)?.attempt_no ?? 0,
      at: d.started_at,
      kind: "drop",
      counted: d.outcome === "new_exam_counted",
      durationMs: d.duration_ms,
      outcome: d.outcome,
    })),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
  return {
    title: (assignment as { title: string }).title,
    scale: settings.scale,
    scoreRule: settings.scoreRule,
    students: (
      (students ?? []) as {
        id: string;
        full_name: string;
        username: string;
        student_code: string | null;
      }[]
    ).map((s) => ({
      id: s.id,
      fullName: s.full_name,
      username: s.username,
      studentCode: s.student_code,
    })),
    attempts: attempts.map((x) => ({
      studentId: x.student_id,
      attemptNo: x.attempt_no,
      status: x.status,
      counts: x.counts_toward_attempts,
      code: x.code,
      startedAt: x.started_at,
      completedAllAt: x.completed_all_at,
      finishedAt: x.finished_at,
      score: x.score === null ? null : Number(x.score),
      correctCount: x.correct_count,
      questionCount: x.items.length,
      violationCount: x.violation_count ?? 0,
      disconnectCount: x.disconnect_count ?? 0,
      editCount: x.edit_count ?? 0,
    })),
    edits,
    incidents,
  };
}

async function inChunks<T>(
  ids: string[],
  query: (chunk: string[]) => PromiseLike<{ data: unknown[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await query(ids.slice(i, i + 100));
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export interface HistoryEntry {
  attemptId: string;
  assignmentId: string;
  title: string;
  attemptNo: number;
  status: AttemptStatus;
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  scale: number;
  canReview: boolean;
  /** when the key becomes visible, if later */
  reviewFrom: string | null;
}

/** Every attempt of the student, newest first. */
export async function studentHistory(studentId: string, now = Date.now()): Promise<HistoryEntry[]> {
  const db = examDb();
  const { data } = await db
    .from("exam_attempts")
    .select("id,assignment_id,attempt_no,status,started_at,finished_at,score")
    .eq("student_id", studentId)
    .order("started_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as {
    id: string;
    assignment_id: string;
    attempt_no: number;
    status: AttemptStatus;
    started_at: string;
    finished_at: string | null;
    score: number | null;
  }[];
  if (!rows.length) return [];
  const { data: as } = await db
    .from("exam_assignments")
    .select("id,title,closes_at,settings")
    .in("id", [...new Set(rows.map((r) => r.assignment_id))]);
  const meta = new Map(
    ((as ?? []) as Pick<AssignmentMeta, "id" | "title" | "closes_at" | "settings">[]).map((x) => [
      x.id,
      x,
    ]),
  );
  return rows
    .filter((r) => meta.has(r.assignment_id))
    .map((r) => {
      const m = meta.get(r.assignment_id)!;
      const s = readSettings(m.settings);
      const can = reviewAllowed(s.review, r.status, m.closes_at, now);
      const later =
        !can &&
        s.review === "after_close" &&
        reviewAllowed(s.review, r.status, m.closes_at, Number.MAX_SAFE_INTEGER);
      return {
        attemptId: r.id,
        assignmentId: r.assignment_id,
        title: m.title,
        attemptNo: r.attempt_no,
        status: r.status,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        score: r.score === null ? null : Number(r.score),
        scale: s.scale,
        canReview: can,
        reviewFrom: later ? m.closes_at : null,
      };
    });
}

/** The key of one finished attempt, when the assignment's review setting allows it. */
export async function studentReview(
  studentId: string,
  attemptId: string,
  now = Date.now(),
): Promise<{
  title: string;
  score: number | null;
  scale: number;
  labels: string[];
  questions: ReviewQuestion[];
}> {
  const db = examDb();
  const { data } = await db
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!data) throw new Error("Không tìm thấy bài làm");
  const attempt = data as AttemptRow;
  const { data: a } = await db
    .from("exam_assignments")
    .select("title,closes_at,settings")
    .eq("id", attempt.assignment_id)
    .maybeSingle();
  if (!a) throw new Error("Không tìm thấy bài được giao");
  const m = a as Pick<AssignmentMeta, "title" | "closes_at" | "settings">;
  const s = readSettings(m.settings);
  if (!reviewAllowed(s.review, attempt.status, m.closes_at, now))
    throw new Error(
      s.review === "after_close"
        ? "Em được xem lại đáp án sau giờ đóng bài"
        : "Giáo viên không cho xem lại đáp án bài này",
    );
  return {
    title: m.title,
    score: attempt.score === null ? null : Number(attempt.score),
    scale: s.scale,
    labels: itemLabels(attempt.items.map((i) => i.kind)),
    questions: await questionsOf(attempt, s.scale),
  };
}
