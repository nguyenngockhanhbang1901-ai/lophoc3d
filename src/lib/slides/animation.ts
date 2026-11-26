import type { AnimMode, Slide, SlideContent, SlideElement } from "./types";

/**
 * Appearance order. A slide is a list of steps: step 0 is what is already on screen when the
 * slide opens; each Enter shows the next step. An element's mode decides its step:
 *   enter     – "Khi nhấn Enter": starts a new step
 *   with      – "Cùng lúc với phần tử trước": same step as the element before it
 *   immediate – "Hiện ngay": step 0
 * Everything here is pure, so the editor preview, the lesson viewer and the tests share it.
 */

const ROW_TOLERANCE = 4; // percent of slide height: elements this close in y count as one row

/** Automatic order: titles first, then top to bottom, left to right. */
export function autoOrder(elements: readonly SlideElement[]): string[] {
  const rank = (e: SlideElement) => (e.type === "title" ? 0 : 1);
  return [...elements]
    .sort(
      (a, b) => rank(a) - rank(b) || (Math.abs(a.y - b.y) > ROW_TOLERANCE ? a.y - b.y : a.x - b.x),
    )
    .map((e) => e.id);
}

/** The slide's order made safe: unknown ids dropped, missing elements appended at the end. */
export function resolveOrder(slide: Slide): string[] {
  const known = new Set(slide.elements.map((e) => e.id));
  const seen = new Set<string>();
  const order = slide.order.filter((id) => known.has(id) && !seen.has(id) && seen.add(id));
  return [...order, ...slide.elements.filter((e) => !seen.has(e.id)).map((e) => e.id)];
}

export type AppearanceStep = { step: number; id: string; mode: AnimMode };
export function appearances(slide: Slide): AppearanceStep[] {
  const byId = new Map(slide.elements.map((e) => [e.id, e]));
  let step = 0;
  let previous = 0;
  const out: AppearanceStep[] = [];
  for (const id of resolveOrder(slide)) {
    const el = byId.get(id) as SlideElement;
    const mode = el.anim;
    const at = mode === "immediate" ? 0 : mode === "with" ? previous : ++step;
    previous = at;
    out.push({ step: at, id, mode });
  }
  return out;
}
/** Number of Enter presses a slide needs to show everything. */
export function stepCount(slide: Slide): number {
  return appearances(slide).reduce((max, a) => Math.max(max, a.step), 0);
}
/** Ids on screen once `step` Enters have been pressed. */
export function visibleIds(slide: Slide, step: number): Set<string> {
  return new Set(
    appearances(slide)
      .filter((a) => a.step <= step)
      .map((a) => a.id),
  );
}
/** Step at which an element appears (0 when it is not in the list). */
export function stepOf(slide: Slide, elementId: string): number {
  return appearances(slide).find((a) => a.id === elementId)?.step ?? 0;
}

export type TimelineState = {
  slideIndex: number;
  slideId: string;
  activityIndex: number;
  step: number;
  steps: number;
};
/**
 * Every state a lesson goes through, in order: for each slide, step 0 … step n. Enter walks one
 * state forward and Backspace one back, so going back from a slide's first state lands on the
 * previous slide fully shown.
 */
export function lessonTimeline(content: SlideContent): TimelineState[] {
  const out: TimelineState[] = [];
  let slideIndex = 0;
  content.activities.forEach((activity, activityIndex) => {
    for (const slide of activity.slides) {
      const steps = stepCount(slide);
      for (let step = 0; step <= steps; step++)
        out.push({ slideIndex, slideId: slide.id, activityIndex, step, steps });
      slideIndex += 1;
    }
  });
  return out;
}

/** Same slide with its order recalculated and every mode back to "Khi nhấn Enter". */
export function resetAutomatic(slide: Slide): Slide {
  return {
    ...slide,
    elements: slide.elements.map((e) =>
      e.anim === "enter" ? e : { ...e, anim: "enter" as const },
    ),
    order: autoOrder(slide.elements),
  };
}
export function setAnimMode(slide: Slide, elementId: string, mode: AnimMode): Slide {
  if (!slide.elements.some((e) => e.id === elementId && e.anim !== mode)) return slide;
  return {
    ...slide,
    elements: slide.elements.map((e) => (e.id === elementId ? { ...e, anim: mode } : e)),
  };
}
export function moveInOrder(slide: Slide, from: number, to: number): Slide {
  const order = resolveOrder(slide);
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return slide;
  const next = [...order];
  const [id] = next.splice(from, 1);
  next.splice(to, 0, id as string);
  return { ...slide, order: next };
}
