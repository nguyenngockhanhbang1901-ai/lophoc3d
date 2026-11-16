import { PRACTICE2_RECAP, type PracticeFocus, type PracticeRecap } from './practice-questions';

/**
 * Hoạt động 3 is a teacher-led slideshow (nothing is assigned to students): each Enter reveals the next stage.
 * Text between `$...$` is TeX (typeset by MathText); `\ss` is the textbook "//" parallel sign.
 */
export const ACTIVITY3_FOLLOW_UPS = {
  parallelToAB: 'Hãy kể tên các đường thẳng song song với đường thẳng $AB$?',
  bothParallel: 'Những đường thẳng nào vừa song song với $AB$, vừa song song với $(ABCD)$?',
  relation: "Em có nhận xét gì về mối quan hệ giữa $AB$, mặt phẳng $(ABCD)$ và đường thẳng $A'B'$?",
  cdParallel: 'Đường thẳng $CD$ song song với $AB$, $AB$ nằm trong $(ABCD)$, vậy $CD$ có song song với $(ABCD)$ không?',
  condition: 'Vậy nếu bỏ điều kiện $a \\not\\subset (P)$ thì kết luận còn đúng không?',
  application: "Áp dụng định lý trên, đường thẳng $A'C'$ có song song với mặt phẳng $(ABCD)$ không? Tại sao?",
} as const;

/** A brace system: the conditions stacked inside "{", then "⇒ conclusion". */
const braced = (conditions: readonly string[], conclusion: string) => `$\\left\\{\\begin{array}{l} ${conditions.join(' \\\\ ')} \\end{array}\\right. \\Rightarrow ${conclusion}$`;

export const ACTIVITY3_SYMBOL_ANSWERS = {
  parallelToAB: ["$A'B' \\ss AB$", "$C'D' \\ss AB$", '$CD \\ss AB$'],
  bothParallel: ["$A'B' \\ss AB,\\ A'B' \\ss (ABCD)$", "$C'D' \\ss AB,\\ C'D' \\ss (ABCD)$"],
  relation: braced(['AB \\subset (ABCD)', "A'B' \\not\\subset (ABCD)", "A'B' \\ss AB"], "A'B' \\ss (ABCD)"),
  cdParallel: 'Không, vì $CD \\subset (ABCD)$.',
  condition: 'Kết luận trên không còn đúng nếu bỏ điều kiện “$a$ không nằm trong mặt phẳng $(P)$”.\nVì khi đó, có thể $a \\subset (P)$.',
} as const;

export const GENERAL_INTRO = "Tổng quát: Ta gọi $A'B' = a$, $AB = b$, $(ABCD) = (P)$. Khi\u00a0đó:";
export const GENERAL_RULE = braced(['a \\not\\subset (P)', 'b \\subset (P)', 'a \\ss b'], 'a \\ss (P)');
export const GENERAL_CONCLUSION = 'Kết luận: Nếu đường thẳng $a$ không nằm trong mặt phẳng $(P)$ và song song với một đường thẳng nằm trong $(P)$ thì $a$ song song với $(P)$.';

/** One proof step per Enter; each step is written over its own lines, a line starting with ⇒ continues the one above. */
export const PROOF_LINES: readonly (readonly string[])[] = [
  ['Gọi $(Q)$ là mặt phẳng xác định bởi hai đường thẳng song song $a$ và $b$.'],
  ['Vì $a \\not\\subset (P)$ nên $(Q) \\neq (P)$.', 'Mà $(P)$ và $(Q)$ có chung đường thẳng $b$ nên $(P) \\cap (Q) = b$.'],
  ['Giả sử $a$ và $(P)$ có điểm chung $M$. Khi đó:', '$M \\in a \\subset (Q)$ và $M \\in (P)$', '$\\Rightarrow M \\in (P) \\cap (Q) = b$', '$\\Rightarrow a \\cap b = \\{M\\}$, mâu thuẫn với $a \\ss b$.'],
  ['Vậy $a$ và $(P)$ không có điểm chung, tức $a \\ss (P)$. ■'],
];
export const isContinuedLine = (line: string) => line.startsWith('$\\Rightarrow');

const AB: PracticeFocus = { kind: 'edge', from: 'A', to: 'B' };
const A1B1: PracticeFocus = { kind: 'edge', from: "A'", to: "B'" };
const CD: PracticeFocus = { kind: 'edge', from: 'D', to: 'C' };

const withAnswers = (count: 1 | 2): PracticeRecap => ({
  title: 'Đáp án các câu trước',
  items: [
    ...PRACTICE2_RECAP.items,
    { label: 'Câu 1', lines: [ACTIVITY3_SYMBOL_ANSWERS.parallelToAB.join(', ')] },
    ...(count === 2 ? [{ label: 'Câu 2', lines: ACTIVITY3_SYMBOL_ANSWERS.bothParallel }] : []),
  ],
});

export type Activity3Stage =
  /** Box drawing (with an optional recap on its left) and a question, optionally with its answer. */
  | { kind: 'question'; title: string; prompt: string; focus: PracticeFocus; recap: PracticeRecap | null; answer: string | null }
  /** The general statement; `rule` adds its conclusion after it. */
  | { kind: 'general'; rule: boolean }
  | { kind: 'conclusion' }
  /** Câu 6 with the AI solver; the box shows A'C', and `ac` adds AC on the next Enter. */
  | { kind: 'application'; ac: boolean }
  /** Two columns: statement and proof on the left (first `lines` proof lines shown), the P/Q picture on the right. */
  | { kind: 'proof'; lines: number };

/** A question shown first on its own, then with its answer on the next Enter. */
const askThenAnswer = (title: string, prompt: string, focus: PracticeFocus, answer: string): Activity3Stage[] => [
  { kind: 'question', title, prompt, focus, recap: null, answer: null },
  { kind: 'question', title, prompt, focus, recap: null, answer },
];

export const ACTIVITY3_STAGES: readonly Activity3Stage[] = [
  { kind: 'question', title: 'Câu 1', prompt: ACTIVITY3_FOLLOW_UPS.parallelToAB, focus: AB, recap: PRACTICE2_RECAP, answer: null },
  { kind: 'question', title: 'Câu 2', prompt: ACTIVITY3_FOLLOW_UPS.bothParallel, focus: AB, recap: withAnswers(1), answer: null },
  { kind: 'question', title: 'Câu 3', prompt: ACTIVITY3_FOLLOW_UPS.relation, focus: A1B1, recap: withAnswers(2), answer: null },
  { kind: 'question', title: 'Câu 3', prompt: ACTIVITY3_FOLLOW_UPS.relation, focus: A1B1, recap: null, answer: ACTIVITY3_SYMBOL_ANSWERS.relation },
  { kind: 'general', rule: true },
  ...PROOF_LINES.map((_, i) => ({ kind: 'proof' as const, lines: i })),
  { kind: 'proof', lines: PROOF_LINES.length },
  { kind: 'conclusion' },
  ...askThenAnswer('Câu 4', ACTIVITY3_FOLLOW_UPS.cdParallel, CD, ACTIVITY3_SYMBOL_ANSWERS.cdParallel),
  ...askThenAnswer('Câu 5', ACTIVITY3_FOLLOW_UPS.condition, A1B1, ACTIVITY3_SYMBOL_ANSWERS.condition),
  { kind: 'application', ac: false },
  { kind: 'application', ac: true },
];
