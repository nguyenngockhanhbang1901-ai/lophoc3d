import { describe, expect, it } from "vitest";
import {
  addElement,
  deleteElement,
  duplicateElement,
  duplicateSlide,
  findSlide,
  moveElementInOrder,
  newSlideContent,
  parseSlideContent,
  reorderElement,
  resetSlideAnimation,
  setElementAnim,
  setElementBox,
  updateElement,
  type SlideContent,
} from "./model";

function counter() {
  let n = 0;
  return () => `id${++n}`;
}
const slideOf = (c: SlideContent) => c.activities[0]!.slides[0]!;

describe("lessons saved by phase 1–2 (version 1) still open", () => {
  const v1 = {
    kind: "slides",
    version: 1,
    activities: [
      {
        id: "a",
        title: "Hoạt động 1",
        slides: [
          {
            id: "s",
            layout: "title-content",
            elements: [
              { id: "t", type: "title", text: "Tiêu đề cũ" },
              { id: "x", type: "text", text: "Nội dung cũ $x^2$" },
            ],
          },
        ],
      },
    ],
  };
  it("is moved into the default layout with the same text", () => {
    const c = parseSlideContent(v1)!;
    expect(c.version).toBe(2);
    const s = slideOf(c);
    expect(s.elements.map((e) => [e.id, e.text, e.x, e.y, e.w, e.h])).toEqual([
      ["t", "Tiêu đề cũ", 5, 5, 90, 15],
      ["x", "Nội dung cũ $x^2$", 5, 25, 90, 65],
    ]);
    expect(s.order).toEqual(["t", "x"]);
  });
  it("extra elements of version 1 are not lost", () => {
    const c = parseSlideContent({
      ...v1,
      activities: [
        {
          ...v1.activities[0]!,
          slides: [
            {
              ...v1.activities[0]!.slides[0]!,
              elements: [
                ...v1.activities[0]!.slides[0]!.elements,
                { id: "y", type: "text", text: "thêm" },
              ],
            },
          ],
        },
      ],
    })!;
    expect(slideOf(c).elements.map((e) => e.text)).toContain("thêm");
    expect(slideOf(c).elements).toHaveLength(3);
  });
  it("still refuses text lessons and junk", () => {
    expect(parseSlideContent({ text: "x" })).toBeNull();
    expect(parseSlideContent({ ...v1, version: 3 })).toBeNull();
  });
  it("fills a missing order for hand-written version 2 data", () => {
    const c = newSlideContent(counter());
    const stripped = JSON.parse(JSON.stringify(c));
    delete stripped.activities[0].slides[0].order;
    expect(slideOf(parseSlideContent(stripped)!).order).toHaveLength(2);
  });
});

describe("element operations", () => {
  it("a new element is free and joins the end of the appearance order", () => {
    const id = counter();
    let c = newSlideContent(id);
    const s0 = slideOf(c);
    c = addElement(c, s0.id, "image", id);
    const s = slideOf(c);
    const added = s.elements[2]!;
    expect(added).toMatchObject({ type: "image", anim: "enter", src: "" });
    expect(added.slot).toBeUndefined();
    expect(s.order[s.order.length - 1]).toBe(added.id);
  });
  it("model3d and text are added the same way", () => {
    const id = counter();
    let c = newSlideContent(id);
    c = addElement(c, slideOf(c).id, "model3d", id);
    c = addElement(c, slideOf(c).id, "text", id);
    expect(slideOf(c).elements.map((e) => e.type)).toEqual(["title", "text", "model3d", "text"]);
  });
  it("setElementBox clamps and only marks custom when told to", () => {
    const id = counter();
    let c = newSlideContent(id);
    const s = slideOf(c),
      t = s.elements[0]!;
    c = setElementBox(c, s.id, t.id, { x: 99, y: 99, w: 30, h: 30 });
    expect(slideOf(c).elements[0]).toMatchObject({ x: 70, y: 70, w: 30, h: 30 });
    expect(slideOf(c).elements[0]!.custom).toBeUndefined();
    const marked = setElementBox(c, s.id, t.id, { x: 10, y: 10, w: 30, h: 30 }, true);
    expect(slideOf(marked).elements[0]!.custom).toBe(true);
    expect(setElementBox(marked, s.id, t.id, { x: 10, y: 10, w: 30, h: 30 })).toBe(marked);
    expect(
      setElementBox(marked, s.id, t.id, { x: 10, y: 10, w: 30, h: 30 }, false).activities[0]!
        .slides[0]!.elements[0]!.custom,
    ).toBeUndefined();
  });
  it("update, delete and duplicate", () => {
    const id = counter();
    let c = newSlideContent(id);
    const s = slideOf(c),
      t = s.elements[0]!;
    c = updateElement(c, s.id, t.id, {
      fontSize: 60,
      bold: false,
      italic: true,
      color: "#ff0000",
      align: "center",
    });
    expect(slideOf(c).elements[0]).toMatchObject({
      fontSize: 60,
      bold: false,
      italic: true,
      color: "#ff0000",
      align: "center",
    });
    expect(updateElement(c, s.id, t.id, { fontSize: 60 })).toBe(c);
    c = duplicateElement(c, s.id, t.id, id);
    const copy = slideOf(c).elements[2]!;
    expect(copy).toMatchObject({ type: "title", fontSize: 60, x: 8, y: 9 });
    expect(copy.slot).toBeUndefined();
    expect(copy.id).not.toBe(t.id);
    expect(slideOf(c).order.at(-1)).toBe(copy.id);
    c = deleteElement(c, s.id, copy.id);
    expect(slideOf(c).elements).toHaveLength(2);
    expect(slideOf(c).order).not.toContain(copy.id);
    expect(deleteElement(c, s.id, "nope")).toBe(c);
  });
  it("front and back change only the drawing order, not the appearance order", () => {
    const id = counter();
    let c = newSlideContent(id);
    const s = slideOf(c);
    const [a, b] = s.elements as [(typeof s.elements)[number], (typeof s.elements)[number]];
    c = reorderElement(c, s.id, a.id, "front");
    expect(slideOf(c).elements.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(slideOf(c).order).toEqual([a.id, b.id]);
    c = reorderElement(c, s.id, a.id, "back");
    expect(slideOf(c).elements.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(reorderElement(c, s.id, a.id, "back")).toBe(c);
  });
  it("animation edits go through the slide", () => {
    const id = counter();
    let c = newSlideContent(id);
    const s = slideOf(c);
    c = setElementAnim(c, s.id, s.elements[1]!.id, "with");
    c = moveElementInOrder(c, s.id, 1, 0);
    expect(slideOf(c).order).toEqual([s.elements[1]!.id, s.elements[0]!.id]);
    c = resetSlideAnimation(c, s.id);
    expect(slideOf(c).order).toEqual([s.elements[0]!.id, s.elements[1]!.id]);
    expect(slideOf(c).elements.every((e) => e.anim === "enter")).toBe(true);
    expect(resetSlideAnimation(c, s.id)).toBe(c);
  });
  it("a duplicated slide keeps its appearance order under the new element ids", () => {
    const id = counter();
    let c = newSlideContent(id);
    const s = slideOf(c);
    c = moveElementInOrder(c, s.id, 1, 0);
    c = duplicateSlide(c, s.id, id);
    const [orig, copy] = c.activities[0]!.slides as [typeof s, typeof s];
    expect(copy.order).toHaveLength(2);
    expect(copy.order.every((i) => copy.elements.some((e) => e.id === i))).toBe(true);
    expect(copy.order.map((i) => copy.elements.find((e) => e.id === i)!.type)).toEqual(
      orig.order.map((i) => orig.elements.find((e) => e.id === i)!.type),
    );
    expect(findSlide(c, copy.id)).not.toBeNull();
  });
});
