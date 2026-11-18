type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/** F12 turns on full screen while a teacher is presenting; the browser's own Esc turns it off. */
export function isFullscreenShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>, presenting: boolean) {
  return presenting && event.key === 'F12' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}
export function isDocumentFullscreen() {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}
/** Must run inside a click or key press, because browsers only allow full screen from a user action. The whole page (top area and lesson) goes full screen. */
export function enterPresentationFullscreen() {
  if (typeof document === 'undefined' || isDocumentFullscreen()) return;
  const root = document.documentElement as WebkitElement;
  if (root.requestFullscreen) void root.requestFullscreen().catch(() => undefined);
  else void Promise.resolve(root.webkitRequestFullscreen?.()).catch(() => undefined);
}
export function exitPresentationFullscreen() {
  if (typeof document === 'undefined' || !isDocumentFullscreen()) return;
  const doc = document as WebkitDocument;
  if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => undefined);
  else void Promise.resolve(doc.webkitExitFullscreen?.()).catch(() => undefined);
}
/** Calls `listener` with the current full screen state whenever it changes (Esc included). */
export function onFullscreenChange(listener: (fullscreen: boolean) => void) {
  const handle = () => listener(isDocumentFullscreen());
  document.addEventListener('fullscreenchange', handle);
  document.addEventListener('webkitfullscreenchange', handle);
  return () => { document.removeEventListener('fullscreenchange', handle); document.removeEventListener('webkitfullscreenchange', handle); };
}

export type PresentationShortcut = 'fullscreen' | 'assign' | 'answers';
/**
 * Teacher keys in presentation mode: F12 full screen, F1 hands out the current part
 * (only parts that are handed out), F2 SHOW ANSWER (Hoạt động 1 and Luyện tập 2 only).
 */
export function presentationShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>, presenting: boolean, activity: number): PresentationShortcut | null {
  if (!presenting || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return null;
  if (event.key === 'F12') return 'fullscreen';
  if (event.key === 'F1' && (activity === 1 || activity === 3 || activity === 6)) return 'assign';
  if (event.key === 'F2' && (activity === 1 || activity === 3 || activity === 6)) return 'answers';
  return null;
}
/** Adds the `presenting` class to <html> while the page is in full screen, and removes it on exit. */
export function trackPresentingClass() {
  const apply = (fullscreen: boolean) => document.documentElement.classList.toggle('presenting', fullscreen);
  apply(isDocumentFullscreen());
  const stop = onFullscreenChange(apply);
  return () => { stop(); document.documentElement.classList.remove('presenting'); };
}
