// Scoring one answer against one question. Pure, so the server grades with exactly the rules
// the teacher previews in the editor.
import { stripMarks } from "./accounts";
import { normalizeShortInput, parseAnswerNumber, type QuestionData } from "./questions";

export type StudentAnswer =
  | { kind: "mcq"; choice: number | null }
  | { kind: "tf"; choices: (boolean | null)[] }
  | { kind: "short"; text: string };

/**
 * Share of a true/false question's points by the number of statements answered right,
 * following the national exam (1 → 10%, 2 → 25%, 3 → 50%, 4 → 100%). A teacher can pass
 * another table later from the exam settings.
 */
export const TF_SHARES_THPT: readonly [number, number, number, number, number] = [
  0, 0.1, 0.25, 0.5, 1,
];

/** Collapse a text answer: no marks, no case, no spaces. */
function textKey(s: string): string {
  return stripMarks(normalizeShortInput(s)).toLowerCase();
}

export function shortAnswerMatches(
  data: Extract<QuestionData, { kind: "short" }>,
  input: string,
): boolean {
  const given = input.trim();
  if (!given) return false;
  const answers = data.answers.map((a) => a.trim()).filter(Boolean);
  if (data.mode === "text") return answers.some((a) => textKey(a) === textKey(given));
  const value = parseAnswerNumber(given);
  if (value === null) return false;
  const tolerance = data.tolerance ?? 0;
  return answers.some((a) => {
    const target = parseAnswerNumber(a);
    // a tiny epsilon absorbs binary rounding (0.1 + 0.2)
    return target !== null && Math.abs(value - target) <= tolerance + 1e-9;
  });
}

/** Fraction of the question's points earned, 0..1. */
export function scoreShare(
  data: QuestionData,
  answer: StudentAnswer | null,
  tfShares: readonly number[] = TF_SHARES_THPT,
): number {
  if (!answer || answer.kind !== data.kind) return 0;
  if (data.kind === "mcq" && answer.kind === "mcq")
    return data.correct !== null && answer.choice === data.correct ? 1 : 0;
  if (data.kind === "tf" && answer.kind === "tf") {
    const right = data.correct.filter((c, i) => c !== null && answer.choices[i] === c).length;
    return tfShares[right] ?? 0;
  }
  if (data.kind === "short" && answer.kind === "short")
    return shortAnswerMatches(data, answer.text) ? 1 : 0;
  return 0;
}
