import { describe, expect, it } from "vitest";
import { LAYOUTS, applyLayout, getLayout, insideBox, restoreLayout } from "./layouts";
import {
  addElement,
  newSlide,
  setElementBox,
  setSlideLayout,
  updateElementText,
  newSlideContent,
  restoreSlideLayout,
  findSlide,
} from "./model";

function counter() {
  let n = 0;
  return () => `id${++n}`;
}
const boxOf = (
  s: { elements: { slot?: string | undefined; x: number; y: number; w: number; h: number }[] },
  slot: string,
) => {
  const e = s.elements.find((x) => x.slot === slot)!;
  return [e.x, e.y, e.w, e.h];
};

describe("layouts as data", () => {
  it("has the seven layouts with the exact boxes from the plan", () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual([
      "cover",
      "title-content",
      "two-columns",
      "text-media",
      "media-caption",
      "two-media",
      "blank",
    ]);
    const box = (layout: string, slot: string) => {
      const b = getLayout(layout).slots.find((s) => s.id === slot)!.box;
      return [b.x, b.y, b.w, b.h];
    };
    expect(box("cover", "title")).toEqual([10, 30, 80, 20]);
    expect(box("cover", "subtitle")).toEqual([10, 55, 80, 15]);
    expect(box("title-content", "title")).toEqual([5, 5, 90, 15]);
    expect(box("title-content", "content")).toEqual([5, 25, 90, 65]);
    expect(box("two-columns", "left")).toEqual([5, 25, 43, 65]);
    expect(box("two-columns", "right")).toEqual([52, 25, 43, 65]);
    expect(box("text-media", "text")).toEqual([5, 25, 43, 65]);
    expect(box("text-media", "media")).toEqual([52, 25, 43, 65]);
    expect(box("media-caption", "media")).toEqual([10, 22, 80, 55]);
    expect(box("media-caption", "caption")).toEqual([10, 80, 80, 12]);
    expect(box("two-media", "media1")).toEqual([5, 25, 43, 65]);
    expect(box("two-media", "media2")).toEqual([52, 25, 43, 65]);
    expect(getLayout("blank").slots).toEqual([]);
  });

  it("every slot lies inside the slide", () => {
    for (const l of LAYOUTS)
      for (const s of l.slots)
        expect(insideBox(s.box, { x: 0, y: 0, w: 100, h: 100 }, 0)).toBe(true);
  });

  it("a new slide uses the default layout: a title and a content element in their boxes", () => {
    const s = newSlide(undefined, counter());
    expect(s.layout).toBe("title-content");
    expect(s.elements.map((e) => e.type)).toEqual(["title", "text"]);
    expect(boxOf(s, "title")).toEqual([5, 5, 90, 15]);
    expect(boxOf(s, "content")).toEqual([5, 25, 90, 65]);
    expect(s.order).toEqual(s.elements.map((e) => e.id));
  });

  it("changing layout keeps all text and moves it into the matching slots", () => {
    const id = counter();
    let c = newSlideContent(id);
    const slide = c.activities[0]!.slides[0]!;
    c = updateElementText(c, slide.id, slide.elements[0]!.id, "Tiêu đề");
    c = updateElementText(c, slide.id, slide.elements[1]!.id, "Nội dung chính");
    c = setSlideLayout(c, slide.id, "two-columns", id);
    const s = findSlide(c, slide.id)!.slide;
    expect(s.layout).toBe("two-columns");
    expect(s.elements.find((e) => e.slot === "title")?.text).toBe("Tiêu đề");
    expect(s.elements.find((e) => e.slot === "left")?.text).toBe("Nội dung chính");
    expect(s.elements.find((e) => e.slot === "right")?.text).toBe("");
    expect(boxOf(s, "left")).toEqual([5, 25, 43, 65]);
    c = setSlideLayout(c, slide.id, "text-media", id);
    const m = findSlide(c, slide.id)!.slide;
    expect(m.elements.find((e) => e.slot === "text")?.text).toBe("Nội dung chính");
    expect(m.elements.find((e) => e.slot === "media")?.type).toBe("image");
    // the old right column (empty text) has nowhere to go but stays as a free element: nothing is lost
    expect(m.elements.some((e) => e.type === "text" && !e.slot)).toBe(true);
  });

  it("extra elements of one kind stay as free elements and keep their text", () => {
    const id = counter();
    let c = newSlideContent(id);
    const slide = c.activities[0]!.slides[0]!;
    c = addElement(c, slide.id, "text", id);
    const extra = findSlide(c, slide.id)!.slide.elements[2]!;
    c = updateElementText(c, slide.id, extra.id, "ghi chú thêm");
    c = setSlideLayout(c, slide.id, "cover", id);
    const s = findSlide(c, slide.id)!.slide;
    expect(s.elements.map((e) => e.text)).toContain("ghi chú thêm");
    expect(s.elements.filter((e) => e.slot)).toHaveLength(2);
  });

  it("the blank layout frees every element and keeps where it is", () => {
    const id = counter();
    let c = newSlideContent(id);
    const slide = c.activities[0]!.slides[0]!;
    c = setSlideLayout(c, slide.id, "blank", id);
    const s = findSlide(c, slide.id)!.slide;
    expect(s.layout).toBe("blank");
    expect(s.elements.every((e) => !e.slot)).toBe(true);
    expect(boxOf({ elements: s.elements.map((e) => ({ ...e, slot: "x" })) }, "x")).toEqual([
      5, 5, 90, 15,
    ]);
  });

  it("restore puts slot elements back and clears the custom mark, and re-creates deleted placeholders", () => {
    const id = counter();
    let c = newSlideContent(id);
    const slide = c.activities[0]!.slides[0]!;
    const title = slide.elements[0]!;
    c = setElementBox(c, slide.id, title.id, { x: 20, y: 40, w: 30, h: 10 }, true);
    expect(findSlide(c, slide.id)!.slide.elements[0]!.custom).toBe(true);
    expect(restoreSlideLayout(newSlideContent(id), "nope")).toBeTruthy();
    c = restoreSlideLayout(c, slide.id, id);
    const s = findSlide(c, slide.id)!.slide;
    expect(boxOf(s, "title")).toEqual([5, 5, 90, 15]);
    expect(s.elements[0]!.custom).toBeUndefined();
    const gone = restoreLayout(
      { ...s, elements: s.elements.slice(1), order: s.order.slice(1) },
      id,
    );
    expect(gone.elements.some((e) => e.slot === "title")).toBe(true);
  });

  it("applyLayout of the same layout is stable and idempotent", () => {
    const s = newSlide("two-columns", counter());
    const again = applyLayout(s, "two-columns", counter());
    expect(again.elements.map((e) => [e.slot, e.x, e.y, e.w, e.h])).toEqual(
      s.elements.map((e) => [e.slot, e.x, e.y, e.w, e.h]),
    );
  });

  it("insideBox tolerates tiny rounding but not a real move", () => {
    const slot = { x: 5, y: 25, w: 43, h: 65 };
    expect(insideBox({ x: 5.1, y: 25, w: 43, h: 65 }, slot)).toBe(true);
    expect(insideBox({ x: 6, y: 26, w: 30, h: 40 }, slot)).toBe(true);
    expect(insideBox({ x: 8, y: 25, w: 43, h: 65 }, slot)).toBe(false);
    expect(insideBox({ x: 5, y: 25, w: 43, h: 70 }, slot)).toBe(false);
  });
});
