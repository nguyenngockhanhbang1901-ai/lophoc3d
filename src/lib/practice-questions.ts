import type { StepConfig } from './goal-progress';

export const PRACTICE_SECONDS = 90;
export const PRACTICE_TITLE = 'Luyện tập 2';
export const PRACTICE_SOLID = "hình hộp chữ nhật ABCD.A'B'C'D'";
export const PRACTICE_PROMPT = `Cho ${PRACTICE_SOLID}. Quan sát hình vẽ và trả lời các câu hỏi sau:`;

export type BoxVertex = 'A' | 'B' | 'C' | 'D' | "A'" | "B'" | "C'" | "D'";
/** What a question makes glow on the drawing: one edge, or a whole face with its four edges. */
export type PracticeFocus = { kind: 'edge'; from: BoxVertex; to: BoxVertex } | { kind: 'edges'; list: readonly (readonly [BoxVertex, BoxVertex])[] } | { kind: 'face'; vertices: readonly [BoxVertex, BoxVertex, BoxVertex, BoxVertex] };
export type PracticeQuestion = { label: string; prompt: string; focus: PracticeFocus | null; focusLabel: string; answer: string };

const AB: PracticeFocus = { kind: 'edge', from: 'A', to: 'B' };
const AB_IN: PracticeQuestion = { label: 'b', prompt: 'Đường thẳng AB nằm trong những mặt phẳng nào?', focus: AB, focusLabel: 'Đường thẳng AB', answer: "$AB \\subset (ABCD),\\ AB \\subset (ABB'A')$" };
const PARALLEL_TO_BASE: PracticeQuestion = { label: 'c', prompt: 'Kể tên những đường thẳng song song với mặt phẳng (ABCD)', focus: { kind: 'face', vertices: ['A', 'B', 'C', 'D'] }, focusLabel: 'Mặt phẳng (ABCD)', answer: "$A'B' \\ss (ABCD),\\ B'C' \\ss (ABCD),\\ C'D' \\ss (ABCD),\\ D'A' \\ss (ABCD)$" };

/** Luyện tập 2 (rectangular box). */
export const PRACTICE_QUESTIONS: readonly PracticeQuestion[] = [
  { label: 'a', prompt: 'Đường thẳng AB cắt những mặt phẳng nào?', focus: AB, focusLabel: 'Đường thẳng AB', answer: "$AB \\cap (ADD'A') = A,\\ AB \\cap (BCC'B') = B$" },
  AB_IN,
  PARALLEL_TO_BASE,
];

/** Hoạt động 3: same box, untimed, one question. */
export const ACTIVITY3_QUESTIONS: readonly PracticeQuestion[] = [
  { label: '1', prompt: 'Hãy kể tên các đường thẳng song song với đường thẳng AB?', focus: AB, focusLabel: 'Đường thẳng AB', answer: "Các đường thẳng song song với AB: A'B', C'D' và CD." },
];

/** Luyện tập 2's answers written in symbols (TeX between `$...$`, `\ss` = "//"), shown beside the box in Hoạt động 3. */
export type PracticeRecap = { title: string; items: readonly { label: string; lines: readonly string[] }[] };
export const PRACTICE2_RECAP: PracticeRecap = {
  title: 'Đáp án Luyện tập 2',
  items: [
    { label: 'a)', lines: ["$AB \\cap (ADD'A') = A$", "$AB \\cap (BCC'B') = B$"] },
    { label: 'b)', lines: ['$AB \\subset (ABCD)$', "$AB \\subset (ABB'A')$"] },
    { label: 'c)', lines: ["$A'B' \\ss (ABCD)$", "$B'C' \\ss (ABCD)$", "$C'D' \\ss (ABCD)$", "$D'A' \\ss (ABCD)$"] },
  ],
};

/** Luyện tập 1: one question about the school stage photo, untimed. */
export const PHOTO_QUESTIONS: readonly PracticeQuestion[] = [
  { label: '1', prompt: 'Xem mặt sân khấu (phần nền lát gạch) trong bức ảnh là một phần của mặt phẳng (P). Hãy chỉ ra một đường thẳng trong bức ảnh song song với mặt phẳng (P).', focus: null, focusLabel: 'Ảnh sân khấu', answer: 'Ví dụ: mép dưới của biển tên trường song song với mặt phẳng (P).' },
];

export type PracticeActivity = 3 | 4 | 5;
export type PracticeSet = { activity: PracticeActivity; title: string; kicker: string; prompt: string; figure: 'box' | 'photo'; questions: readonly PracticeQuestion[]; seconds: number | null; recap?: PracticeRecap };
export const PRACTICE_SETS: Record<PracticeActivity, PracticeSet> = {
  4: { activity: 4, title: 'Luyện tập 1', kicker: 'Ảnh sân khấu', prompt: 'Quan sát bức ảnh và trả lời câu hỏi sau:', figure: 'photo', questions: PHOTO_QUESTIONS, seconds: null },
  3: { activity: 3, title: PRACTICE_TITLE, kicker: 'Hình hộp chữ nhật', prompt: PRACTICE_PROMPT, figure: 'box', questions: PRACTICE_QUESTIONS, seconds: PRACTICE_SECONDS },
  5: { activity: 5, title: 'Hoạt động 3', kicker: 'Hình hộp chữ nhật', prompt: PRACTICE_PROMPT, figure: 'box', questions: ACTIVITY3_QUESTIONS, seconds: null, recap: PRACTICE2_RECAP },
};
export function isPracticeActivity(activity: number): activity is PracticeActivity {
  return activity === 3 || activity === 4 || activity === 5;
}
export function questionTitle(set: PracticeSet, question: PracticeQuestion) {
  return set.questions.length === 1 ? 'Câu hỏi' : `Câu ${question.label})`;
}

/** Name used to mark the glowing part, e.g. "AB" or "(ABCD)". */
export function focusName(focus: PracticeFocus | null | undefined) {
  if (!focus) return '';
  if (focus.kind === 'edge') return `${focus.from}${focus.to}`;
  if (focus.kind === 'edges') return focus.list.map(([a, b]) => `${a}${b}`).join(', ');
  return `(${focus.vertices.join('')})`;
}

export const PRACTICE_PLACEHOLDER = 'Nhập câu trả lời ngắn của tổ em…';

/** Short free-text answers: any non-empty text is accepted; each question has its own fixed time. */
export const PRACTICE_STEPS: StepConfig = { count: PRACTICE_QUESTIONS.length, limitMs: PRACTICE_SECONDS * 1000, accepts: () => true };

export type UntimedProgress = { answers: string[]; step: number; completedAt: string | null };
/** Untimed parts: each answer is sent once in order; sending the last one submits, after which nothing can change. */
export function submitUntimed(progress: { answers: unknown; step: number; completedAt: string | null }, step: number, answer: string, now: number, count: number): UntimedProgress {
  if (progress.completedAt) throw new Error('Bài đã nộp · Không thể sửa');
  if (step !== progress.step) throw new Error('Câu này đã được gửi');
  const text = answer.trim();
  if (!text) throw new Error('Hãy nhập câu trả lời');
  const list = Array.isArray(progress.answers) ? progress.answers : [];
  const answers = Array.from({ length: count }, (_, i) => i === step ? text : typeof list[i] === 'string' ? list[i] as string : '');
  const last = step >= count - 1;
  return { answers, step: last ? step : step + 1, completedAt: last ? new Date(now).toISOString() : null };
}
