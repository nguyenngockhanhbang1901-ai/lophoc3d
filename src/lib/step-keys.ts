/** Presentation step keys: → behaves exactly like Enter, ← exactly like Backspace. */
export type StepAction = 'next' | 'back';
export function stepKeyAction(key: string): StepAction | null {
  if (key === 'Enter' || key === 'ArrowRight') return 'next';
  if (key === 'Backspace' || key === 'ArrowLeft') return 'back';
  return null;
}
/** Arrow keys keep their native meaning inside widgets that use them (radio groups, sliders, tabs, menus). */
export function arrowKeyOwnedByWidget(key: string, target: EventTarget | null) {
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return false;
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('[role="radiogroup"], [role="radio"], [role="slider"], [role="tablist"], [role="menu"], [role="listbox"], [role="combobox"]'));
}
/** On-screen arrow buttons send the same key event as the keyboard, so they run the very same handlers. */
export function pressStepKey(action: StepAction) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: action === 'next' ? 'Enter' : 'Backspace', bubbles: true }));
}
