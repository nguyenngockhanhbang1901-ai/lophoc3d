// Anti-cheat rules as pure functions, shared by the server (which decides) and the exam screen
// (which explains): what a lost connection costs, when changing answers after a first pass
// counts as cheating, which devices may sit the exam, and when a new exam is given without
// the teacher.
import { sameAnswer, type AssignmentSettings, type AttemptStatus } from "./assignment";
import type { StudentAnswer } from "./grading";
import { normalizeShortInput } from "./questions";

/** Silence longer than this between the exam screen and the server is a lost connection. */
export const DROP_THRESHOLD_MS = 15_000;
/** How often the exam screen reports that it is still there. */
export const HEARTBEAT_MS = 5_000;
/** Another device may take over an attempt only after the first has been silent this long. */
export const DEVICE_TAKEOVER_MS = 30_000;

export type DropOutcome = "continue" | "new_exam" | "new_exam_counted";

/**
 * What a lost connection costs. dropNumber counts every drop of this student on this
 * assignment, this one included.
 * - short (< shortMinutes) and within freeDrops: carry on with the same paper;
 * - longer, or past freeDrops: a new exam, not counted as an attempt;
 * - longer than longMinutes, or past uncountedDrops: a new exam, counted as an attempt.
 */
export function networkDecision(
  durationMs: number,
  dropNumber: number,
  network: AssignmentSettings["network"],
): DropOutcome {
  if (durationMs > network.longMinutes * 60_000 || dropNumber > network.uncountedDrops)
    return "new_exam_counted";
  if (durationMs >= network.shortMinutes * 60_000 || dropNumber > network.freeDrops)
    return "new_exam";
  return "continue";
}

export const DROP_OUTCOME_LABEL: Record<DropOutcome, string> = {
  continue: "Làm tiếp",
  new_exam: "Làm đề mới, không tính lượt",
  new_exam_counted: "Làm đề mới, tính lượt",
};

/** Two answers to the same question are the same choice (short answers compared as typed values). */
export function sameChoice(
  a: StudentAnswer | null | undefined,
  b: StudentAnswer | null | undefined,
): boolean {
  if (a?.kind === "short" && b?.kind === "short")
    return normalizeShortInput(a.text) === normalizeShortInput(b.text);
  return sameAnswer(a, b);
}

/** Questions whose answer now differs from the answer given on the first pass. */
export function editedCount(
  current: (StudentAnswer | null)[],
  atCompletion: (StudentAnswer | null)[],
): number {
  let n = 0;
  for (let i = 0; i < current.length; i++) {
    const first = atCompletion[i];
    if (first && !sameChoice(current[i], first)) n++;
  }
  return n;
}

export type EditVerdict = "ok" | "warn" | "cancel";

export interface EditState {
  total: number;
  edited: number;
  /** ms from start to answering the last question for the first time */
  firstPassMs: number;
  durationMs: number;
  warned: boolean;
}

/** The share of changed answers allowed: lower for a paper finished suspiciously fast. */
export function editLimit(
  s: Pick<EditState, "firstPassMs" | "durationMs">,
  rule: AssignmentSettings["editRule"],
): number {
  const fast = s.firstPassMs < rule.fastShare * s.durationMs;
  return fast ? rule.fastLimit : rule.slowLimit;
}

/**
 * Edit rule. Past the limit the attempt is cancelled, but only after one warning: the warning
 * comes when the next change would cross the limit, or (if it was crossed in one step) instead
 * of cancelling that first time.
 */
export function editVerdict(s: EditState, rule: AssignmentSettings["editRule"]): EditVerdict {
  if (!rule.enabled || s.total <= 0) return "ok";
  const limit = editLimit(s, rule);
  if (s.edited / s.total > limit) return s.warned ? "cancel" : "warn";
  if (!s.warned && s.edited > 0 && (s.edited + 1) / s.total > limit) return "warn";
  return "ok";
}

export function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Silk|Kindle/i.test(ua);
}

const CANCELLED: AttemptStatus[] = ["cancelled_network", "cancelled_edit"];
export function isCancelled(status: AttemptStatus): boolean {
  return CANCELLED.includes(status);
}

export type RetakeState =
  | { kind: "allowed"; auto: boolean; grant: boolean }
  | { kind: "wait_teacher"; reason: string }
  | { kind: "closed" }
  | { kind: "scheduled" };

/**
 * May the student start a new attempt now? After a cancelled attempt (connection or edit
 * rule) a new exam is given automatically up to autoRetakes times while the assignment is
 * open, even if the cancelled attempt used up the attempts; beyond that, or after the paper
 * was collected for violations, only the teacher can allow another try.
 */
export function retakeState(
  attempts: { status: AttemptStatus; counts_toward_attempts: boolean; attempt_no: number }[],
  maxAttempts: number,
  autoRetakes: number,
  window: "scheduled" | "open" | "closed",
  /** the teacher has given an unused, unexpired permission to try again */
  hasGrant = false,
): RetakeState {
  if (window === "scheduled") return { kind: "scheduled" };
  const base = baseRetake(attempts, maxAttempts, autoRetakes, window);
  // a teacher's permission opens one more attempt whatever stopped the student
  if (base.kind !== "allowed" && hasGrant) return { kind: "allowed", auto: false, grant: true };
  return base;
}

function baseRetake(
  attempts: { status: AttemptStatus; counts_toward_attempts: boolean; attempt_no: number }[],
  maxAttempts: number,
  autoRetakes: number,
  window: "open" | "closed",
): RetakeState {
  const finished = attempts.filter((a) => a.status !== "in_progress");
  const last = finished.reduce<(typeof finished)[number] | null>(
    (m, a) => (!m || a.attempt_no > m.attempt_no ? a : m),
    null,
  );
  const cancelled = finished.filter((a) => isCancelled(a.status)).length;
  if (last && isCancelled(last.status)) {
    if (window === "closed")
      return { kind: "wait_teacher", reason: "Bài đã quá giờ đóng, em chờ giáo viên cấp quyền" };
    if (cancelled > autoRetakes)
      return {
        kind: "wait_teacher",
        reason: `Em đã được làm lại tự động ${autoRetakes} lần, hãy chờ giáo viên cấp quyền`,
      };
    return { kind: "allowed", auto: true, grant: false };
  }
  if (window === "closed") return { kind: "closed" };
  if (last?.status === "violation")
    return { kind: "wait_teacher", reason: "Bài đã bị thu do vi phạm, em chờ giáo viên cấp quyền" };
  if (finished.filter((a) => a.counts_toward_attempts).length >= maxAttempts)
    return { kind: "wait_teacher", reason: "Em đã dùng hết số lần làm bài" };
  return { kind: "allowed", auto: false, grant: false };
}

/** A leaving-the-exam episode becomes one violation, whichever events signalled it. */
export type ViolationKind = "fullscreen_exit" | "tab_hidden" | "window_blur";
export const VIOLATION_LABEL: Record<ViolationKind | "second_device" | "edit_warning", string> = {
  fullscreen_exit: "Thoát toàn màn hình",
  tab_hidden: "Chuyển tab / thu nhỏ",
  window_blur: "Rời cửa sổ bài thi",
  second_device: "Đổi sang thiết bị khác",
  edit_warning: "Nhắc dấu hiệu gian lận",
};
