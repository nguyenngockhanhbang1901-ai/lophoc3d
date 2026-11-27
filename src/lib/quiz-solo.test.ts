import { describe, expect, it } from 'vitest';
import { readSoloProgress, soloStandings, soloTimeLabel, soloTimeMs, type SoloRow } from './quiz-solo';
import { submitStep, reconcileSteps } from './goal-progress';
import { QUIZ_QUESTIONS, QUIZ_STEPS } from './quiz-race';

const release = '2026-11-27T05:00:00.000Z';
const t0 = Date.parse(release);
/** Plays every question, answering each `gapsMs[i]` after it opened. */
function play(gapsMs: number[], letters: (i: number) => string) {
  let p = reconcileSteps(readSoloProgress([]), release, t0, QUIZ_STEPS);
  let now = t0;
  gapsMs.forEach((gap, i) => { now += gap; p = reconcileSteps(p, release, now, QUIZ_STEPS); p = submitStep(p, i, letters(i), now, QUIZ_STEPS); });
  return { progress: p, end: now };
}
const right = (i: number) => QUIZ_QUESTIONS[i]!.correct;
const wrong = (i: number) => (QUIZ_QUESTIONS[i]!.correct === 'A' ? 'B' : 'A');
const all = (ms: number) => Array.from({ length: QUIZ_QUESTIONS.length }, () => ms);

describe('Bài 12.1 progress', () => {
  it('reads a fresh slot ([]) as a new game', () => {
    const p = readSoloProgress([]);
    expect(p).toMatchObject({ answers: [], step: 0, completedAt: null, rev: 0 });
    expect(p.timings).toHaveLength(QUIZ_STEPS.count);
  });
  it('measures time from Câu 1 to the last answer', () => {
    const { progress } = play(all(2000), right);
    expect(soloTimeMs(progress)).toBe(2000 * QUIZ_QUESTIONS.length);
  });
});

describe('Bài 12.1 ranking: correct answers first, then time', () => {
  it('ranks more correct answers above a faster time, and the faster one wins a tie', () => {
    const fastWrong = play(all(1000), wrong).progress;
    const slowRight = play(all(3000), right).progress;
    const quickRight = play(all(2000), right).progress;
    const half = play([1000, 1000, 1000], right).progress;
    const rows: SoloRow[] = [
      { slot: 1, name: 'Đúng hết, chậm', progress: slowRight },
      { slot: 2, name: 'Đang làm', progress: half },
      { slot: 3, name: 'Nhanh nhưng sai', progress: fastWrong },
      { slot: 4, name: 'Chưa làm', progress: readSoloProgress([]) },
      { slot: 5, name: 'Đúng hết, nhanh', progress: quickRight },
    ];
    const order = soloStandings(rows, release, t0 + 3000 * QUIZ_QUESTIONS.length + 10).map(s => s.name);
    expect(order).toEqual(['Đúng hết, nhanh', 'Đúng hết, chậm', 'Đang làm', 'Nhanh nhưng sai', 'Chưa làm']);
  });
  it('counts timed-out questions with their full 30 seconds', () => {
    const lazy = readSoloProgress([]);
    const [s] = soloStandings([{ slot: 1, name: 'A', progress: lazy }], release, t0 + 31 * 60_000);
    expect(s).toMatchObject({ finished: true, correct: 0, timeMs: 30_000 * QUIZ_QUESTIONS.length });
  });
  it('formats times as m:ss,t', () => {
    expect(soloTimeLabel(65_340)).toBe('1:05,3');
    expect(soloTimeLabel(null)).toBe('—');
  });
});
