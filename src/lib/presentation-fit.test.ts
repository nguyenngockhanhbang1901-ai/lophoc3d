import { describe, expect, it } from 'vitest';
import { presentationScale } from './presentation-fit';

describe('presentation slide fitting', () => {
  it('keeps the same lesson scale after the AI panel opens and adds 1200px', () => {
    const closed = presentationScale(900, 646);
    expect(presentationScale(2100, 646, 1200)).toBe(closed);
  });
  it('still shrinks a lesson slide that is taller than the screen', () => {
    expect(presentationScale(1292, 646)).toBe(0.5);
  });
  it('never enlarges a slide that already fits', () => {
    expect(presentationScale(400, 646)).toBe(1);
  });
});
