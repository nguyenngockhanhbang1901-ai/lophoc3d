import { createContext } from 'react';
import { LESSON_ORDER, type ActivityNumber } from './assignment';

export const PresentationNavigation = createContext<{
  onFinish?: (() => void) | undefined; onBack?: (() => void) | undefined; initialLast?: boolean;
  initialStep?: number; controlledStep?: number; readOnly?: boolean; onStep?: (step: number) => void;
  /** Hoạt động 3 reports whether an AI solution is on screen (enables the thank-you picture). */
  onAiAnswer?: (answered: boolean) => void;
}>({});
export function adjacentLessonPart(part: ActivityNumber, direction: -1 | 1): ActivityNumber | undefined {
  return LESSON_ORDER[LESSON_ORDER.indexOf(part) + direction];
}