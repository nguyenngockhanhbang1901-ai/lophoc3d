import { describe, expect, it } from 'vitest';
import { finalStandings, QUIZ_QUESTIONS, QUIZ_STEPS, raceStandings } from './quiz-race';
import { edgeHidden, PYRAMID, solidEdges, TETRAHEDRON } from './solid-models';
import type { StepProgress } from './goal-progress';

const release = '2026-01-01T00:00:00.000Z';
const at = (s: number) => new Date(Date.parse(release) + s * 1000).toISOString();
function team(ends: number[], answers: string[] = []): StepProgress {
  return { answers, step: ends.length, completedAt: ends.length === 7 ? at(ends[6]!) : null, timings: Array.from({ length: 7 }, (_, i) => ({ started_at: i <= ends.length ? at(i === 0 ? 0 : ends[i - 1] ?? 0) : null, ended_at: ends[i] !== undefined ? at(ends[i]!) : null })) };
}
describe('Luyện tập 3 · AI NHANH HƠN', () => {
  it('has seven four-choice questions with models only on questions 6 and 7', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(7);
    expect(QUIZ_QUESTIONS.map(q => q.correct)).toEqual(['C', 'C', 'B', 'B', 'B', 'D', 'C']);
    expect(QUIZ_QUESTIONS.map(q => q.model ?? null)).toEqual([null, null, null, null, null, 'tetrahedron', 'pyramid']);
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
  it('with the same count, the team that got there sooner is ahead', () => {
    const lanes = raceStandings([{ number: 1, progress: team([9]) }, { number: 2, progress: team([4]) }], release, Date.parse(at(10)));
    expect(lanes.map(l => l.number)).toEqual([2, 1]);
  });
  it('final ranking after SHOW ANSWER is by correct answers', () => {
    const lanes = raceStandings([{ number: 1, progress: team([1, 2, 3, 4, 5, 6, 7], ['A', 'A', 'A', 'A', 'A', 'A', 'A']) }, { number: 2, progress: team([2, 4, 6, 8, 10, 12, 14], ['C', 'C', 'B', 'B', 'B', 'D', 'C']) }], release, Date.parse(at(20)));
    expect(lanes[0]!.number).toBe(1);
    expect(finalStandings(lanes).map(l => [l.number, l.correct])).toEqual([[2, 7], [1, 0]]);
  });
});
describe('Luyện tập 3 solids', () => {
  it('a convex solid seen from outside shows at least one hidden and one visible edge', () => {
    for (const solid of [TETRAHEDRON, PYRAMID]) {
      const edges = solidEdges(solid);
      const hidden = edges.filter(e => edgeHidden(solid, e.faces, [3.5, 3, 9]));
      expect(hidden.length).toBeGreaterThan(0);
      expect(hidden.length).toBeLessThan(edges.length);
    }
  });
  it('pyramid base is a parallelogram (AB = DC as vectors)', () => {
    const { A, B, C, D } = PYRAMID.vertices as Record<string, [number, number, number]>;
    expect([B![0] - A![0], B![1] - A![1], B![2] - A![2]]).toEqual([C![0] - D![0], C![1] - D![1], C![2] - D![2]]);
  });
});
