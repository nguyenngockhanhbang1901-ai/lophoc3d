import { z } from "zod";

/**
 * Slide lesson data. Stored as JSON in the existing `lessons.content` column, so no schema change:
 * Bài học (a lessons row) → Hoạt động → Slide → Phần tử. Every operation below is pure and returns
 * a new object, so the editor can undo and tests never need a browser.
 */
export const SLIDE_CONTENT_VERSION = 1;
export const SLIDE_KEY_PREFIX = "slides:";
export const MAX_ACTIVITIES = 50;
export const MAX_SLIDES_PER_ACTIVITY = 100;
export const MAX_ELEMENTS_PER_SLIDE = 30;
export const MAX_TEXT_LENGTH = 5000;

export const ELEMENT_TYPES = ["title", "text"] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

const elementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ELEMENT_TYPES),
  text: z.string().max(MAX_TEXT_LENGTH),
});
const slideSchema = z.object({
  id: z.string().min(1),
  layout: z.string().min(1).default("title-content"),
  elements: z.array(elementSchema).max(MAX_ELEMENTS_PER_SLIDE),
});
const activitySchema = z.object({
  id: z.string().min(1),
  title: z.string().max(150),
  slides: z.array(slideSchema).max(MAX_SLIDES_PER_ACTIVITY),
});
export const slideContentSchema = z.object({
  kind: z.literal("slides"),
  version: z.literal(SLIDE_CONTENT_VERSION),
  activities: z.array(activitySchema).max(MAX_ACTIVITIES),
});

export type SlideElement = z.infer<typeof elementSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type SlideContent = z.infer<typeof slideContentSchema>;

export type IdFactory = () => string;
export const randomId: IdFactory = () => crypto.randomUUID();

export function isSlideLessonKey(key: string): boolean {
  return key.startsWith(SLIDE_KEY_PREFIX);
}
export function newSlideLessonKey(id: IdFactory = randomId): string {
  return `${SLIDE_KEY_PREFIX}${id()}`;
}

/** Reads stored JSON; anything that is not valid slide content (e.g. an old text lesson) gives null. */
export function parseSlideContent(raw: unknown): SlideContent | null {
  const result = slideContentSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function newElement(type: ElementType, text = "", id: IdFactory = randomId): SlideElement {
  return { id: id(), type, text };
}
export function newSlide(id: IdFactory = randomId): Slide {
  return {
    id: id(),
    layout: "title-content",
    elements: [newElement("title", "", id), newElement("text", "", id)],
  };
}
export function newActivity(title: string, id: IdFactory = randomId): Activity {
  return { id: id(), title, slides: [newSlide(id)] };
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
/** Applies fn to the activity holding the slide, with the same no-op rule. */
function mapActivityOfSlide(
  content: SlideContent,
  slideId: string,
  fn: (a: Activity) => Activity,
): SlideContent {
  const owner = content.activities.find((a) => a.slides.some((s) => s.id === slideId));
  return owner ? mapActivity(content, owner.id, fn) : content;
}
function mapSlide(content: SlideContent, slideId: string, fn: (s: Slide) => Slide): SlideContent {
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
): SlideContent {
  if (content.activities.length >= MAX_ACTIVITIES) return content;
  return {
    ...content,
    activities: [
      ...content.activities,
      newActivity(title?.trim() || `Hoạt động ${content.activities.length + 1}`, id),
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
  if (content.activities.length <= 1) return content;
  return { ...content, activities: content.activities.filter((a) => a.id !== activityId) };
}

export function addSlide(
  content: SlideContent,
  activityId: string,
  id: IdFactory = randomId,
): SlideContent {
  return mapActivity(content, activityId, (a) =>
    a.slides.length >= MAX_SLIDES_PER_ACTIVITY ? a : { ...a, slides: [...a.slides, newSlide(id)] },
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
    const copy: Slide = {
      ...original,
      id: id(),
      elements: original.elements.map((e) => ({ ...e, id: id() })),
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

export function addElement(
  content: SlideContent,
  slideId: string,
  type: ElementType,
  id: IdFactory = randomId,
): SlideContent {
  return mapSlide(content, slideId, (s) =>
    s.elements.length >= MAX_ELEMENTS_PER_SLIDE
      ? s
      : { ...s, elements: [...s.elements, newElement(type, "", id)] },
  );
}
export function updateElementText(
  content: SlideContent,
  slideId: string,
  elementId: string,
  text: string,
): SlideContent {
  return mapSlide(content, slideId, (s) => {
    const clipped = text.slice(0, MAX_TEXT_LENGTH);
    return s.elements.some((e) => e.id === elementId && e.text !== clipped)
      ? {
          ...s,
          elements: s.elements.map((e) => (e.id === elementId ? { ...e, text: clipped } : e)),
        }
      : s;
  });
}
export function deleteElement(
  content: SlideContent,
  slideId: string,
  elementId: string,
): SlideContent {
  return mapSlide(content, slideId, (s) =>
    s.elements.some((e) => e.id === elementId)
      ? { ...s, elements: s.elements.filter((e) => e.id !== elementId) }
      : s,
  );
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
