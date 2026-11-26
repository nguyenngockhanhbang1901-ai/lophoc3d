import { describe, expect, it } from "vitest";
import {
  appearances,
  autoOrder,
  lessonTimeline,
  moveInOrder,
  resolveOrder,
  resetAutomatic,
  setAnimMode,
  stepCount,
  visibleIds,
} from "./animation";
import type { Slide, SlideElement, SlideContent } from "./types";

const el = (
  id: string,
  type: SlideElement["type"],
  x: number,
  y: number,
  anim: SlideElement["anim"] = "enter",
): SlideElement => ({ id, type, x, y, w: 10, h: 10, text: "", anim });
const slideOf = (elements: SlideElement[], order = autoOrder(elements)): Slide => ({
  id: "s",
  layout: "blank",
  elements,
  order,
});

describe("appearance order", () => {
  it("auto order: title first, then top to bottom, left to right", () => {
    const els = [
      el("right", "text", 60, 30),
      el("low", "text", 5, 70),
      el("left", "text", 5, 30),
      el("title", "title", 5, 5),
    ];
    expect(autoOrder(els)).toEqual(["title", "left", "right", "low"]);
  });
  it("treats nearly equal y as one row", () => {
    expect(autoOrder([el("b", "text", 50, 31), el("a", "text", 5, 33)])).toEqual(["a", "b"]);
  });
  it("a title below other elements still comes first", () => {
    expect(autoOrder([el("t", "text", 5, 5), el("title", "title", 5, 60)])).toEqual(["title", "t"]);
  });

  it("each Enter reveals the next element", () => {
    const s = slideOf([el("a", "title", 0, 0), el("b", "text", 0, 30), el("c", "text", 0, 60)]);
    expect(stepCount(s)).toBe(3);
    expect([...visibleIds(s, 0)]).toEqual([]);
    expect([...visibleIds(s, 1)]).toEqual(["a"]);
    expect([...visibleIds(s, 2)]).toEqual(["a", "b"]);
    expect([...visibleIds(s, 3)]).toEqual(["a", "b", "c"]);
  });
  it('"with" merges into the previous step; "immediate" is there from the start', () => {
    const s = slideOf([
      el("a", "title", 0, 0, "immediate"),
      el("b", "text", 0, 30),
      el("c", "text", 0, 60, "with"),
      el("d", "text", 0, 80),
    ]);
    expect(appearances(s).map((a) => [a.id, a.step])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 1],
      ["d", 2],
    ]);
    expect(stepCount(s)).toBe(2);
    expect([...visibleIds(s, 0)]).toEqual(["a"]);
    expect([...visibleIds(s, 1)]).toEqual(["a", "b", "c"]);
  });
  it("a slide where everything is immediate needs no Enter", () => {
    expect(stepCount(slideOf([el("a", "title", 0, 0, "immediate")]))).toBe(0);
    expect(stepCount(slideOf([]))).toBe(0);
  });

  it("a new element is appended at the end; unknown ids are dropped", () => {
    const s = {
      ...slideOf([el("a", "title", 0, 0), el("b", "text", 0, 30)]),
      order: ["b", "ghost"],
    };
    expect(resolveOrder(s)).toEqual(["b", "a"]);
  });
  it("drag to reorder changes who appears first", () => {
    const s = slideOf([el("a", "title", 0, 0), el("b", "text", 0, 30), el("c", "text", 0, 60)]);
    expect(moveInOrder(s, 2, 0).order).toEqual(["c", "a", "b"]);
    expect(moveInOrder(s, 1, 1)).toBe(s);
    expect(moveInOrder(s, 0, 9)).toBe(s);
  });
  it("setAnimMode changes one element and is a no-op when equal", () => {
    const s = slideOf([el("a", "title", 0, 0)]);
    expect(setAnimMode(s, "a", "with").elements[0]!.anim).toBe("with");
    expect(setAnimMode(s, "a", "enter")).toBe(s);
    expect(setAnimMode(s, "zzz", "with")).toBe(s);
  });
  it("reset recalculates the automatic order and clears the modes", () => {
    const s = slideOf(
      [el("b", "text", 0, 50, "with"), el("a", "title", 0, 0, "immediate")],
      ["b", "a"],
    );
    const r = resetAutomatic(s);
    expect(r.order).toEqual(["a", "b"]);
    expect(r.elements.every((e) => e.anim === "enter")).toBe(true);
  });
});

describe("lesson timeline (Enter forward, Backspace back)", () => {
  const content: SlideContent = {
    kind: "slides",
    version: 2,
    activities: [
      {
        id: "A1",
        title: "H1",
        slides: [
          { ...slideOf([el("a", "title", 0, 0), el("b", "text", 0, 30)]), id: "S1" },
          { ...slideOf([el("c", "title", 0, 0)]), id: "S2" },
        ],
      },
      { id: "A2", title: "H2", slides: [{ ...slideOf([]), id: "S3" }] },
    ],
  };
  it("walks every slide through steps 0..n, then the next slide", () => {
    expect(lessonTimeline(content).map((t) => `${t.slideId}:${t.step}`)).toEqual([
      "S1:0",
      "S1:1",
      "S1:2",
      "S2:0",
      "S2:1",
      "S3:0",
    ]);
  });
  it("knows the activity and the total steps of each state", () => {
    const t = lessonTimeline(content);
    expect(t[3]).toMatchObject({ slideIndex: 1, activityIndex: 0, steps: 1 });
    expect(t[5]).toMatchObject({ slideIndex: 2, activityIndex: 1, steps: 0 });
  });
});
