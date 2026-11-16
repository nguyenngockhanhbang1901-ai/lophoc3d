import { describe, expect, it } from 'vitest';
import { ACTIVITY3_STAGES, ACTIVITY3_SYMBOL_ANSWERS } from './activity3-walkthrough';

describe('Activity 3 ordered presentation', () => {
  it('puts containment conditions before the parallel condition in the braced relation', () => {
    const answer = ACTIVITY3_SYMBOL_ANSWERS.relation;
    expect(answer).toContain('\\left\\{');
    expect(answer.indexOf('AB \\subset (ABCD)')).toBeLessThan(answer.indexOf("A'B' \\not\\subset (ABCD)"));
    expect(answer.indexOf("A'B' \\not\\subset (ABCD)")).toBeLessThan(answer.indexOf("A'B' \\ss AB"));
  });
  it('advances from the relation answer directly to the general rule', () => {
    const relation = ACTIVITY3_STAGES.findIndex(s => s.kind === 'question' && s.title === 'Câu 3' && Boolean(s.answer));
    expect(relation).toBe(3);
    expect(ACTIVITY3_STAGES[relation + 1]).toEqual({ kind: 'general', rule: true });
  });
  it('advances from question 5 answer to the application question', () => {
    expect(ACTIVITY3_STAGES.at(-3)).toMatchObject({ kind: 'question', title: 'Câu 5', answer: ACTIVITY3_SYMBOL_ANSWERS.condition });
    expect(ACTIVITY3_STAGES.at(-2)).toEqual({ kind: 'application', ac: false });
  });
  it('adds line AC to the application drawing on the Enter after Câu 6 appears', () => {
    expect(ACTIVITY3_STAGES.at(-1)).toEqual({ kind: 'application', ac: true });
  });
});