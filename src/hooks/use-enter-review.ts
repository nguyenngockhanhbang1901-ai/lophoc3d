import { useContext, useEffect, useRef, useState } from 'react';
import { nextReviewStep, previousReviewStep } from '@/lib/review-navigation';
import { PresentationNavigation } from '@/lib/presentation-navigation';
import { arrowKeyOwnedByWidget, stepKeyAction } from '@/lib/step-keys';

function typingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]'));
}

/** Teacher answer review: Enter or → moves to the next question, Backspace or ← to the previous one; with `onFinish`, two Enters on the last question finish the review. */
export function useEnterReview(total: number, onFinish?: () => void, confirmFinish = true) {
  const navigation = useContext(PresentationNavigation);
  const finish = onFinish ?? navigation.onFinish;
  const confirmation = navigation.onFinish ? false : confirmFinish;
  const [localSelected, setSelected] = useState(navigation.initialLast ? Math.max(0, total - 1) : navigation.initialStep ?? 0);
  const selected = Math.max(0, Math.min(navigation.controlledStep ?? localSelected, total - 1));
  const [armed, setArmed] = useState(false);
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const state = useRef({ selected, armed, onFinish: finish, total, confirmFinish: confirmation, onBack: navigation.onBack });
  state.current = { selected, armed, onFinish: finish, total, confirmFinish: confirmation, onBack: navigation.onBack };
  useEffect(() => {
    // Capture phase so Enter never also "clicks" a focused button such as SHOW ANSWER.
    const onKey = (event: KeyboardEvent) => {
      if (navigationRef.current.readOnly) return;
      // → shares the Enter path and ← the Backspace path below, so both always behave identically.
      const action = stepKeyAction(event.key);
      if (!action || event.repeat || event.isComposing || typingTarget(event.target) || arrowKeyOwnedByWidget(event.key, event.target) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault(); event.stopPropagation();
      const current = state.current;
      if (action === 'back') {
        if (current.selected === 0 && current.onBack) { current.onBack(); return; }
        const back = previousReviewStep(current.selected);
        setSelected(back.selected); setArmed(back.armed); navigationRef.current.onStep?.(back.selected);
        return;
      }
      if (!current.onFinish && current.selected >= current.total - 1) return;
      if (current.onFinish && !current.confirmFinish && current.selected >= current.total - 1) { current.onFinish(); return; }
      const step = nextReviewStep(current.selected, current.armed, current.total);
      setSelected(step.selected); setArmed(step.armed);
      navigationRef.current.onStep?.(step.selected);
      if (step.finish) current.onFinish?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const select = (index: number) => {
    if (navigationRef.current.readOnly) return;
    const step = Math.max(0, Math.min(index, total - 1));
    setSelected(step); setArmed(false); navigationRef.current.onStep?.(step);
  };
  return { selected, armed, select };
}
