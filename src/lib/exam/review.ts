// Looking back at an attempt: what the student saw, answered and should have answered (in the
// student's own option order), the answer log with what each change replaced, and one ordered
// timeline of everything that happened. Pure, so the teacher's view, the student's review and
// the Excel export all describe an attempt the same way.
import type { AssignmentSettings, AttemptStatus, ItemResult } from "./assignment";
import type { StudentAnswer } from "./grading";
import type { DrawnItem } from "./matrix";
import {
  OPTION_LETTERS,
  STATEMENT_LETTERS,
  type QuestionBody,
  type QuestionKind,
  type QuestionMedia,
} from "./questions";

export interface ReviewQuestion {
  kind: QuestionKind;
  stem: string;
  media: QuestionMedia | null;
  /** mcq options as the student saw them */
  options: string[];
  statements: string[];
  answer: StudentAnswer | null;
  /** mcq: index in the student's order; tf: truth of each statement; short: accepted answers */
  correct:
    | { kind: "mcq"; choice: number | null }
    | { kind: "tf"; values: (boolean | null)[] }
    | {
        kind: "short";
        answers: string[];
      };
  share: number;
  points: number;
  earned: number;
  explanation: string;
}

export function reviewQuestion(
  item: Pick<DrawnItem, "kind" | "points" | "optionOrder" | "statementOrder">,
  body: QuestionBody | null,
  answer: StudentAnswer | null,
  result: ItemResult | null,
): ReviewQuestion {
  const base = {
    kind: item.kind,
    stem: body?.stem ?? "(Câu hỏi đã bị xóa khỏi ngân hàng)",
    media: body?.media ?? null,
    options: [] as string[],
    statements: [] as string[],
    answer,
    share: result?.share ?? 0,
    points: item.points,
    earned: result?.earned ?? 0,
    explanation: body?.explanation ?? "",
  };
  const d = body?.data;
  if (d?.kind === "mcq") {
    const order = item.optionOrder ?? [0, 1, 2, 3];
    const shown = order.indexOf(d.correct ?? -1);
    return {
      ...base,
      options: order.map((i) => d.options[i] ?? ""),
      correct: { kind: "mcq", choice: shown >= 0 ? shown : null },
    };
  }
  if (d?.kind === "tf") {
    const order = item.statementOrder ?? [0, 1, 2, 3];
    return {
      ...base,
      statements: order.map((i) => d.statements[i] ?? ""),
      correct: { kind: "tf", values: order.map((i) => d.correct[i] ?? null) },
    };
  }
  if (d?.kind === "short") return { ...base, correct: { kind: "short", answers: [...d.answers] } };
  return {
    ...base,
    correct:
      item.kind === "mcq"
        ? { kind: "mcq", choice: null }
        : item.kind === "tf"
          ? { kind: "tf", values: [null, null, null, null] }
          : { kind: "short", answers: [] },
  };
}

/** Whether the student may see the key of a finished attempt now. */
export function reviewAllowed(
  review: AssignmentSettings["review"],
  status: AttemptStatus,
  closesAt: string,
  now: number,
): boolean {
  if (status === "in_progress" || status === "cancelled_network" || status === "cancelled_edit")
    return false;
  if (review === "immediate") return true;
  if (review === "after_close") return now >= new Date(closesAt).getTime();
  return false;
}

export const REVIEW_LABEL: Record<AssignmentSettings["review"], string> = {
  none: "Không cho xem lại đáp án",
  after_close: "Xem đáp án sau giờ đóng bài",
  immediate: "Xem đáp án ngay sau khi nộp",
};

const PART = { mcq: "I", tf: "II", short: "III" } as const;

/** "Câu 3 (Phần I)": numbering restarts in each part, like the paper. */
export function itemLabels(kinds: QuestionKind[]): string[] {
  const seen: Record<string, number> = {};
  return kinds.map((k) => `Câu ${(seen[k] = (seen[k] ?? 0) + 1)} (Phần ${PART[k]})`);
}

/** An answer as short text: "B", "Đ-S-Đ-S", "2,5", or "" when empty. */
export function answerText(answer: StudentAnswer | null | undefined): string {
  if (!answer) return "";
  if (answer.kind === "mcq")
    return answer.choice === null ? "" : (OPTION_LETTERS[answer.choice] ?? "");
  if (answer.kind === "tf")
    return answer.choices
      .map((c, i) => `${STATEMENT_LETTERS[i]}${c === null ? "?" : c ? "Đ" : "S"}`)
      .join(" ");
  return answer.text;
}

export function correctText(c: ReviewQuestion["correct"]): string {
  if (c.kind === "mcq") return c.choice === null ? "" : (OPTION_LETTERS[c.choice] ?? "");
  if (c.kind === "tf")
    return c.values
      .map((v, i) => `${STATEMENT_LETTERS[i]}${v === null ? "?" : v ? "Đ" : "S"}`)
      .join(" ");
  return c.answers.join(" / ");
}

export interface AnswerEvent {
  item_index: number;
  answer: StudentAnswer;
  at: string;
}

export interface LoggedAnswer {
  index: number;
  at: string;
  before: StudentAnswer | null;
  after: StudentAnswer;
  /** given after the first full pass (what the edit rule watches) */
  afterCompletion: boolean;
}

/** Every save in order, each with the answer it replaced; repeated identical saves dropped. */
export function answerLog(events: AnswerEvent[], completedAllAt: string | null): LoggedAnswer[] {
  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at));
  const last = new Map<number, StudentAnswer>();
  const done = completedAllAt ? new Date(completedAllAt).getTime() : Infinity;
  const out: LoggedAnswer[] = [];
  for (const e of sorted) {
    const before = last.get(e.item_index) ?? null;
    if (before && JSON.stringify(before) === JSON.stringify(e.answer)) continue;
    last.set(e.item_index, e.answer);
    out.push({
      index: e.item_index,
      at: e.at,
      before,
      after: e.answer,
      afterCompletion: new Date(e.at).getTime() > done,
    });
  }
  return out;
}

export interface TimelineEntry {
  at: string;
  kind: "start" | "answer" | "edit" | "completed" | "violation" | "drop" | "finish";
  text: string;
}

const VIOLATION_TEXT: Record<string, string> = {
  fullscreen_exit: "Thoát toàn màn hình",
  tab_hidden: "Chuyển tab / thu nhỏ",
  window_blur: "Rời cửa sổ bài thi",
  second_device: "Chuyển sang thiết bị khác",
  edit_warning: 'Nhắc "Bài thi có dấu hiệu gian lận"',
};
const OUTCOME_TEXT: Record<string, string> = {
  continue: "được làm tiếp",
  new_exam: "làm đề mới, không tính lượt",
  new_exam_counted: "làm đề mới, tính lượt",
};
const STATUS_TEXT: Record<AttemptStatus, string> = {
  in_progress: "Đang làm",
  submitted: "Nộp bài",
  timeout: "Hết giờ, tự nộp",
  violation: "Thu bài do vi phạm",
  cancelled_network: "Hủy lượt do mất mạng",
  cancelled_edit: "Hủy lượt do sửa đáp án",
};

const ms = (iso: string) => new Date(iso).getTime();

export function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} giây` : `${Math.floor(s / 60)} phút ${s % 60} giây`;
}

/** Everything that happened in one attempt, oldest first. */
export function attemptTimeline(input: {
  startedAt: string;
  completedAllAt: string | null;
  finishedAt: string | null;
  status: AttemptStatus;
  labels: string[];
  log: LoggedAnswer[];
  violations: { kind: string; at: string; counted: boolean }[];
  drops: {
    started_at: string;
    ended_at: string;
    duration_ms: number;
    drop_number: number;
    outcome: string;
  }[];
}): TimelineEntry[] {
  const list: TimelineEntry[] = [{ at: input.startedAt, kind: "start", text: "Bắt đầu làm bài" }];
  for (const l of input.log)
    list.push({
      at: l.at,
      kind: l.afterCompletion ? "edit" : "answer",
      text: `${input.labels[l.index] ?? `Câu ${l.index + 1}`}: ${
        l.before ? `${answerText(l.before) || "(trống)"} → ` : ""
      }${answerText(l.after) || "(trống)"}${l.afterCompletion ? " (sửa sau khi làm xong)" : ""}`,
    });
  if (input.completedAllAt)
    list.push({
      at: input.completedAllAt,
      kind: "completed",
      text: "Làm xong lượt đầu tất cả các câu",
    });
  for (const v of input.violations)
    list.push({
      at: v.at,
      kind: "violation",
      text: `${VIOLATION_TEXT[v.kind] ?? v.kind}${v.counted ? " (tính 1 cảnh báo)" : ""}`,
    });
  for (const d of input.drops)
    list.push({
      at: d.started_at,
      kind: "drop",
      text: `Mất kết nối lần ${d.drop_number}, ${seconds(d.duration_ms)}: ${OUTCOME_TEXT[d.outcome] ?? d.outcome}`,
    });
  if (input.finishedAt && input.status !== "in_progress")
    list.push({ at: input.finishedAt, kind: "finish", text: STATUS_TEXT[input.status] });
  const order: Record<TimelineEntry["kind"], number> = {
    start: 0,
    answer: 1,
    edit: 1,
    completed: 2,
    violation: 1,
    drop: 1,
    finish: 3,
  };
  return list.sort((a, b) => ms(a.at) - ms(b.at) || order[a.kind] - order[b.kind]);
}
