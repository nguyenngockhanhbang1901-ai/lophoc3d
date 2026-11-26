import { describe, expect, it } from "vitest";
import { MIN_FIT, fitElement, markCustom, refitSlide, type Measure } from "./fit";
import { newSlide, newElement } from "./model";
import type { SlideElement } from "./types";

const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};
/** Each character needs 1 % of height at fit 1; shrinking scales it down. */
const measure: Measure = (el) => el.text.length * (el.fit ?? 1);

describe("fitElement", () => {
  const slide = newSlide("title-content", counter());
  const content = slide.elements[1] as SlideElement; // slot box 5,25,90,65

  it("leaves text that fits at full size", () => {
    const r = fitElement(slide, { ...content, text: "x".repeat(60) }, measure);
    expect(r).toEqual({ el: { ...content, text: "x".repeat(60) }, overflow: false });
  });
  it("shrinks text in a layout box until it fits", () => {
    const r = fitElement(slide, { ...content, text: "x".repeat(80) }, measure);
    expect(r.overflow).toBe(false);
    expect(r.el.fit).toBe(0.8);
  });
  it("reports overflow when even the smallest size does not fit", () => {
    const r = fitElement(slide, { ...content, text: "x".repeat(200) }, measure);
    expect(r.overflow).toBe(true);
    expect(r.el.fit).toBe(MIN_FIT);
  });
  it("reports a layout box moved out of its slot, even with little text", () => {
    expect(fitElement(slide, { ...content, y: 40 }, measure).overflow).toBe(true);
    expect(fitElement(slide, { ...content, x: 10, w: 50 }, measure).overflow).toBe(false);
  });
  it("never asks again for a custom box, and draws its text at full size", () => {
    const r = fitElement(slide, { ...markCustom(content), text: "x".repeat(500), y: 40 }, measure);
    expect(r.overflow).toBe(false);
    expect(r.el.fit).toBeUndefined();
  });
  it("grows a free text box instead of shrinking it", () => {
    const free = { ...newElement("text", "x".repeat(30), counter()), fit: 0.7 };
    const r = fitElement(slide, free, measure);
    expect(r.overflow).toBe(false);
    expect(r.el.fit).toBeUndefined();
    expect(r.el.h).toBe(30.5);
  });
  it("a free picture is never a problem", () => {
    const img = newElement("image", "", counter());
    expect(fitElement(slide, img, measure)).toEqual({ el: img, overflow: false });
  });
});

describe("refitSlide", () => {
  it("re-fits all text and returns the same slide when nothing changes", () => {
    const slide = newSlide("title-content", counter());
    expect(refitSlide(slide, measure)).toBe(slide);
    const long = {
      ...slide,
      elements: slide.elements.map((e, i) => (i === 1 ? { ...e, text: "x".repeat(70) } : e)),
    };
    expect(refitSlide(long, measure).elements[1]?.fit).toBe(0.9);
  });
});
