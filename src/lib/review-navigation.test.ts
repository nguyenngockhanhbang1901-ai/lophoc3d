import { describe, expect, it } from 'vitest';
import { nextReviewStep, previousReviewStep } from './review-navigation';

describe('Activity 1 review Enter navigation', () => {
  it('moves from question 1 to question 2 on one Enter', () => {
    expect(nextReviewStep(0, false, 6)).toEqual({ selected: 1, armed: false, finish: false });
  });
  it('does not leave question 6 on a single Enter', () => {
    expect(nextReviewStep(5, false, 6)).toEqual({ selected: 5, armed: true, finish: false });
  });
  it('moves to Activity 2 after a second consecutive Enter on question 6', () => {
    expect(nextReviewStep(5, true, 6)).toEqual({ selected: 5, armed: false, finish: true });
  });
  it('arriving at question 6 from question 5 does not count as the first Enter', () => {
    expect(nextReviewStep(4, false, 6).armed).toBe(false);
  });
});

describe('Backspace goes back', () => {
  it('moves from question 3 back to question 2', () => {
    expect(previousReviewStep(2)).toEqual({ selected: 1, armed: false, finish: false });
  });
  it('stays on question 1', () => {
    expect(previousReviewStep(0).selected).toBe(0);
  });
  it('cancels a pending double Enter on the last question', () => {
    expect(previousReviewStep(5).armed).toBe(false);
  });
});
