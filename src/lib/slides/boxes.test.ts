import { describe, expect, it } from "vitest";
import { MIN_SIZE, clampBox, moveBox, nudge, resizeBox, snapMove, snapResize } from "./boxes";

const B = { x: 20, y: 20, w: 30, h: 20 };

describe("moving", () => {
  it("moves by the delta and never leaves the slide", () => {
    expect(moveBox(B, 5, -5)).toEqual({ x: 25, y: 15, w: 30, h: 20 });
    expect(moveBox(B, -50, -50)).toEqual({ x: 0, y: 0, w: 30, h: 20 });
    expect(moveBox(B, 500, 500)).toEqual({ x: 70, y: 80, w: 30, h: 20 });
    expect(nudge(B, 1, 0).x).toBe(21);
  });
  it("clampBox keeps a minimum size and rounds", () => {
    expect(clampBox({ x: 10, y: 10, w: 0, h: 0 })).toMatchObject({ w: MIN_SIZE, h: MIN_SIZE });
    expect(clampBox({ x: 1.23456, y: 2, w: 10, h: 10 }).x).toBe(1.23);
  });
});

describe("resizing", () => {
  it("east and south handles grow the far edge", () => {
    expect(resizeBox(B, "e", 10, 99)).toEqual({ x: 20, y: 20, w: 40, h: 20 });
    expect(resizeBox(B, "s", 99, 10)).toEqual({ x: 20, y: 20, w: 30, h: 30 });
    expect(resizeBox(B, "se", 10, 10)).toEqual({ x: 20, y: 20, w: 40, h: 30 });
  });
  it("west and north handles move the near edge and keep the far edge fixed", () => {
    expect(resizeBox(B, "w", -10, 0)).toEqual({ x: 10, y: 20, w: 40, h: 20 });
    expect(resizeBox(B, "n", 0, -5)).toEqual({ x: 20, y: 15, w: 30, h: 25 });
    expect(resizeBox(B, "nw", 5, 5)).toEqual({ x: 25, y: 25, w: 25, h: 15 });
  });
  it("cannot shrink below the minimum or cross over", () => {
    const r = resizeBox(B, "e", -100, 0);
    expect(r.w).toBe(MIN_SIZE);
    expect(r.x).toBe(20);
    const l = resizeBox(B, "w", 100, 0);
    expect(l.w).toBe(MIN_SIZE);
    expect(l.x + l.w).toBe(50);
  });
  it("stays inside the slide", () => {
    const r = resizeBox({ x: 80, y: 80, w: 15, h: 15 }, "se", 50, 50);
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
    expect(resizeBox({ x: 5, y: 5, w: 15, h: 15 }, "nw", -50, -50)).toMatchObject({ x: 0, y: 0 });
  });
  it("a corner with keepRatio keeps the on-screen proportions", () => {
    const box = { x: 10, y: 10, w: 40, h: (40 * 16) / 9 / 2 };
    const r = resizeBox(box, "se", 10, 0, true);
    expect((r.w * 16) / 9 / r.h).toBeCloseTo((box.w * 16) / 9 / box.h, 1);
  });
});

describe("guides", () => {
  const other = { x: 60, y: 10, w: 20, h: 20 };
  it("snaps to another element’s edge and returns the guide to draw", () => {
    const r = snapMove({ x: 59.5, y: 50, w: 10, h: 10 }, [other]);
    expect(r.box.x).toBe(60);
    expect(r.guides.vertical).toContain(60);
  });
  it("snaps the centre to the slide centre", () => {
    const r = snapMove({ x: 44.6, y: 50, w: 10, h: 10 }, []);
    expect(r.box.x).toBe(45);
    expect(r.guides.vertical).toContain(50);
    const h = snapMove({ x: 0, y: 44.7, w: 10, h: 10 }, []);
    expect(h.guides.horizontal).toContain(50);
  });
  it("does nothing when far away", () => {
    const b = { x: 30, y: 60, w: 10, h: 10 };
    const r = snapMove(b, [other]);
    expect(r.box).toBe(b);
    expect(r.guides).toEqual({ vertical: [], horizontal: [] });
  });
  it("a resize snaps only the edge being dragged", () => {
    const r = snapResize({ x: 10, y: 10, w: 49.6, h: 10 }, "e", [other]);
    expect(r.box.x + r.box.w).toBeCloseTo(60, 1);
    expect(r.box.x).toBe(10);
    expect(r.guides.vertical).toContain(60);
  });
});
