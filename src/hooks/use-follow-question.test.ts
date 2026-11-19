import { describe, expect, it } from 'vitest';
import { followStep } from './use-follow-question';

describe('teacher screen follows the teams only after arrival', () => {
  it('stays on the arrival slide even when teams already finished the last question', () => {
    expect(followStep(4, 4)).toBeNull();
  });
  it('moves to the next question slide when the teams move on', () => {
    expect(followStep(0, 1)).toBe(2);
    expect(followStep(null, 0)).toBe(1);
  });
  it('ignores a part that has not been handed out', () => {
    expect(followStep(2, null)).toBeNull();
  });
});
