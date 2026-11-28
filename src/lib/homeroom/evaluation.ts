// Pure Thông tư 22 rules for the homeroom teacher: a subject's term result from a book, and the
// student's overall learning level (Điều 9) with the one-subject adjustment (khoản 3).
import type { BookColumn, Bonus, Values } from "@/lib/gradebook/scores";
import { effectiveValues, termAverage, yearAverage } from "@/lib/gradebook/scores";

export type Level = "tot" | "kha" | "dat" | "chua_dat";
export const LEVELS: Level[] = ["tot", "kha", "dat", "chua_dat"];
export const LEVEL_LABEL: Record<Level, string> = {
  tot: "Tốt",
  kha: "Khá",
  dat: "Đạt",
  chua_dat: "Chưa đạt",
};
const RANK: Record<Level, number> = { tot: 3, kha: 2, dat: 1, chua_dat: 0 };
const BY_RANK: Level[] = ["chua_dat", "dat", "kha", "tot"];

/** A subject's result for a term: a score (ĐTB môn) or Đạt/Chưa đạt for comment-graded subjects. */
export type SubjectResult =
  | { kind: "score"; value: number | null; complete: boolean }
  | { kind: "comment"; pass: boolean | null };

export interface BookInput {
  columns: BookColumn[];
  bonusTarget: string | null;
  raw: Values;
  texts: Record<string, string | null>;
  bonus: Bonus | undefined;
}

/**
 * Comment-graded subject (columns of kind "dg"): Đạt when every evaluation is filled and Đạt
 * ("Đ"); Chưa đạt as soon as one is "CĐ"; unknown while some are missing.
 */
export function subjectResult(b: BookInput): SubjectResult {
  const dg = b.columns.filter((c) => c.kind === "dg");
  if (dg.length && !b.columns.some((c) => c.kind === "tx" || c.kind === "gk" || c.kind === "ck")) {
    const marks = dg.map((c) => (b.texts[c.key] ?? "").trim().toUpperCase());
    if (marks.some((m) => m === "CĐ" || m === "CD")) return { kind: "comment", pass: false };
    if (marks.every((m) => m === "Đ" || m === "D")) return { kind: "comment", pass: true };
    return { kind: "comment", pass: null };
  }
  const t = termAverage(b.columns, effectiveValues(b.columns, b.raw, b.bonus, b.bonusTarget));
  return { kind: "score", value: t.average, complete: t.complete };
}

/** Whole-year result of a subject: ĐTBmcn for scores; for comment subjects the term II result. */
export function yearResult(
  t1: SubjectResult | undefined,
  t2: SubjectResult | undefined,
): SubjectResult | undefined {
  if (!t2) return undefined;
  if (t2.kind === "comment") return t2;
  const v1 = t1?.kind === "score" ? t1.value : null;
  return {
    kind: "score",
    value: yearAverage(v1, t2.value),
    complete: !!(t1?.kind === "score" && t1.complete && t2.complete),
  };
}

function baseLevel(scores: number[], comments: boolean[]): Level {
  const failed = comments.filter((p) => !p).length;
  const count = (min: number) => scores.filter((s) => s >= min).length;
  const all = (min: number) => scores.every((s) => s >= min);
  if (failed === 0 && all(6.5) && count(8) >= 6) return "tot";
  if (failed === 0 && all(5) && count(6.5) >= 6) return "kha";
  if (failed <= 1 && count(5) >= 6 && all(3.5)) return "dat";
  return "chua_dat";
}

export interface LevelSuggestion {
  level: Level | null;
  /** set when khoản 3 raised the level because of a single subject */
  raisedBecause?: string;
  /** subjects still without a result */
  missing: string[];
}

/**
 * Điều 9 khoản 2–3: the learning level from all subjects' results. Needs every subject's result;
 * if one subject alone pulls the level down two or more steps, the level goes to the next one up.
 */
export function studyLevel(
  results: { subject: string; result: SubjectResult | undefined }[],
): LevelSuggestion {
  const missing = results
    .filter(
      (r) =>
        !r.result ||
        (r.result.kind === "score" && r.result.value === null) ||
        (r.result.kind === "comment" && r.result.pass === null),
    )
    .map((r) => r.subject);
  if (missing.length || !results.length) return { level: null, missing };
  const scores = (skip?: number) =>
    results
      .filter((r, i) => i !== skip && r.result?.kind === "score")
      .map((r) => (r.result as { value: number }).value);
  const comments = (skip?: number) =>
    results
      .filter((r, i) => i !== skip && r.result?.kind === "comment")
      .map((r) => (r.result as { pass: boolean }).pass);
  const level = baseLevel(scores(), comments());
  // khoản 3: would the level be ≥ 2 steps higher if that one subject were fine?
  let best: { rank: number; subject: string } | null = null;
  results.forEach((r, i) => {
    const ideal =
      r.result?.kind === "score"
        ? baseLevel([...scores(i), 10], comments())
        : baseLevel(scores(), [...comments(i), true]);
    if (RANK[ideal] - RANK[level] >= 2 && (!best || RANK[ideal] > best.rank))
      best = { rank: RANK[ideal], subject: r.subject };
  });
  const raised = best as { rank: number; subject: string } | null;
  if (raised) return { level: BY_RANK[RANK[level] + 1]!, raisedBecause: raised.subject, missing };
  return { level, missing };
}

/** Điều 8 khoản 2b: whole-year conduct from the two terms. */
export function yearConduct(t1: Level | null, t2: Level | null): Level | null {
  if (!t1 || !t2) return null;
  if (t2 === "chua_dat") return "chua_dat";
  if (t2 === "tot") return t1 === "tot" || t1 === "kha" ? "tot" : "kha";
  if (t2 === "kha") return t1 === "chua_dat" ? "dat" : "kha";
  return t1 === "tot" ? "kha" : "dat";
}

/** A score book as the homeroom pages hold it (see ClassBook in records.functions.ts). */
export interface StudentBook {
  subject: string;
  semester: 1 | 2;
  columns: BookColumn[];
  bonusTarget: string | null;
  scores: { studentId: string; key: string; num: number | null; txt: string | null }[];
  bonus: { studentId: string; plus: number; minus: number }[];
}

/** One student's result in one book. */
export function studentResult(
  b: StudentBook | undefined,
  studentId: string,
): SubjectResult | undefined {
  if (!b) return undefined;
  const raw: Values = {};
  const texts: Record<string, string | null> = {};
  for (const s of b.scores)
    if (s.studentId === studentId) {
      raw[s.key] = s.num;
      texts[s.key] = s.txt;
    }
  return subjectResult({
    columns: b.columns,
    bonusTarget: b.bonusTarget,
    raw,
    texts,
    bonus: b.bonus.find((x) => x.studentId === studentId),
  });
}

export type LearningAlert =
  | { kind: "low" | "very_low"; studentId: string; subject: string; value: number }
  | { kind: "drop"; studentId: string; subject: string; from: number; to: number };

/**
 * Rule-based learning alerts for the current term: a subject average under 5.0 (under 3.5 is
 * "very_low": alone it keeps the learning level from Đạt), or a term II
 * average at least `drop` points below term I. Comment-graded subjects are left out.
 */
export function learningAlerts(
  books: StudentBook[],
  studentIds: string[],
  semester: 1 | 2,
  drop = 1.5,
): LearningAlert[] {
  const out: LearningAlert[] = [];
  const subjects = [...new Set(books.map((b) => b.subject))];
  for (const id of studentIds)
    for (const subject of subjects) {
      const now = studentResult(
        books.find((b) => b.subject === subject && b.semester === semester),
        id,
      );
      if (now?.kind !== "score" || now.value === null) continue;
      if (now.value < 5)
        out.push({
          kind: now.value < 3.5 ? "very_low" : "low",
          studentId: id,
          subject,
          value: now.value,
        });
      if (semester === 2) {
        const before = studentResult(
          books.find((b) => b.subject === subject && b.semester === 1),
          id,
        );
        if (
          before?.kind === "score" &&
          before.value !== null &&
          before.value - now.value >= drop - 1e-9
        )
          out.push({ kind: "drop", studentId: id, subject, from: before.value, to: now.value });
      }
    }
  return out;
}
