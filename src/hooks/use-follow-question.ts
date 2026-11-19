import { useEffect, useRef } from 'react';

/** Slide to show when the teams' shared question moves from `previous` to `next`; null = stay. Question i is slide i + 1 (slide 0 is the introduction). */
export function followStep(previous: number | null | undefined, next: number | null | undefined): number | null {
  return next == null || next === previous ? null : next + 1;
}
/**
 * Teacher screen of a timed part: jump to the question the teams are on whenever it changes,
 * but never on arrival, so entering a part with Enter/Backspace always opens on the slide navigation chose.
 */
export function useFollowSharedQuestion(question: number | null | undefined, select: (step: number) => void) {
  const last = useRef(question);
  useEffect(() => {
    const step = followStep(last.current, question);
    last.current = question;
    if (step != null) select(step);
  }, [question]);
}
