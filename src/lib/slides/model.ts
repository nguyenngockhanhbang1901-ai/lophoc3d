import { clampBox } from "./boxes";
import { autoOrder, moveInOrder, resetAutomatic, resolveOrder, setAnimMode } from "./animation";
import { DEFAULT_LAYOUT_ID, applyLayout, defaultStyle, restoreLayout } from "./layouts";
import {
  MAX_ACTIVITIES,
  MAX_ELEMENTS_PER_SLIDE,
  MAX_SLIDES_PER_ACTIVITY,
  MAX_TEXT_LENGTH,
  SLIDE_CONTENT_VERSION,
  SLIDE_KEY_PREFIX,
  randomId,
  slideContentSchema,
  slideContentV1Schema,
  type Activity,
  type AnimMode,
  type Box,
  type ElementType,
  type IdFactory,
  type Slide,
  type SlideContent,
  type SlideElement,
} from "./types";

export * from "./types";

/**
 * Pure operations on slide lessons. Each returns a new object, and an operation that would change
 * nothing returns the very same object, so the editor can skip history and saving for it.
 */
export function isSlideLessonKey(key: string): boolean {
  return key.startsWith(SLIDE_KEY_PREFIX);
}
export function newSlideLessonKey(id: IdFactory = randomId): string {
  return `${SLIDE_KEY_PREFIX}${id()}`;
}

function normalize(content: SlideContent): SlideContent {
  return {
    ...content,
    activities: content.activities.map((a) => ({
      ...a,
      slides: a.slides.map((s) => ({
        ...s,
        order: s.order.length ? resolveOrder(s) : autoOrder(s.elements),
      })),
    })),
  };
}
/** Version 1 lessons (no boxes) are placed into the default layout; leftovers cascade as free elements. */
function migrateV1(raw: unknown): SlideContent | null {
  const parsed = slideContentV1Schema.safeParse(raw);
  if (!parsed.success) return null;
  return normalize({
    kind: "slides",
    version: SLIDE_CONTENT_VERSION,
    activities: parsed.data.activities.map((a) => ({
      ...a,
      slides: a.slides.map((s) => {
        const base: Slide = {
          id: s.id,
          layout: s.layout,
          order: s.elements.map((e) => e.id),
          elements: s.elements.map((e) => ({
            id: e.id,
            type: e.type,
            text: e.text,
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            anim: "enter" as const,
            ...defaultStyle(e.type),
          })),
        };
        const placed = applyLayout(base, DEFAULT_LAYOUT_ID, randomId);
        let free = 0;
        return {
          ...placed,
          elements: placed.elements.map((e) =>
            e.slot ? e : { ...e, x: 10 + 2 * free, y: 30 + 3 * free++, w: 50, h: 15 },
          ),
        };
      }),
    })),
  });
}
/** Reads stored JSON; anything that is not slide content (e.g. an old text lesson) gives null. */
export function parseSlideContent(raw: unknown): SlideContent | null {
  const v2 = slideContentSchema.safeParse(raw);
  if (v2.success) return normalize(v2.data);
  return migrateV1(raw);
}

const FREE_BOXES: Record<ElementType, Box> = {
  title: { x: 5, y: 5, w: 90, h: 15 },
  text: { x: 25, y: 40, w: 50, h: 15 },
  image: { x: 30, y: 25, w: 40, h: 50 },
  model3d: { x: 30, y: 25, w: 40, h: 50 },
};
/** A free element (not bound to a layout slot); `offset` cascades several new ones so they do not stack exactly. */
export function newElement(
  type: ElementType,
  text = "",
  id: IdFactory = randomId,
  offset = 0,
): SlideElement {
  const box = FREE_BOXES[type];
  const shift = Math.min(offset, 8) * 3;
  return {
    id: id(),
    type,
    text,
    anim: "enter",
    ...defaultStyle(type),
    ...clampBox({ ...box, x: box.x + shift, y: box.y + shift }),
    ...(type === "image" ? { src: "" } : {}),
  };
}
export function newSlide(layoutId: string = DEFAULT_LAYOUT_ID, id: IdFactory = randomId): Slide {
  return applyLayout({ id: id(), layout: layoutId, elements: [], order: [] }, layoutId, id);
}
export function newActivity(
  title: string,
  id: IdFactory = randomId,
  layoutId: string = DEFAULT_LAYOUT_ID,
): Activity {
  return { id: id(), title, slides: [newSlide(layoutId, id)] };
}
/** A new lesson starts with one activity holding one slide, so the editor never opens empty. */
export function newSlideContent(id: IdFactory = randomId): SlideContent {
  return {
    kind: "slides",
    version: SLIDE_CONTENT_VERSION,
    activities: [newActivity("Hoạt động 1", id)],
  };
}

/** Moves an item; out-of-range or no-op moves return the very same array so callers can skip a save. */
export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** Applies fn to one activity; when fn changes nothing the very same content comes back (a no-op). */
function mapActivity(
  content: SlideContent,
  activityId: string,
  fn: (a: Activity) => Activity,
): SlideContent {
  let changed = false;
  const activities = content.activities.map((a) => {
    if (a.id !== activityId) return a;
    const next = fn(a);
    if (next !== a) changed = true;
    return next;
  });
  return changed ? { ...content, activities } : content;
}
function mapActivityOfSlide(
  content: SlideContent,
  slideId: string,
  fn: (a: Activity) => Activity,
): SlideContent {
  const owner = content.activities.find((a) => a.slides.some((s) => s.id === slideId));
  return owner ? mapActivity(content, owner.id, fn) : content;
}
export function mapSlide(
  content: SlideContent,
  slideId: string,
  fn: (s: Slide) => Slide,
): SlideContent {
  return mapActivityOfSlide(content, slideId, (a) => {
    let changed = false;
    const slides = a.slides.map((s) => {
      if (s.id !== slideId) return s;
      const next = fn(s);
      if (next !== s) changed = true;
      return next;
    });
    return changed ? { ...a, slides } : a;
  });
}

export function addActivity(
  content: SlideContent,
  title?: string,
  id: IdFactory = randomId,
  layoutId: string = DEFAULT_LAYOUT_ID,
): SlideContent {
  if (content.activities.length >= MAX_ACTIVITIES) return content;
  return {
    ...content,
    activities: [
      ...content.activities,
      newActivity(title?.trim() || `Hoạt động ${content.activities.length + 1}`, id, layoutId),
    ],
  };
}
export function renameActivity(
  content: SlideContent,
  activityId: string,
  title: string,
): SlideContent {
  return mapActivity(content, activityId, (a) =>
    a.title === title.slice(0, 150) ? a : { ...a, title: title.slice(0, 150) },
  );
}
export function moveActivity(content: SlideContent, from: number, to: number): SlideContent {
  const activities = moveItem(content.activities, from, to);
  return activities === content.activities ? content : { ...content, activities: [...activities] };
}
/** The last activity cannot be deleted: a lesson always keeps somewhere to put a slide. */
export function deleteActivity(content: SlideContent, activityId: string): SlideContent {
  if (content.activities.length <= 1 || !content.activities.some((a) => a.id === activityId))
    return content;
  return { ...content, activities: content.activities.filter((a) => a.id !== activityId) };
}

export function addSlide(
  content: SlideContent,
  activityId: string,
  layoutId: string = DEFAULT_LAYOUT_ID,
  id: IdFactory = randomId,
): SlideContent {
  return mapActivity(content, activityId, (a) =>
    a.slides.length >= MAX_SLIDES_PER_ACTIVITY
      ? a
      : { ...a, slides: [...a.slides, newSlide(layoutId, id)] },
  );
}
/** The copy gets fresh ids for itself and its elements and sits right after the original. */
export function duplicateSlide(
  content: SlideContent,
  slideId: string,
  id: IdFactory = randomId,
): SlideContent {
  return mapActivityOfSlide(content, slideId, (a) => {
    if (a.slides.length >= MAX_SLIDES_PER_ACTIVITY) return a;
    const index = a.slides.findIndex((s) => s.id === slideId);
    const original = a.slides[index] as Slide;
    const renamed = new Map(original.elements.map((e) => [e.id, id()]));
    const copy: Slide = {
      ...original,
      id: id(),
      elements: original.elements.map((e) => ({ ...e, id: renamed.get(e.id) as string })),
      order: original.order.map((i) => renamed.get(i)).filter((i): i is string => Boolean(i)),
    };
    return { ...a, slides: [...a.slides.slice(0, index + 1), copy, ...a.slides.slice(index + 1)] };
  });
}
/** The last slide of an activity cannot be deleted, for the same reason as activities. */
export function deleteSlide(content: SlideContent, slideId: string): SlideContent {
  return mapActivityOfSlide(content, slideId, (a) =>
    a.slides.length > 1 ? { ...a, slides: a.slides.filter((s) => s.id !== slideId) } : a,
  );
}
export function moveSlide(
  content: SlideContent,
  activityId: string,
  from: number,
  to: number,
): SlideContent {
  return mapActivity(content, activityId, (a) => {
    const slides = moveItem(a.slides, from, to);
    return slides === a.slides ? a : { ...a, slides: [...slides] };
  });
}

export type ElementPatch = Partial<
  Pick<
    SlideElement,
    | "text"
    | "fontSize"
    | "fit"
    | "bold"
    | "italic"
    | "color"
    | "align"
    | "custom"
    | "src"
    | "alt"
    | "modelId"
    | "type"
  >
>;

/** New elements are free (not bound to a layout slot) and join the end of the appearance order. */
export function addElement(
  content: SlideContent,
  slideId: string,
  type: ElementType,
  id: IdFactory = randomId,
): SlideContent {
  return mapSlide(content, slideId, (s) => {
    if (s.elements.length >= MAX_ELEMENTS_PER_SLIDE) return s;
    const el = newElement(type, "", id, s.elements.filter((e) => !e.slot).length);
    return { ...s, elements: [...s.elements, el], order: [...resolveOrder(s), el.id] };
  });
}
function mapElement(
  content: SlideContent,
  slideId: string,
  elementId: string,
  fn: (e: SlideElement) => SlideElement,
): SlideContent {
  return mapSlide(content, slideId, (s) => {
    let changed = false;
    const elements = s.elements.map((e) => {
      if (e.id !== elementId) return e;
      const next = fn(e);
      if (next !== e) changed = true;
      return next;
    });
    return changed ? { ...s, elements } : s;
  });
}
export function updateElement(
  content: SlideContent,
  slideId: string,
  elementId: string,
  patch: ElementPatch,
): SlideContent {
  return mapElement(content, slideId, elementId, (e) => {
    const next: ElementPatch = { ...patch };
    if (typeof next.text === "string") next.text = next.text.slice(0, MAX_TEXT_LENGTH);
    const changed = (Object.keys(next) as (keyof ElementPatch)[]).some((k) => e[k] !== next[k]);
    return changed ? { ...e, ...next } : e;
  });
}
export function updateElementText(
  content: SlideContent,
  slideId: string,
  elementId: string,
  text: string,
): SlideContent {
  return updateElement(content, slideId, elementId, { text });
}
/** Sets an element's box (clamped to the slide). `custom` marks a slot element the teacher agreed to move off its layout. */
export function setElementBox(
  content: SlideContent,
  slideId: string,
  elementId: string,
  box: Box,
  custom?: boolean,
): SlideContent {
  return mapElement(content, slideId, elementId, (e) => {
    const next = clampBox(box);
    const same = e.x === next.x && e.y === next.y && e.w === next.w && e.h === next.h;
    const flag = custom === undefined ? e.custom : custom || undefined;
    if (same && flag === e.custom) return e;
    const { custom: _drop, ...rest } = e;
    void _drop;
    return { ...rest, ...next, ...(flag ? { custom: true } : {}) };
  });
}
export function deleteElement(
  content: SlideContent,
  slideId: string,
  elementId: string,
): SlideContent {
  return mapSlide(content, slideId, (s) =>
    s.elements.some((e) => e.id === elementId)
      ? {
          ...s,
          elements: s.elements.filter((e) => e.id !== elementId),
          order: s.order.filter((i) => i !== elementId),
        }
      : s,
  );
}
/** The copy is a free element, slightly offset, at the end of the order. */
export function duplicateElement(
  content: SlideContent,
  slideId: string,
  elementId: string,
  id: IdFactory = randomId,
): SlideContent {
  return mapSlide(content, slideId, (s) => {
    const original = s.elements.find((e) => e.id === elementId);
    if (!original || s.elements.length >= MAX_ELEMENTS_PER_SLIDE) return s;
    const { slot: _slot, custom: _custom, ...rest } = original;
    void _slot;
    void _custom;
    const copy: SlideElement = {
      ...rest,
      id: id(),
      ...clampBox({ ...original, x: original.x + 3, y: original.y + 4 }),
    };
    return { ...s, elements: [...s.elements, copy], order: [...resolveOrder(s), copy.id] };
  });
}
/** Drawing order (z-index): front = last in the list. */
export function reorderElement(
  content: SlideContent,
  slideId: string,
  elementId: string,
  to: "front" | "back",
): SlideContent {
  return mapSlide(content, slideId, (s) => {
    const index = s.elements.findIndex((e) => e.id === elementId);
    if (index < 0) return s;
    const target = to === "front" ? s.elements.length - 1 : 0;
    if (index === target) return s;
    return { ...s, elements: [...moveItem(s.elements, index, target)] };
  });
}

export function setSlideLayout(
  content: SlideContent,
  slideId: string,
  layoutId: string,
  id: IdFactory = randomId,
): SlideContent {
  return mapSlide(content, slideId, (s) =>
    s.layout === layoutId ? s : applyLayout(s, layoutId, id),
  );
}
export function restoreSlideLayout(
  content: SlideContent,
  slideId: string,
  id: IdFactory = randomId,
): SlideContent {
  return mapSlide(content, slideId, (s) => {
    const next = restoreLayout(s, id);
    return JSON.stringify(next) === JSON.stringify(s) ? s : next;
  });
}
export function setElementAnim(
  content: SlideContent,
  slideId: string,
  elementId: string,
  mode: AnimMode,
): SlideContent {
  return mapSlide(content, slideId, (s) => setAnimMode(s, elementId, mode));
}
export function moveElementInOrder(
  content: SlideContent,
  slideId: string,
  from: number,
  to: number,
): SlideContent {
  return mapSlide(content, slideId, (s) => moveInOrder(s, from, to));
}
export function resetSlideAnimation(content: SlideContent, slideId: string): SlideContent {
  return mapSlide(content, slideId, (s) => {
    const next = resetAutomatic(s);
    return JSON.stringify(next) === JSON.stringify(s) ? s : next;
  });
}

export function findSlide(
  content: SlideContent,
  slideId: string,
): { activity: Activity; slide: Slide; index: number } | null {
  for (const activity of content.activities) {
    const index = activity.slides.findIndex((s) => s.id === slideId);
    if (index >= 0) return { activity, slide: activity.slides[index] as Slide, index };
  }
  return null;
}
export function firstSlideId(content: SlideContent): string | null {
  return content.activities.find((a) => a.slides.length)?.slides[0]?.id ?? null;
}
export function countSlides(content: SlideContent): number {
  return content.activities.reduce((total, a) => total + a.slides.length, 0);
}
export function allSlides(content: SlideContent): Slide[] {
  return content.activities.flatMap((a) => a.slides);
}

/** Replaces one element with an already-computed version (from the stage or the fitter). */
export function replaceElement(
  content: SlideContent,
  slideId: string,
  next: SlideElement,
): SlideContent {
  return mapSlide(content, slideId, (s) => {
    const i = s.elements.findIndex((e) => e.id === next.id);
    if (i < 0 || JSON.stringify(s.elements[i]) === JSON.stringify(next)) return s;
    const elements = [...s.elements];
    elements[i] = { ...next, ...clampBox(next) };
    return { ...s, elements };
  });
}
/** Applies a slide-wide function (layout re-fit) as one change. */
export function updateSlide(
  content: SlideContent,
  slideId: string,
  fn: (s: Slide) => Slide,
): SlideContent {
  return mapSlide(content, slideId, fn);
}
