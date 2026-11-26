import { insideBox, slotOf } from "./layouts";
import type { Slide, SlideElement } from "./types";

/**
 * Text fitting and the "nội dung vượt khung" check. Pure: the measuring itself is passed in
 * (the editor measures in a hidden box in the page, the tests use a fake).
 *
 * `Measure` returns the height the element's text needs, in percent of the slide height, at the
 * element's own width, font size and fit factor.
 */
export type Measure = (el: SlideElement) => number;
export const MIN_FIT = 0.6;
const FITS = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, MIN_FIT];
const SLACK = 0.3;

export const isTextElement = (el: Pick<SlideElement, "type">) =>
  el.type === "title" || el.type === "text";

function withFit(el: SlideElement, fit: number): SlideElement {
  const { fit: _old, ...rest } = el;
  void _old;
  return fit >= 1 ? rest : { ...rest, fit };
}

export type FitResult = {
  /** The element as it should be saved (fit factor, and for a free box its grown height). */
  el: SlideElement;
  /** True when a layout slot element no longer fits its slot: the editor asks before keeping it. */
  overflow: boolean;
};

/**
 * - an element the teacher already let out of the layout (`custom`): kept as is, text at full size;
 * - a free text box: text at full size, the box grows down to fit (like PowerPoint);
 * - a layout slot: the text shrinks (down to MIN_FIT) to stay inside; if it still does not fit,
 *   or the box was moved or resized out of the slot, `overflow` is true.
 */
export function fitElement(slide: Slide, el: SlideElement, measure: Measure): FitResult {
  if (el.custom) return { el: withFit(el, 1), overflow: false };
  const slot = slotOf(slide.layout, el.slot);
  if (!slot) {
    if (!isTextElement(el)) return { el, overflow: false };
    const plain = withFit(el, 1);
    const need = measure(plain);
    if (need <= el.h + SLACK) return { el: plain, overflow: false };
    const h = Math.round(Math.min(100 - el.y, need + 0.5) * 100) / 100;
    return { el: { ...plain, h }, overflow: false };
  }
  const outside = !insideBox(el, slot.box);
  if (!isTextElement(el)) return { el, overflow: outside };
  for (const f of FITS) {
    const candidate = withFit(el, f);
    if (measure(candidate) <= el.h + SLACK) return { el: candidate, overflow: outside };
  }
  return { el: withFit(el, MIN_FIT), overflow: true };
}

/** Marks an element as out of its layout on purpose: text back to full size, free to overflow. */
export function markCustom(el: SlideElement): SlideElement {
  return { ...withFit(el, 1), custom: true };
}

/** Re-fits every text element of a slide after a layout change; nothing is asked. */
export function refitSlide(slide: Slide, measure: Measure): Slide {
  let changed = false;
  const elements = slide.elements.map((e) => {
    if (!isTextElement(e)) return e;
    const next = fitElement(slide, e, measure).el;
    if (JSON.stringify(next) === JSON.stringify(e)) return e;
    changed = true;
    return next;
  });
  return changed ? { ...slide, elements } : slide;
}
