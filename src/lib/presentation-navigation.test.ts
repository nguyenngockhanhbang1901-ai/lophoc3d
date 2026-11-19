import { describe, expect, it } from 'vitest';
import { adjacentLessonPart, arrivalScrollTop } from './presentation-navigation';

describe('opening the next lesson part', () => {
  it('Enter on the last slide of Luyện tập 1 opens Luyện tập 2', () => {
    expect(adjacentLessonPart(4, 1)).toBe(3);
  });
  it('full screen: a page scrolled down returns to the top so the first slide shows', () => {
    expect(arrivalScrollTop(257, 40, true)).toBe(0);
    expect(arrivalScrollTop(0, 40, true)).toBeNull();
  });
  it('normal screen: scrolled below the part start goes back to the part start, otherwise stays', () => {
    expect(arrivalScrollTop(642, 560, false)).toBe(560);
    expect(arrivalScrollTop(300, 560, false)).toBeNull();
  });
});
