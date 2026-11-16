import { describe, expect, it } from 'vitest';
import { isFullscreenShortcut } from './presentation-fullscreen';
const key = (k: string, extra: Partial<KeyboardEvent> = {}) => ({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...extra });
describe('presentation full screen shortcut', () => {
  it('F12 turns on full screen in presentation mode', () => { expect(isFullscreenShortcut(key('F12'), true)).toBe(true); });
  it('F12 does nothing outside presentation mode', () => { expect(isFullscreenShortcut(key('F12'), false)).toBe(false); });
  it('other keys and modified F12 are ignored', () => {
    expect(isFullscreenShortcut(key('Enter'), true)).toBe(false);
    expect(isFullscreenShortcut(key('F12', { ctrlKey: true }), true)).toBe(false);
  });
});
import { presentationShortcut } from './presentation-fullscreen';
describe('presentation teacher keys', () => {
  it('F1 hands out Hoạt động 1 and Luyện tập 2', () => {
    expect(presentationShortcut(key('F1'), true, 1)).toBe('assign');
    expect(presentationShortcut(key('F1'), true, 3)).toBe('assign');
  });
  it('F2 shows answers in Hoạt động 1 and Luyện tập 2', () => {
    expect(presentationShortcut(key('F2'), true, 1)).toBe('answers');
    expect(presentationShortcut(key('F2'), true, 3)).toBe('answers');
  });
  it('F1 and F2 do nothing in Hoạt động 2, Luyện tập 1 and Hoạt động 3', () => {
    for (const part of [2, 4, 5]) { expect(presentationShortcut(key('F1'), true, part)).toBeNull(); expect(presentationShortcut(key('F2'), true, part)).toBeNull(); }
  });
  it('F1 and F2 do nothing outside presentation mode', () => {
    expect(presentationShortcut(key('F1'), false, 1)).toBeNull();
    expect(presentationShortcut(key('F2'), false, 3)).toBeNull();
  });
});
