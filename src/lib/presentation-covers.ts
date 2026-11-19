import type { ActivityNumber } from './assignment';

/** Full screen cover pictures shown only to a teacher presenting in full screen. */
export type PresentationCover = 'welcome' | 'title' | 'thanks';

/** Enter: welcome → lesson title → lesson content; the thank-you picture stays until Esc. */
export function coverAfterEnter(cover: PresentationCover | null): PresentationCover | null {
  if (cover === 'welcome') return 'title';
  if (cover === 'title') return null;
  return cover;
}
/** Backspace: lesson title → welcome; thank-you → back to Hoạt động 3. */
export function coverAfterBack(cover: PresentationCover | null): PresentationCover | null {
  if (cover === 'title') return 'welcome';
  if (cover === 'thanks') return null;
  return cover;
}
/** Arriving at a part forwards in full screen presentation: only Hoạt động 1 opens with the welcome picture. */
export function coverOnArrival(part: ActivityNumber, presentingFullscreen: boolean, backward: boolean): PresentationCover | null {
  return presentingFullscreen && part === 1 && !backward ? 'welcome' : null;
}
/** The thank-you picture follows Enter only on Luyện tập 3's last step (end of the lesson); Hoạt động 3 always continues to Luyện tập 3. */
export function thanksAvailable(part: ActivityNumber, presentingFullscreen: boolean) {
  return presentingFullscreen && part === 6;
}
/** Tab jumps straight to the thank-you picture from any part, but only while the teacher presents in full screen. */
export function isThanksShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>, presentingFullscreen: boolean) {
  return presentingFullscreen && event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}
