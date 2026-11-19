import { createContext } from 'react';
import { LESSON_ORDER, type ActivityNumber } from './assignment';

export const PresentationNavigation = createContext<{
  onFinish?: (() => void) | undefined; onBack?: (() => void) | undefined; initialLast?: boolean;
  initialStep?: number; controlledStep?: number; readOnly?: boolean; onStep?: (step: number) => void;
  /** The teacher's open class: AI solutions for it are saved and reused when Gemini fails or is slow. */
  aiRoomId?: string | undefined;
}>({});
export function adjacentLessonPart(part: ActivityNumber, direction: -1 | 1): ActivityNumber | undefined {
  return LESSON_ORDER[LESSON_ORDER.indexOf(part) + direction];
}/** Where to scroll when a new lesson part opens: its first slide must start on screen, never mid-page. Full screen goes to the very top; otherwise only scroll back up when the page sits below the part's start. */
export function arrivalScrollTop(scrollY: number, partTop: number, fullscreen: boolean): number | null {
  const target = fullscreen ? 0 : Math.max(0, Math.round(partTop));
  return scrollY > target ? target : null;
}
