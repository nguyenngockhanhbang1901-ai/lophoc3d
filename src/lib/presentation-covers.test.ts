import { describe, expect, it } from 'vitest';
import { coverAfterBack, coverAfterEnter, coverOnArrival, thanksAvailable } from './presentation-covers';

describe('presentation cover pictures', () => {
  it('Enter goes welcome → lesson title → Hoạt động 1 content', () => {
    expect(coverAfterEnter('welcome')).toBe('title');
    expect(coverAfterEnter('title')).toBeNull();
  });
  it('Enter on the thank-you picture does nothing', () => { expect(coverAfterEnter('thanks')).toBe('thanks'); });
  it('Backspace goes lesson title → welcome and leaves the thank-you picture', () => {
    expect(coverAfterBack('title')).toBe('welcome');
    expect(coverAfterBack('thanks')).toBeNull();
  });
  it('only Hoạt động 1 opens with the welcome picture, and only in full screen presentation', () => {
    expect(coverOnArrival(1, true, false)).toBe('welcome');
    for (const part of [2, 3, 4, 5] as const) expect(coverOnArrival(part, true, false)).toBeNull();
    expect(coverOnArrival(1, false, false)).toBeNull();
  });
  it('the thank-you picture needs Hoạt động 3, full screen presentation and a finished AI solution', () => {
    expect(thanksAvailable(5, true, true)).toBe(true);
    expect(thanksAvailable(5, true, false)).toBe(false);
    expect(thanksAvailable(5, false, true)).toBe(false);
    expect(thanksAvailable(1, true, true)).toBe(false);
  });
});
