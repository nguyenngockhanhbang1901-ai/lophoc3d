import type { CaseIndex } from './geometry';

export const ACTIVITY2_ORDER: readonly CaseIndex[] = [1, 0, 2];
export const ACTIVITY2_TOTAL = ACTIVITY2_ORDER.length + 1;
/** Each Enter replaces the next model with its textbook drawing and definition. */
export function activity2ConceptVisible(step: number, column: number) {
  return column >= 0 && column < ACTIVITY2_ORDER.length && step > column;
}