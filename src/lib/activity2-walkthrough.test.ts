import { describe, expect, it } from 'vitest';
import { ACTIVITY2_ORDER, ACTIVITY2_TOTAL, activity2ConceptVisible } from './activity2-walkthrough';

describe('Activity 2 presentation', () => {
  it('starts with parallel, intersecting and contained models', () => {
    expect(ACTIVITY2_ORDER).toEqual([1, 0, 2]);
    expect(ACTIVITY2_TOTAL).toBe(4);
    expect([0, 1, 2].map(column => activity2ConceptVisible(0, column))).toEqual([false, false, false]);
  });
  it('reveals one concept and static drawing per Enter', () => {
    expect([0, 1, 2].map(column => activity2ConceptVisible(1, column))).toEqual([true, false, false]);
    expect([0, 1, 2].map(column => activity2ConceptVisible(2, column))).toEqual([true, true, false]);
    expect([0, 1, 2].map(column => activity2ConceptVisible(3, column))).toEqual([true, true, true]);
  });
  it('restores models when stepping backwards', () => {
    expect(activity2ConceptVisible(2, 2)).toBe(false);
    expect(activity2ConceptVisible(1, 1)).toBe(false);
    expect(activity2ConceptVisible(0, 0)).toBe(false);
  });
});