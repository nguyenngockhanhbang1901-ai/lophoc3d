import { describe, expect, it } from 'vitest';
import { reconcileSteps, submitStep, type StepProgress } from './goal-progress';
import { PRACTICE_QUESTIONS, PRACTICE_STEPS } from './practice-questions';

const released = '2026-11-13T16:30:00.000Z';
const now = Date.parse(released);
const empty = (): StepProgress => ({ answers: ['', '', ''], step: 0, completedAt: null, timings: [] });

describe('Luyện tập 1 timing', () => {
  it('has three short-answer questions a, b, c', () => {
    expect(PRACTICE_QUESTIONS.map(q => q.label)).toEqual(['a', 'b', 'c']);
  });
  it('gives each question 90 seconds, then moves on automatically', () => {
    expect(reconcileSteps(empty(), released, now + 89_999, PRACTICE_STEPS).step).toBe(0);
    const result = reconcileSteps(empty(), released, now + 90_000, PRACTICE_STEPS);
    expect(result.step).toBe(1);
    expect(result.timings[1]?.started_at).toBe(new Date(now + 90_000).toISOString());
  });
  it('submits automatically when the last question runs out', () => {
    const result = reconcileSteps(empty(), released, now + 270_000, PRACTICE_STEPS);
    expect(result.step).toBe(2);
    expect(result.completedAt).toBe(new Date(now + 270_000).toISOString());
  });
  it('sending an answer starts the next 90-second question and locks the sent one', () => {
    const result = submitStep(reconcileSteps(empty(), released, now, PRACTICE_STEPS), 0, "(ABCD) và (ABB'A')", now + 10_000, PRACTICE_STEPS);
    expect(result.step).toBe(1);
    expect(result.answers[0]).toBe("(ABCD) và (ABB'A')");
    expect(() => submitStep(result, 0, 'khác', now + 11_000, PRACTICE_STEPS)).toThrow();
  });
  it('answers cannot be changed after the last question is sent', () => {
    let p = reconcileSteps(empty(), released, now, PRACTICE_STEPS);
    p = submitStep(p, 0, 'a', now + 1000, PRACTICE_STEPS);
    p = submitStep(p, 1, 'b', now + 2000, PRACTICE_STEPS);
    p = submitStep(p, 2, 'c', now + 3000, PRACTICE_STEPS);
    expect(p.completedAt).not.toBeNull();
    expect(() => submitStep(p, 2, 'sửa', now + 4000, PRACTICE_STEPS)).toThrow('Không thể sửa');
  });
});

describe('untimed parts (Luyện tập 1, Hoạt động 3)', () => {
  it('Hoạt động 3 asks only the parallel-to-AB question, shows Luyện tập 2 answers a, b, c in symbols, and has no timer', async () => {
    const { ACTIVITY3_QUESTIONS, PRACTICE_SETS } = await import('./practice-questions');
    expect(ACTIVITY3_QUESTIONS.map(q => q.prompt)).toEqual(['Hãy kể tên các đường thẳng song song với đường thẳng AB?']);
    expect(PRACTICE_SETS[5].recap?.items.map(i => i.label)).toEqual(['a)', 'b)', 'c)']);
    expect(PRACTICE_SETS[5].recap?.items[1]!.lines).toEqual(['$AB \\subset (ABCD)$', "$AB \\subset (ABB'A')$"]);
    expect(PRACTICE_SETS[5].seconds).toBeNull();
    expect(PRACTICE_SETS[4].seconds).toBeNull();
  });
  it('Luyện tập 2 asks "cắt" first and "nằm trong" second', () => {
    expect(PRACTICE_QUESTIONS[0]!.prompt).toBe('Đường thẳng AB cắt những mặt phẳng nào?');
    expect(PRACTICE_QUESTIONS[1]!.prompt).toBe('Đường thẳng AB nằm trong những mặt phẳng nào?');
  });
  it('Luyện tập 2 question c asks for lines parallel to (ABCD) and gives the concise symbolic answer', () => {
    expect(PRACTICE_QUESTIONS[2]!.prompt).toBe('Kể tên những đường thẳng song song với mặt phẳng (ABCD)');
    expect(PRACTICE_QUESTIONS.map(question => question.answer)).toEqual([
      "$AB \\cap (ADD'A') = A,\\ AB \\cap (BCC'B') = B$",
      "$AB \\subset (ABCD),\\ AB \\subset (ABB'A')$",
      "$A'B' \\ss (ABCD),\\ B'C' \\ss (ABCD),\\ C'D' \\ss (ABCD),\\ D'A' \\ss (ABCD)$",
    ]);
  });
  it('sending moves on; the last answer submits and nothing can be changed afterwards', async () => {
    const { submitUntimed } = await import('./practice-questions');
    let p = submitUntimed({ answers: ['', '', ''], step: 0, completedAt: null }, 0, "A'B', C'D', CD", now, 3);
    expect(p).toMatchObject({ step: 1, completedAt: null });
    expect(() => submitUntimed(p, 0, 'sửa', now, 3)).toThrow();
    p = submitUntimed(p, 1, 'b', now, 3);
    p = submitUntimed(p, 2, 'c', now, 3);
    expect(p.completedAt).not.toBeNull();
    expect(() => submitUntimed(p, 2, 'sửa', now, 3)).toThrow('Không thể sửa');
  });
});
