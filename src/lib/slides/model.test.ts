import { describe, expect, it } from "vitest";
import {
  MAX_SLIDES_PER_ACTIVITY,
  addActivity,
  addElement,
  addSlide,
  countSlides,
  deleteActivity,
  deleteElement,
  deleteSlide,
  duplicateSlide,
  findSlide,
  firstSlideId,
  isSlideLessonKey,
  moveActivity,
  moveItem,
  moveSlide,
  newSlideContent,
  newSlideLessonKey,
  parseSlideContent,
  renameActivity,
  updateElementText,
} from "./model";

function counter() {
  let n = 0;
  return () => `id${++n}`;
}

describe("slide lesson data", () => {
  it("starts with one activity holding one slide with a title and a text element", () => {
    const c = newSlideContent(counter());
    expect(c.activities).toHaveLength(1);
    expect(c.activities[0]?.title).toBe("Hoạt động 1");
    expect(c.activities[0]?.slides[0]?.elements.map((e) => e.type)).toEqual(["title", "text"]);
  });

  it("round-trips through JSON and rejects anything that is not slide content", () => {
    const c = newSlideContent(counter());
    expect(parseSlideContent(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(parseSlideContent({ text: "bài học cũ" })).toBeNull();
    expect(parseSlideContent({})).toBeNull();
    expect(parseSlideContent(null)).toBeNull();
    expect(parseSlideContent({ ...c, version: 99 })).toBeNull();
    expect(
      parseSlideContent({
        ...c,
        activities: [
          {
            id: "a",
            title: "x",
            slides: [{ id: "s", elements: [{ id: "e", type: "video", text: "" }] }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("keeps slide lessons apart from old lessons by key prefix", () => {
    expect(isSlideLessonKey(newSlideLessonKey(() => "abc"))).toBe(true);
    expect(isSlideLessonKey("11")).toBe(false);
    expect(isSlideLessonKey("11.1")).toBe(false);
    expect(isSlideLessonKey("3f0c2a7e-0000-4000-8000-000000000000")).toBe(false);
  });

  it("never mutates its input", () => {
    const id = counter();
    const c = newSlideContent(id);
    const frozen = JSON.stringify(c);
    const slideId = c.activities[0]!.slides[0]!.id;
    addActivity(c, "B", id);
    addSlide(c, c.activities[0]!.id, id);
    duplicateSlide(c, slideId, id);
    renameActivity(c, c.activities[0]!.id, "Z");
    addElement(c, slideId, "text", id);
    updateElementText(c, slideId, c.activities[0]!.slides[0]!.elements[0]!.id, "x");
    deleteElement(c, slideId, "nope");
    expect(JSON.stringify(c)).toBe(frozen);
  });

  describe("activities", () => {
    it("adds with a default or given name, renames, moves and deletes", () => {
      const id = counter();
      let c = newSlideContent(id);
      c = addActivity(c, undefined, id);
      c = addActivity(c, "  Luyện tập  ", id);
      expect(c.activities.map((a) => a.title)).toEqual(["Hoạt động 1", "Hoạt động 2", "Luyện tập"]);
      expect(c.activities.every((a) => a.slides.length === 1)).toBe(true);
      c = renameActivity(c, c.activities[1]!.id, "Khám phá");
      c = moveActivity(c, 2, 0);
      expect(c.activities.map((a) => a.title)).toEqual(["Luyện tập", "Hoạt động 1", "Khám phá"]);
      c = deleteActivity(c, c.activities[1]!.id);
      expect(c.activities.map((a) => a.title)).toEqual(["Luyện tập", "Khám phá"]);
    });

    it("keeps the last activity and ignores unknown ids and bad moves", () => {
      const c = newSlideContent(counter());
      expect(deleteActivity(c, c.activities[0]!.id)).toBe(c);
      expect(renameActivity(c, "missing", "x")).toBe(c);
      expect(moveActivity(c, 0, 0)).toBe(c);
      expect(moveActivity(c, 0, 5)).toBe(c);
      expect(moveActivity(c, -1, 0)).toBe(c);
    });
  });

  describe("slides", () => {
    it("adds several slides to one activity without touching the others", () => {
      const id = counter();
      let c = addActivity(newSlideContent(id), "B", id);
      const [a, b] = c.activities as [(typeof c.activities)[number], (typeof c.activities)[number]];
      c = addSlide(c, a.id, id);
      c = addSlide(c, a.id, id);
      expect(c.activities[0]!.slides).toHaveLength(3);
      expect(c.activities[1]!.slides).toHaveLength(b.slides.length);
      expect(countSlides(c)).toBe(4);
    });

    it("duplicates right after the original with fresh ids and the same text", () => {
      const id = counter();
      let c = newSlideContent(id);
      const first = c.activities[0]!.slides[0]!;
      c = updateElementText(c, first.id, first.elements[0]!.id, "Tiêu đề");
      c = duplicateSlide(c, first.id, id);
      const [orig, copy] = c.activities[0]!.slides as [typeof first, typeof first];
      expect(copy.id).not.toBe(orig.id);
      expect(copy.elements.map((e) => e.text)).toEqual(["Tiêu đề", ""]);
      expect(
        copy.elements.map((e) => e.id).filter((x) => orig.elements.some((e) => e.id === x)),
      ).toEqual([]);
      expect(duplicateSlide(c, "missing", id)).toEqual(c);
    });

    it("deletes a slide but keeps the last one of an activity", () => {
      const id = counter();
      let c = addSlide(newSlideContent(id), "x", id);
      c = addSlide(c, c.activities[0]!.id, id);
      const [s1, s2] = c.activities[0]!.slides;
      c = deleteSlide(c, s1!.id);
      expect(c.activities[0]!.slides.map((s) => s.id)).toEqual([s2!.id]);
      expect(deleteSlide(c, s2!.id)).toBe(c);
    });

    it("moves slides inside an activity", () => {
      const id = counter();
      let c = newSlideContent(id);
      const act = c.activities[0]!.id;
      c = addSlide(c, act, id);
      c = addSlide(c, act, id);
      const ids = c.activities[0]!.slides.map((s) => s.id);
      c = moveSlide(c, act, 0, 2);
      expect(c.activities[0]!.slides.map((s) => s.id)).toEqual([ids[1], ids[2], ids[0]]);
      expect(moveSlide(c, act, 1, 1)).toBe(c);
      expect(moveSlide(c, "missing", 0, 1)).toBe(c);
    });

    it("stops adding at the limit", () => {
      const id = counter();
      let c = newSlideContent(id);
      const act = c.activities[0]!.id;
      for (let i = 0; i < MAX_SLIDES_PER_ACTIVITY + 5; i++) c = addSlide(c, act, id);
      expect(c.activities[0]!.slides).toHaveLength(MAX_SLIDES_PER_ACTIVITY);
      expect(duplicateSlide(c, c.activities[0]!.slides[0]!.id, id)).toBe(c);
    });
  });

  describe("elements", () => {
    it("adds, edits and deletes one element of one slide", () => {
      const id = counter();
      let c = addSlide(newSlideContent(id), "x", id);
      c = addSlide(c, c.activities[0]!.id, id);
      const [s1, s2] = c.activities[0]!.slides;
      c = addElement(c, s2!.id, "text", id);
      expect(c.activities[0]!.slides[1]!.elements).toHaveLength(3);
      expect(c.activities[0]!.slides[0]!.elements).toHaveLength(2);
      const el = c.activities[0]!.slides[1]!.elements[2]!;
      c = updateElementText(c, s2!.id, el.id, "Cho $ABCD$ là hình bình hành");
      expect(c.activities[0]!.slides[1]!.elements[2]!.text).toBe("Cho $ABCD$ là hình bình hành");
      c = deleteElement(c, s2!.id, el.id);
      expect(c.activities[0]!.slides[1]!.elements).toHaveLength(2);
      expect(c.activities[0]!.slides[0]).toEqual(s1);
    });

    it("caps text length so one slide cannot bloat the stored row", () => {
      const c = newSlideContent(counter());
      const s = c.activities[0]!.slides[0]!;
      const out = updateElementText(c, s.id, s.elements[1]!.id, "x".repeat(10000));
      expect(out.activities[0]!.slides[0]!.elements[1]!.text).toHaveLength(5000);
      expect(parseSlideContent(out)).not.toBeNull();
    });
  });

  it("finds slides and the first slide", () => {
    const id = counter();
    let c = addActivity(newSlideContent(id), "B", id);
    c = addSlide(c, c.activities[1]!.id, id);
    const target = c.activities[1]!.slides[1]!;
    expect(findSlide(c, target.id)).toMatchObject({ index: 1, activity: { title: "B" } });
    expect(findSlide(c, "missing")).toBeNull();
    expect(firstSlideId(c)).toBe(c.activities[0]!.slides[0]!.id);
  });

  it("moveItem returns the same array for a no-op", () => {
    const a = [1, 2, 3];
    expect(moveItem(a, 1, 1)).toBe(a);
    expect(moveItem(a, 0, 2)).toEqual([2, 3, 1]);
  });
});
