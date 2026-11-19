import { describe, expect, it } from 'vitest';
import { coverAfterBack, coverAfterEnter, coverOnArrival, isThanksShortcut, thanksAvailable } from './presentation-covers';

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
  it('the thank-you picture follows only Luyện tập 3, in full screen presentation', () => {
    expect(thanksAvailable(6, true)).toBe(true);
    expect(thanksAvailable(6, false)).toBe(false);
    expect(thanksAvailable(1, true)).toBe(false);
  });
  it('Enter after the AI solution in Hoạt động 3 never opens the thank-you picture', () => {
    expect(thanksAvailable(5, true)).toBe(false);
  });
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods });
  it('Tab opens the thank-you picture in full screen presentation', () => {
    expect(isThanksShortcut(key('Tab'), true)).toBe(true);
  });
  it('Tab is ordinary outside full screen presentation, and Shift+Tab never jumps', () => {
    expect(isThanksShortcut(key('Tab'), false)).toBe(false);
    expect(isThanksShortcut(key('Tab', { shiftKey: true }), true)).toBe(false);
  });
});
