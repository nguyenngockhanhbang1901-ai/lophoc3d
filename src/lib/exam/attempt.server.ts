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
import {
  DEVICE_TAKEOVER_MS,
  DROP_THRESHOLD_MS,
  editVerdict,
  editedCount,
  isMobileUserAgent,
  networkDecision,
  retakeState,
  type DropOutcome,
  type ViolationKind,
} from "./anticheat";
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
  violation_count: number;
  disconnect_count: number;
  last_heartbeat_at: string | null;
  session_hash: string | null;
  edit_warned_at: string | null;
  edit_count: number;
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
  options: { counts?: boolean; now?: number; extra?: Record<string, unknown> } = {},
): Promise<AttemptRow | null> {
  const now = options.now ?? Date.now();
  const cancelled = status === "cancelled_network" || status === "cancelled_edit";
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
    Math.min(now, new Date(attempt.deadline_at).getTime() + GRACE_MS),
  ).toISOString();
  const { data, error } = await db
    .from("exam_attempts")
    .update({
      ...options.extra,
      status,
      finished_at: finishedAt,
      // a cancelled paper keeps its answers for the teacher but has no score
      score: cancelled ? null : graded.score,
      correct_count: cancelled ? null : graded.correctCount,
      results: graded.results,
      ...(options.counts === undefined ? {} : { counts_toward_attempts: options.counts }),
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
  deviceHash: string | null = null,
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

  const settings = readSettings(assignment.settings);
  if (settings.devices === "computer" && isMobileUserAgent(userAgent))
    throw new Error("Bài này chỉ được làm trên máy tính");
  const state = windowState(assignment.opens_at, assignment.closes_at, now);
  const grant = await activeGrant(assignment.id, studentId, now);
  const retake = retakeState(
    attempts,
    assignment.max_attempts,
    settings.autoRetakes,
    state,
    grant !== null,
  );
  if (retake.kind === "scheduled") throw new Error("Bài chưa đến giờ mở");
  if (retake.kind === "closed") throw new Error("Bài đã đóng");
  if (retake.kind === "wait_teacher") throw new Error(retake.reason);

  // a teacher's permission is used up by the attempt it opens
  let usedGrant: string | null = null;
  if (retake.grant && grant) {
    const { data: claimed } = await db
      .from("exam_retake_grants")
      .update({ used_at: new Date(now).toISOString() })
      .eq("id", grant.id)
      .is("used_at", null)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) throw new Error("Quyền thi lại không còn hiệu lực, em hãy tải lại trang");
    usedGrant = grant.id;
  }

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
      last_heartbeat_at: new Date(now).toISOString(),
      session_hash: deviceHash,
      user_agent: userAgent.slice(0, 300),
    })
    .select("id")
    .single();
  if (error || !created) {
    if (usedGrant)
      await db
        .from("exam_retake_grants")
        .update({ used_at: null })
        .eq("id", usedGrant)
        .is("used_attempt_id", null);
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
    throw new Error("Không bắt đầu được bài làm, hãy thử lại");
  }
  const id = (created as { id: string }).id;
  if (usedGrant)
    await db.from("exam_retake_grants").update({ used_attempt_id: id }).eq("id", usedGrant);
  return id;
}

export interface GrantRow {
  id: string;
  assignment_id: string;
  student_id: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
  used_at: string | null;
  used_attempt_id: string | null;
  revoked_at: string | null;
}

export function grantActive(g: GrantRow, now: number): boolean {
  return !g.used_at && !g.revoked_at && (!g.expires_at || new Date(g.expires_at).getTime() > now);
}

/** The student's oldest usable permission to retake this assignment, if any. */
export async function activeGrant(
  assignmentId: string,
  studentId: string,
  now = Date.now(),
): Promise<GrantRow | null> {
  const { data } = await examDb()
    .from("exam_retake_grants")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .is("used_at", null)
    .is("revoked_at", null)
    .order("created_at");
  return ((data ?? []) as GrantRow[]).find((g) => grantActive(g, now)) ?? null;
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
): Promise<AnswerOutcome> {
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
  // changes after the first full pass are what the edit rule watches
  if (completedAll)
    return { reachedIndex: reached, completedAll, ...(await checkEdits(attempt, now)) };
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
  return { reachedIndex: reached, completedAll, editWarning: false, status: "in_progress" };
}

export interface AnswerOutcome {
  reachedIndex: number;
  completedAll: boolean;
  /** the warning "Bài thi có dấu hiệu gian lận" should be shown now */
  editWarning: boolean;
  /** cancelled_edit when this change broke the edit rule */
  status: AttemptStatus;
}

async function checkEdits(
  attempt: AttemptRow,
  now: number,
): Promise<{ editWarning: boolean; status: AttemptStatus }> {
  const db = examDb();
  const [{ data: a }, { data: rows }] = await Promise.all([
    db.from("exam_assignments").select("settings").eq("id", attempt.assignment_id).maybeSingle(),
    db
      .from("exam_answers")
      .select("item_index,answer,answer_at_completion")
      .eq("attempt_id", attempt.id),
  ]);
  const settings = readSettings((a as { settings: unknown } | null)?.settings);
  const count = attempt.items.length;
  const current: (StudentAnswer | null)[] = Array.from({ length: count }, () => null);
  const first: (StudentAnswer | null)[] = Array.from({ length: count }, () => null);
  for (const r of (rows ?? []) as {
    item_index: number;
    answer: unknown;
    answer_at_completion: unknown;
  }[]) {
    if (r.item_index >= count) continue;
    const c = studentAnswerSchema.safeParse(r.answer);
    const f = studentAnswerSchema.safeParse(r.answer_at_completion);
    if (c.success) current[r.item_index] = c.data;
    if (f.success) first[r.item_index] = f.data;
  }
  const edited = editedCount(current, first);
  const started = new Date(attempt.started_at).getTime();
  const verdict = editVerdict(
    {
      total: count,
      edited,
      firstPassMs: new Date(attempt.completed_all_at ?? attempt.started_at).getTime() - started,
      durationMs: new Date(attempt.deadline_at).getTime() - started,
      warned: attempt.edit_warned_at !== null,
    },
    settings.editRule,
  );
  const at = new Date(now).toISOString();
  if (verdict === "cancel") {
    const closed = await finishAttempt(attempt, "cancelled_edit", {
      counts: true,
      now,
      extra: { edit_count: edited },
    });
    return { editWarning: false, status: closed?.status ?? "cancelled_edit" };
  }
  if (verdict === "warn") {
    const { data: warned } = await db
      .from("exam_attempts")
      .update({ edit_warned_at: at, edit_count: edited })
      .eq("id", attempt.id)
      .eq("status", "in_progress")
      .is("edit_warned_at", null)
      .select("id")
      .maybeSingle();
    if (warned) {
      await db.from("exam_violations").insert({
        attempt_id: attempt.id,
        owner_id: attempt.owner_id,
        kind: "edit_warning",
        counted: false,
        at,
      });
      return { editWarning: true, status: "in_progress" };
    }
    return { editWarning: false, status: "in_progress" };
  }
  if (edited !== attempt.edit_count)
    await db.from("exam_attempts").update({ edit_count: edited }).eq("id", attempt.id);
  return { editWarning: false, status: "in_progress" };
}

export interface DropReport {
  durationMs: number;
  dropNumber: number;
  outcome: DropOutcome;
}

/**
 * Every request from the exam screen passes through here. It keeps the paper on one device
 * (another may take over only after the first has gone silent), notices a lost connection from
 * the silence since the last request and applies the network rule. Returns the attempt as it
 * now stands, and the drop when one was found.
 */
export async function touchAttempt(
  attempt: AttemptRow,
  deviceHash: string,
  now = Date.now(),
): Promise<{ attempt: AttemptRow; drop: DropReport | null }> {
  if (attempt.status !== "in_progress") return { attempt, drop: null };
  const db = examDb();
  const last = attempt.last_heartbeat_at ?? attempt.started_at;
  const silence = Math.max(0, now - new Date(last).getTime());
  const otherDevice = attempt.session_hash !== null && attempt.session_hash !== deviceHash;
  if (otherDevice && silence < DEVICE_TAKEOVER_MS)
    throw new Error("Bài đang được làm trên một thiết bị khác");
  if (!otherDevice && attempt.session_hash !== null && silence < 3_000)
    return { attempt, drop: null };

  const at = new Date(now).toISOString();
  let claim = db
    .from("exam_attempts")
    .update({ last_heartbeat_at: at, session_hash: deviceHash })
    .eq("id", attempt.id)
    .eq("status", "in_progress");
  claim =
    attempt.last_heartbeat_at === null
      ? claim.is("last_heartbeat_at", null)
      : claim.eq("last_heartbeat_at", attempt.last_heartbeat_at);
  const { data: claimed } = await claim.select("*").maybeSingle();
  if (!claimed) {
    // another request from the same screen got here first and did the work
    const { data } = await db.from("exam_attempts").select("*").eq("id", attempt.id).maybeSingle();
    const fresh = (data as AttemptRow | null) ?? attempt;
    if (fresh.session_hash !== null && fresh.session_hash !== deviceHash)
      throw new Error("Bài đang được làm trên một thiết bị khác");
    return { attempt: fresh, drop: null };
  }
  let row = claimed as AttemptRow;
  if (otherDevice)
    await db.from("exam_violations").insert({
      attempt_id: attempt.id,
      owner_id: attempt.owner_id,
      kind: "second_device",
      counted: false,
      at,
    });
  if (silence <= DROP_THRESHOLD_MS) return { attempt: row, drop: null };

  const [{ data: a }, { count }] = await Promise.all([
    db.from("exam_assignments").select("settings").eq("id", attempt.assignment_id).maybeSingle(),
    db
      .from("exam_connection_events")
      .select("id", { count: "exact", head: true })
      .eq("assignment_id", attempt.assignment_id)
      .eq("student_id", attempt.student_id),
  ]);
  const settings = readSettings((a as { settings: unknown } | null)?.settings);
  const dropNumber = (count ?? 0) + 1;
  const outcome = networkDecision(silence, dropNumber, settings.network);
  await db.from("exam_connection_events").insert({
    attempt_id: attempt.id,
    assignment_id: attempt.assignment_id,
    student_id: attempt.student_id,
    owner_id: attempt.owner_id,
    started_at: last,
    ended_at: at,
    duration_ms: Math.round(silence),
    drop_number: dropNumber,
    outcome,
  });
  const disconnects = row.disconnect_count + 1;
  if (outcome === "continue") {
    await db.from("exam_attempts").update({ disconnect_count: disconnects }).eq("id", row.id);
    row = { ...row, disconnect_count: disconnects };
  } else {
    const closed = await finishAttempt(row, "cancelled_network", {
      counts: outcome === "new_exam_counted",
      now,
      extra: { disconnect_count: disconnects },
    });
    if (closed) row = closed;
  }
  return { attempt: row, drop: { durationMs: silence, dropNumber, outcome } };
}

/**
 * One leaving-the-exam episode (full screen exit, tab switch, window blur). Past the
 * assignment's warnings the paper is collected with status violation.
 */
export async function reportViolation(
  attempt: AttemptRow,
  kind: ViolationKind,
  awayMs: number | null,
  now = Date.now(),
): Promise<{ violationCount: number; maxWarnings: number; status: AttemptStatus }> {
  const db = examDb();
  const { data: a } = await db
    .from("exam_assignments")
    .select("settings")
    .eq("id", attempt.assignment_id)
    .maybeSingle();
  const { maxWarnings } = readSettings((a as { settings: unknown } | null)?.settings);
  if (attempt.status !== "in_progress")
    return { violationCount: attempt.violation_count, maxWarnings, status: attempt.status };
  const at = new Date(now).toISOString();
  await db.from("exam_violations").insert({
    attempt_id: attempt.id,
    owner_id: attempt.owner_id,
    kind,
    counted: true,
    away_ms: awayMs === null ? null : Math.round(Math.min(awayMs, 2_000_000_000)),
    at,
  });
  let row = attempt;
  for (let tries = 0; tries < 5; tries++) {
    const { data: moved } = await db
      .from("exam_attempts")
      .update({ violation_count: row.violation_count + 1 })
      .eq("id", row.id)
      .eq("status", "in_progress")
      .eq("violation_count", row.violation_count)
      .select("*")
      .maybeSingle();
    if (moved) {
      row = moved as AttemptRow;
      break;
    }
    const { data } = await db.from("exam_attempts").select("*").eq("id", row.id).maybeSingle();
    row = data as AttemptRow;
    if (!row || row.status !== "in_progress")
      return {
        violationCount: row?.violation_count ?? attempt.violation_count,
        maxWarnings,
        status: row?.status ?? attempt.status,
      };
  }
  if (row.violation_count > maxWarnings) {
    const closed = await finishAttempt(row, "violation", { now });
    return {
      violationCount: row.violation_count,
      maxWarnings,
      status: closed?.status ?? "violation",
    };
  }
  return { violationCount: row.violation_count, maxWarnings, status: "in_progress" };
}
