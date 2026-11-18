import { describe, expect, it } from 'vitest';
import { finalStandings, QUIZ_QUESTIONS, QUIZ_STEPS, raceBar, raceLeader, raceStandings } from './quiz-race';
import { centroid, mid, QUIZ_FIGURES } from './quiz-figures';
import type { StepProgress } from './goal-progress';

const release = '2026-01-01T00:00:00.000Z';
const at = (s: number) => new Date(Date.parse(release) + s * 1000).toISOString();
function team(ends: number[], answers: string[] = []): StepProgress {
  return { answers, step: ends.length, completedAt: ends.length === 9 ? at(ends[8]!) : null, timings: Array.from({ length: 9 }, (_, i) => ({ started_at: i <= ends.length ? at(i === 0 ? 0 : ends[i - 1] ?? 0) : null, ended_at: ends[i] !== undefined ? at(ends[i]!) : null })) };
}
describe('Luyện tập 3 · AI NHANH HƠN', () => {
  it('has nine four-choice questions with static figures on questions 6–9', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(9);
    expect(QUIZ_QUESTIONS.map(q => q.correct)).toEqual(['C', 'C', 'B', 'B', 'B', 'D', 'C', 'D', 'C']);
    expect(QUIZ_QUESTIONS.map(q => q.figure ?? null)).toEqual([null, null, null, null, null, 'tetra-midpoints', 'pyramid', 'tetra-centroids', 'pyramid-center']);
  });
  it('accepts only the letters A–D and gives 30 seconds per question', () => {
    expect(QUIZ_STEPS.accepts(0, 'B')).toBe(true);
    expect(QUIZ_STEPS.accepts(0, 'E')).toBe(false);
    expect(QUIZ_STEPS.limitMs).toBe(30_000);
  });
  it('puts the team with more finished questions first', () => {
    const lanes = raceStandings([{ number: 1, progress: team([5]) }, { number: 2, progress: team([3, 6]) }], release, Date.parse(at(8)));
    expect(lanes.map(l => [l.number, l.done])).toEqual([[2, 2], [1, 1]]);
  });
  it('more correct answers lead during the game, even when another team answered faster', () => {
    // Tổ 1: 5 right, then a fast wrong Câu 6. Tổ 2: slower, but 6 right.
    const t1 = team([1, 2, 3, 4, 5, 6], ['C', 'C', 'B', 'B', 'B', 'A']);
    const t2 = team([2, 4, 6, 8, 10, 12], ['C', 'C', 'B', 'B', 'B', 'D']);
    const lanes = raceStandings([{ number: 1, progress: t1 }, { number: 2, progress: t2 }], release, Date.parse(at(13)));
    expect(lanes.map(l => [l.number, l.correct])).toEqual([[2, 6], [1, 5]]);
    expect(raceLeader(lanes)).toBe(2);
  });
  it('with the same number correct, the team that reached that score first leads', () => {
    const t1 = team([1, 2, 3, 4, 5, 6], ['C', 'C', 'B', 'B', 'B', 'A']);
    const t2 = team([2, 4, 6, 8, 10], ['C', 'C', 'B', 'B', 'B']);
    const lanes = raceStandings([{ number: 2, progress: t2 }, { number: 1, progress: t1 }], release, Date.parse(at(11)));
    expect(lanes.map(l => l.number)).toEqual([1, 2]);
  });
  it('with the same count, the team that got there sooner is ahead', () => {
    const lanes = raceStandings([{ number: 1, progress: team([9]) }, { number: 2, progress: team([4]) }], release, Date.parse(at(10)));
    expect(lanes.map(l => l.number)).toEqual([2, 1]);
  });
  it('final ranking after SHOW ANSWER is by correct answers', () => {
    const lanes = raceStandings([{ number: 1, progress: team([1, 2, 3, 4, 5, 6, 7, 8, 9], ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A']) }, { number: 2, progress: team([2, 4, 6, 8, 10, 12, 14, 16, 18], ['C', 'C', 'B', 'B', 'B', 'D', 'C', 'D', 'C']) }], release, Date.parse(at(20)));
    expect(lanes[0]!.number).toBe(2);
    expect(finalStandings(lanes).map(l => [l.number, l.correct])).toEqual([[2, 9], [1, 0]]);
  });
});
describe('Luyện tập 3 race bar', () => {
  it('green covers correct answers and red the wrong ones (4 right of 7 done)', () => {
    const bar = raceBar({ done: 7, correct: 4 });
    expect(bar.correct).toBeCloseTo(4 / 9);
    expect(bar.wrong).toBeCloseTo(3 / 9);
  });
  it('a team that overtakes moves to the top and wears the crown', () => {
    const before = raceStandings([{ number: 1, progress: team([3, 6]) }, { number: 2, progress: team([5]) }], release, Date.parse(at(7)));
    expect(raceLeader(before)).toBe(1);
    const after = raceStandings([{ number: 1, progress: team([3, 6]) }, { number: 2, progress: team([5, 6.5, 8]) }], release, Date.parse(at(9)));
    expect(after.map(l => l.number)).toEqual([2, 1]);
    expect(raceLeader(after)).toBe(2);
  });
  it('no crown before any team has finished a question', () => {
    expect(raceLeader(raceStandings([{ number: 1, progress: team([]) }], release, Date.parse(at(1))))).toBeNull();
  });
});
describe('Luyện tập 3 figures', () => {
  const pts = (k: keyof typeof QUIZ_FIGURES) => QUIZ_FIGURES[k].points as Record<string, readonly [number, number]>;
  it('Câu 8 draws the medians AM and AN through the centroids I and J', () => {
    const { A, B, C, D, I, J, M, N } = pts('tetra-centroids');
    expect(M).toEqual(mid(B!, C!)); expect(N).toEqual(mid(B!, D!));
    const cross = (o: readonly [number, number], p: readonly [number, number], q: readonly [number, number]) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    expect(cross(A!, M!, I!)).toBeCloseTo(0); expect(cross(A!, N!, J!)).toBeCloseTo(0);
    const segs = QUIZ_FIGURES['tetra-centroids'].segments.map(s => `${s.from}${s.to}`);
    expect(segs).toEqual(expect.arrayContaining(['AM', 'AN']));
  });
  it('pyramid bases are parallelograms (AB = DC as vectors)', () => {
    for (const k of ['pyramid', 'pyramid-center'] as const) {
      const { A, B, C, D } = pts(k);
      expect([B![0] - A![0], B![1] - A![1]]).toEqual([C![0] - D![0], C![1] - D![1]]);
    }
  });
  it('derived points are true midpoints and centroids', () => {
    const t = pts('tetra-midpoints'), c = pts('tetra-centroids'), p = pts('pyramid-center');
    expect(t['M']).toEqual(mid(t['A']!, t['B']!)); expect(t['N']).toEqual(mid(t['A']!, t['C']!));
    expect(c['I']).toEqual(centroid(c['A']!, c['B']!, c['C']!)); expect(c['J']).toEqual(centroid(c['A']!, c['B']!, c['D']!));
    expect(p['O']).toEqual(mid(p['A']!, p['C']!)); expect(p['M']).toEqual(mid(p['S']!, p['A']!));
  });
  it('IJ is drawn parallel to CD, as the answer key says', () => {
    const { I, J, C, D } = pts('tetra-centroids');
    const cross = (J![0] - I![0]) * (D![1] - C![1]) - (J![1] - I![1]) * (D![0] - C![0]);
    expect(Math.abs(cross)).toBeLessThan(1e-9);
  });
});
