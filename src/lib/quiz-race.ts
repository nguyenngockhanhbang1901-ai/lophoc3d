import { reconcileSteps, type StepConfig, type StepProgress } from './goal-progress';
import type { QuizFigureKey } from './quiz-figures';

/** Luyện tập 3 · "AI NHANH HƠN": four-choice consolidation game for Bài 12. */
export const QUIZ_TITLE = 'Luyện tập 3';
export const QUIZ_GAME_NAME = 'AI NHANH HƠN';
export const QUIZ_SECONDS = 30;
export const QUIZ_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type QuizLetter = typeof QUIZ_LETTERS[number];
/** `figure` names a static textbook drawing shown to the right of the question. */
export type QuizQuestion = { prompt: string; options: readonly [string, string, string, string]; correct: QuizLetter; figure?: QuizFigureKey };

/** Text uses TeX between `$...$` (rendered by MathText); `\ss` = "//". */
export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  { prompt: 'Cho đường thẳng $a$ và mặt phẳng $(P)$. Có bao nhiêu vị trí tương đối giữa $a$ và $(P)$?', options: ['$1$', '$2$', '$3$', '$4$'], correct: 'C' },
  { prompt: 'Đường thẳng $a$ song song với mặt phẳng $(P)$ khi và chỉ khi:', options: ['$a$ và $(P)$ có đúng một điểm chung', '$a$ và $(P)$ có hai điểm chung', '$a$ và $(P)$ không có điểm chung', '$a$ nằm trong $(P)$'], correct: 'C' },
  { prompt: 'Nếu đường thẳng $a$ không nằm trong $(P)$ và $a$ song song với một đường thẳng $d$ nằm trong $(P)$ thì:', options: ['$a$ cắt $(P)$', '$a$ song song với $(P)$', '$a$ nằm trong $(P)$', '$a$ chéo với $(P)$'], correct: 'B' },
  { prompt: 'Để chứng minh $a \\ss (P)$, ta cần chứng minh:', options: ['$a \\ss d$ với $d \\subset (P)$', '$a \\ss d$ với $d \\subset (P)$ và $a \\not\\subset (P)$', '$a$ cắt $d$ với $d \\subset (P)$', '$a$ và $(P)$ có một điểm chung'], correct: 'B' },
  { prompt: 'Cho đường thẳng $a \\ss (P)$. Khẳng định nào sau đây **sai**?', options: ['$a$ và $(P)$ không có điểm chung', 'Mọi đường thẳng nằm trong $(P)$ đều song song với $a$', 'Tồn tại đường thẳng $d$ trong $(P)$ sao cho $d \\ss a$', '$a$ không nằm trong $(P)$'], correct: 'B' },
  { prompt: 'Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình bình hành tâm $O$. Gọi $M$ là trung điểm của $SA$. Đường thẳng $OM$ nằm trong mặt phẳng nào sau đây?', options: ['$(SBD)$', '$(SAB)$', '$(SAC)$', '$(ABCD)$'], correct: 'C', figure: 'pyramid-center' },
  { prompt: 'Cho tứ diện $ABCD$. Gọi $I, J$ lần lượt là trọng tâm của các tam giác $ABC$ và $ABD$. Khẳng định nào sau đây đúng?', options: ['$IJ \\ss BC$', '$IJ \\ss AD$', '$IJ$ cắt $CD$', '$IJ \\ss CD$'], correct: 'D', figure: 'tetra-centroids' },
  { prompt: 'Cho tứ diện $ABCD$. Gọi $M, N$ lần lượt là trung điểm của $AB$ và $AC$. Đường thẳng $MN$ song song với mặt phẳng nào sau đây?', options: ['$(ABC)$', '$(ABD)$', '$(ACD)$', '$(BCD)$'], correct: 'D', figure: 'tetra-midpoints' },
  { prompt: 'Cho hình chóp $S.ABCD$ có đáy $ABCD$ là hình bình hành. Đường thẳng $AB$ song song với mặt phẳng nào sau đây?', options: ['$(SAD)$', '$(SBC)$', '$(SCD)$', '$(SAC)$'], correct: 'C', figure: 'pyramid' },
];

export function isQuizLetter(value: string): value is QuizLetter {
  return (QUIZ_LETTERS as readonly string[]).includes(value);
}
/** One click sends the chosen letter; each question has its own server clock. */
export const QUIZ_STEPS: StepConfig = { count: QUIZ_QUESTIONS.length, limitMs: QUIZ_SECONDS * 1000, accepts: (_step, answer) => isQuizLetter(answer) };

export function quizCorrectCount(answers: readonly unknown[]): number {
  return QUIZ_QUESTIONS.reduce((n, q, i) => n + (answers[i] === q.correct ? 1 : 0), 0);
}

export type RaceLane = { number: number; done: number; correct: number; finished: boolean; lastAt: number | null; reachedAt: number | null };
/**
 * One ranking rule for the live race and the final results: more correct answers first; with the same
 * number correct, the team that reached that score sooner (end of its latest correct question) is ahead;
 * then the team further along, then the earlier end of its last finished question.
 * A question counts as finished once the team answered it or its time ran out.
 */
export function compareLanes(a: RaceLane, b: RaceLane): number {
  return b.correct - a.correct || (a.reachedAt ?? Infinity) - (b.reachedAt ?? Infinity) || b.done - a.done || (a.lastAt ?? Infinity) - (b.lastAt ?? Infinity) || a.number - b.number;
}
export function raceStandings(teams: readonly { number: number; progress: StepProgress }[], releasedAt: string | null, now: number): RaceLane[] {
  const lanes = teams.map(({ number, progress }) => {
    const r = releasedAt ? reconcileSteps(progress, releasedAt, now, QUIZ_STEPS) : progress;
    const done = r.completedAt ? QUIZ_STEPS.count : Math.min(r.step, QUIZ_STEPS.count);
    const endOf = (i: number) => { const t = r.timings[i]?.ended_at; return t ? Date.parse(t) : NaN; };
    const ends = Array.from({ length: done }, (_, i) => endOf(i)).filter(Number.isFinite);
    const correctEnds = Array.from({ length: done }, (_, i) => r.answers[i] === QUIZ_QUESTIONS[i]!.correct ? endOf(i) : NaN).filter(Number.isFinite);
    return { number, done, correct: quizCorrectCount(r.answers), finished: Boolean(r.completedAt), lastAt: ends.length ? Math.max(...ends) : null, reachedAt: correctEnds.length ? Math.max(...correctEnds) : null };
  });
  return lanes.sort(compareLanes);
}
/** After SHOW ANSWER the results keep the same ranking rule as the live race. */
export function finalStandings(lanes: readonly RaceLane[]): RaceLane[] {
  return [...lanes].sort(compareLanes);
}

/**
 * Race bar for one lane, as shares of the whole game: green for correct answers first, then red for
 * wrong or timed-out questions, so correct + wrong always equals the finished share.
 */
export function raceBar(lane: Pick<RaceLane, 'done' | 'correct'>): { correct: number; wrong: number } {
  const correct = Math.min(lane.correct, lane.done);
  return { correct: correct / QUIZ_STEPS.count, wrong: (lane.done - correct) / QUIZ_STEPS.count };
}
/** The crown sits on the first lane once that team has finished at least one question. */
export function raceLeader(lanes: readonly RaceLane[]): number | null {
  return lanes[0] && lanes[0].done > 0 ? lanes[0].number : null;
}
