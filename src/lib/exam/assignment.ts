// Assignments and attempts: settings the teacher chooses, the open/close window on the server
// clock, what a student may see of a question, answer shapes, and scoring a finished attempt.
import { z } from "zod";
import { TF_SHARES_THPT, scoreShare, type StudentAnswer } from "./grading";
import type { DrawnItem } from "./matrix";
import type { QuestionBody, QuestionKind, QuestionMedia } from "./questions";

export const assignmentSettingsSchema = z.object({
  /** violations (leaving full screen, switching tab) before the paper is collected */
  maxWarnings: z.number().int().min(1).max(50).default(3),
  devices: z.enum(["any", "computer"]).default("any"),
  review: z.enum(["none", "after_close", "immediate"]).default("none"),
  scale: z.number().min(1).max(100).default(10),
  scoreRule: z.enum(["latest", "highest", "first"]).default("latest"),
  antiCopy: z.enum(["normal", "high"]).default("normal"),
  autoRetakes: z.number().int().min(0).max(10).default(2),
  network: z
    .object({
      shortMinutes: z.number().min(0.25).max(60).default(3),
      longMinutes: z.number().min(0.25).max(120).default(5),
      freeDrops: z.number().int().min(0).max(50).default(3),
      uncountedDrops: z.number().int().min(0).max(50).default(5),
    })
    .default({}),
  editRule: z
    .object({
      enabled: z.boolean().default(true),
      fastShare: z.number().min(0).max(1).default(0.2),
      fastLimit: z.number().min(0).max(1).default(0.5),
      slowLimit: z.number().min(0).max(1).default(0.6),
    })
    .default({}),
});
export type AssignmentSettings = z.infer<typeof assignmentSettingsSchema>;
export const DEFAULT_SETTINGS: AssignmentSettings = assignmentSettingsSchema.parse({});

export function readSettings(value: unknown): AssignmentSettings {
  const parsed = assignmentSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export type WindowState = "scheduled" | "open" | "closed";

export function windowState(opensAt: string, closesAt: string, now: number): WindowState {
  if (now < new Date(opensAt).getTime()) return "scheduled";
  if (now >= new Date(closesAt).getTime()) return "closed";
  return "open";
}

export const WINDOW_LABEL: Record<WindowState, string> = {
  scheduled: "Đã hẹn",
  open: "Đang mở",
  closed: "Đã đóng",
};

export type AttemptStatus =
  "in_progress" | "submitted" | "timeout" | "violation" | "cancelled_network" | "cancelled_edit";
export const ATTEMPT_LABEL: Record<AttemptStatus, string> = {
  in_progress: "Đang làm",
  submitted: "Nộp bình thường",
  timeout: "Hết giờ",
  violation: "Thu bài do vi phạm",
  cancelled_network: "Hủy do mất mạng",
  cancelled_edit: "Hủy do sửa đáp án",
};

// ---------- what the student sees ----------

export type StudentQuestion =
  | { kind: "mcq"; stem: string; media: QuestionMedia | null; options: string[] }
  | { kind: "tf"; stem: string; media: QuestionMedia | null; statements: string[] }
  | { kind: "short"; stem: string; media: QuestionMedia | null };

/** The question without anything that reveals the answer; options in this student's order. */
export function studentQuestion(
  body: QuestionBody,
  item: Pick<DrawnItem, "optionOrder" | "statementOrder">,
): StudentQuestion {
  const d = body.data;
  if (d.kind === "mcq") {
    const order = item.optionOrder ?? [0, 1, 2, 3];
    return {
      kind: "mcq",
      stem: body.stem,
      media: body.media,
      options: order.map((i) => d.options[i] ?? ""),
    };
  }
  if (d.kind === "tf") {
    const order = item.statementOrder ?? [0, 1, 2, 3];
    return {
      kind: "tf",
      stem: body.stem,
      media: body.media,
      statements: order.map((i) => d.statements[i] ?? ""),
    };
  }
  return { kind: "short", stem: body.stem, media: body.media };
}

export const studentAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mcq"), choice: z.number().int().min(0).max(3).nullable() }),
  z.object({ kind: z.literal("tf"), choices: z.array(z.boolean().nullable()).length(4) }),
  z.object({ kind: z.literal("short"), text: z.string().max(50) }),
]);

/** "Done" for moving on: a choice, all four Đúng/Sai, or a confirmed short answer. */
export function answerComplete(a: StudentAnswer | null | undefined): boolean {
  if (!a) return false;
  if (a.kind === "mcq") return a.choice !== null;
  if (a.kind === "tf") return a.choices.length === 4 && a.choices.every((c) => c !== null);
  return a.text.trim().length > 0;
}

export function sameAnswer(
  a: StudentAnswer | null | undefined,
  b: StudentAnswer | null | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ---------- scoring ----------

export interface ItemResult {
  share: number;
  points: number;
  earned: number;
}

export interface AttemptScore {
  /** on the assignment's scale, rounded to 2 decimals */
  score: number;
  /** questions fully right */
  correctCount: number;
  results: ItemResult[];
}

/**
 * Score of an attempt. Questions are graded against the stored question with the student's
 * option order undone; points are scaled so the full matrix equals the assignment scale.
 */
export function scoreAttempt(
  items: Pick<DrawnItem, "points" | "optionOrder" | "statementOrder">[],
  bodies: (QuestionBody | null)[],
  answers: (StudentAnswer | null)[],
  scale: number,
): AttemptScore {
  const results = items.map((item, i) => {
    const body = bodies[i];
    let answer = answers[i] ?? null;
    if (body && answer?.kind === "mcq" && answer.choice !== null && item.optionOrder)
      answer = { kind: "mcq", choice: item.optionOrder[answer.choice] ?? null };
    if (answer?.kind === "tf" && item.statementOrder) {
      // the student answered statements in their shown order: put each back in its place
      const choices: (boolean | null)[] = [null, null, null, null];
      item.statementOrder.forEach((original, shown) => {
        choices[original] = answer?.kind === "tf" ? (answer.choices[shown] ?? null) : null;
      });
      answer = { kind: "tf", choices };
    }
    const share = body ? scoreShare(body.data, answer, TF_SHARES_THPT) : 0;
    return { share, points: item.points, earned: share * item.points };
  });
  const total = items.reduce((s, it) => s + it.points, 0);
  const earned = results.reduce((s, r) => s + r.earned, 0);
  const score = total > 0 ? Math.round((earned / total) * scale * 100) / 100 : 0;
  return { score, correctCount: results.filter((r) => r.share >= 1).length, results };
}

/** Which attempt's score goes into the class table. */
export function chosenScore<
  T extends { score: number | null; attempt_no: number; counts: boolean },
>(attempts: T[], rule: AssignmentSettings["scoreRule"]): T | null {
  const graded = attempts.filter((a) => a.score !== null && a.counts);
  if (!graded.length) return null;
  if (rule === "highest") return graded.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a));
  if (rule === "first") return graded.reduce((a, b) => (b.attempt_no < a.attempt_no ? b : a));
  return graded.reduce((a, b) => (b.attempt_no > a.attempt_no ? b : a));
}

export function kindNumbering(kinds: QuestionKind[]): number[] {
  // "Câu 1, 2, … " restarts for each part, like the national exam paper
  const seen: Record<string, number> = {};
  return kinds.map((k) => (seen[k] = (seen[k] ?? 0) + 1));
}
