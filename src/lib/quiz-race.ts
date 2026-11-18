import { reconcileSteps, type StepConfig, type StepProgress } from './goal-progress';

/** Luyện tập 3 · "AI NHANH HƠN": four-choice consolidation game for Bài 12. */
export const QUIZ_TITLE = 'Luyện tập 3';
export const QUIZ_GAME_NAME = 'AI NHANH HƠN';
export const QUIZ_SECONDS = 30;
export const QUIZ_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type QuizLetter = typeof QUIZ_LETTERS[number];
export type QuizModel = 'tetrahedron' | 'pyramid';
export type QuizQuestion = { prompt: string; options: readonly [string, string, string, string]; correct: QuizLetter; model?: QuizModel };

/** Text uses TeX between `$...$` (rendered by MathText); `\ss` = "//". */
export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  { prompt: 'Cho đường thẳng $a$ và mặt phẳng $(P)$. Có bao nhiêu vị trí tương đối giữa $a$ và $(P)$?', options: ['$1$', '$2$', '$3$', '$4$'], correct: 'C' },
  { prompt: 'Đường thẳng $a$ song song với mặt phẳng $(P)$ khi và chỉ khi:', options: ['$a$ và $(P)$ có đúng một điểm chung', '$a$ và $(P)$ có hai điểm chung', '$a$ và $(P)$ không có điểm chung', '$a$ nằm trong $(P)$'], correct: 'C' },
  { prompt: 'Nếu đường thẳng $a$ không nằm trong $(P)$ và $a$ song song với một đường thẳng $d$ nằm trong $(P)$ thì:', options: ['$a$ cắt $(P)$', '$a$ song song với $(P)$', '$a$ nằm trong $(P)$', '$a$ chéo với $(P)$'], correct: 'B' },
  { prompt: 'Để chứng minh $a \\ss (P)$, ta cần chứng minh:', options: ['$a \\ss d$ với $d \\subset (P)$', '$a \\ss d$ với $d \\subset (P)$ và $a \\not\\subset (P)$', '$a$ cắt $d$ với $d \\subset (P)$', '$a$ và $(P)$ có một điểm chung'], correct: 'B' },
  { prompt: 'Cho đường thẳng $a \\ss (P)$. Khẳng định nào sau đây **sai**?', options: ['$a$ và $(P)$ không có điểm chung', 'Mọi đường thẳng nằm trong $(P)$ đều song song với $a$', 'Tồn tại đường thẳng $d$ trong $(P)$ sao cho $d \\ss a$', '$a$ không nằm trong $(P)$'], correct: 'B' },
  { prompt: 'Cho tứ diện $ABCD$. Gọi $M, N$ lần lượt là trung điểm của $AB$ và $AC$. Đường thẳng $MN$ song song với mặt phẳng nào sau đây?', options: ['$(ABC)$', '$(ABD)$', '$(ACD)$', '$(BCD)$'], correct: 'D', model: 'tetrahedron' },
  { prompt: 'Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình bình hành. Đường thẳng $AB$ song song với mặt phẳng nào sau đây?', options: ['$(SAD)$', '$(SBC)$', '$(SCD)$', '$(SAC)$'], correct: 'C', model: 'pyramid' },
];

export function isQuizLetter(value: string): value is QuizLetter {
  return (QUIZ_LETTERS as readonly string[]).includes(value);
}
/** One click sends the chosen letter; each question has its own server clock. */
export const QUIZ_STEPS: StepConfig = { count: QUIZ_QUESTIONS.length, limitMs: QUIZ_SECONDS * 1000, accepts: (_step, answer) => isQuizLetter(answer) };

export function quizCorrectCount(answers: readonly unknown[]): number {
  return QUIZ_QUESTIONS.reduce((n, q, i) => n + (answers[i] === q.correct ? 1 : 0), 0);
}

export type RaceLane = { number: number; done: number; correct: number; finished: boolean; lastAt: number | null };
/**
 * Race track order: the team that has finished more questions is ahead; with the same count,
 * the team that reached it earlier (earlier end of its last finished question) is ahead.
 * A question counts as finished once the team answered it or its time ran out.
 */
export function raceStandings(teams: readonly { number: number; progress: StepProgress }[], releasedAt: string | null, now: number): RaceLane[] {
  const lanes = teams.map(({ number, progress }) => {
    const r = releasedAt ? reconcileSteps(progress, releasedAt, now, QUIZ_STEPS) : progress;
    const done = r.completedAt ? QUIZ_STEPS.count : Math.min(r.step, QUIZ_STEPS.count);
    const ends = r.timings.slice(0, done).map(t => t?.ended_at ? Date.parse(t.ended_at) : NaN).filter(Number.isFinite);
    return { number, done, correct: quizCorrectCount(r.answers), finished: Boolean(r.completedAt), lastAt: ends.length ? Math.max(...ends) : null };
  });
  return lanes.sort((a, b) => b.done - a.done || (a.lastAt ?? Infinity) - (b.lastAt ?? Infinity) || a.number - b.number);
}
/** After SHOW ANSWER the final ranking is by correct answers, then by finishing time. */
export function finalStandings(lanes: readonly RaceLane[]): RaceLane[] {
  return [...lanes].sort((a, b) => b.correct - a.correct || (a.lastAt ?? Infinity) - (b.lastAt ?? Infinity) || a.number - b.number);
}
