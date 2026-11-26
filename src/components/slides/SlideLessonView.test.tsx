import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CustomLesson } from "../CustomLesson";
import { SlideLessonView } from "./SlideLessonView";
import {
  addActivity,
  addElement,
  addSlide,
  findSlide,
  moveElementInOrder,
  newSlideContent,
  setElementAnim,
  setSlideLayout,
  updateElementText,
  type SlideContent,
} from "@/lib/slides/model";

afterEach(cleanup);
function counter() {
  let n = 0;
  return () => `id${++n}`;
}
const press = (key: string) =>
  act(() => {
    fireEvent.keyDown(window, { key });
  });
const hidden = (id: string) =>
  document.querySelector(`[data-el-id="${id}"]`)?.getAttribute("data-hidden") === "true";
const el = (id: string) => document.querySelector(`[data-el-id="${id}"]`) as HTMLElement;

/** Slide 1: title + content; slide 2 (second activity): two columns. */
function lesson(): SlideContent {
  const id = counter();
  let c = newSlideContent(id);
  const s1 = c.activities[0]!.slides[0]!;
  c = updateElementText(c, s1.id, s1.elements[0]!.id, "Tiêu đề 1");
  c = updateElementText(c, s1.id, s1.elements[1]!.id, "Nội dung 1");
  c = addActivity(c, "Khám phá", id);
  const s2 = c.activities[1]!.slides[0]!;
  c = setSlideLayout(c, s2.id, "two-columns", id);
  return c;
}

describe("SlideLessonView", () => {
  it("draws each element where the layout put it, in percent of the slide", () => {
    const c = lesson();
    render(<SlideLessonView content={c} />);
    const [title, body] = c.activities[0]!.slides[0]!.elements as unknown as [
      { id: string },
      { id: string },
    ];
    expect(el(title.id).style.cssText).toContain("left: 5%");
    expect(el(title.id).style.cssText).toContain("top: 5%");
    expect(el(title.id).style.cssText).toContain("width: 90%");
    expect(el(title.id).style.cssText).toContain("height: 15%");
    expect(el(body.id).style.cssText).toContain("top: 25%");
    expect(el(body.id).style.cssText).toContain("height: 65%");
  });

  it("shows elements one Enter at a time: the title first, then the content", () => {
    const c = lesson();
    render(<SlideLessonView content={c} />);
    const [title, body] = c.activities[0]!.slides[0]!.elements as unknown as [
      { id: string },
      { id: string },
    ];
    expect(hidden(title.id)).toBe(true);
    expect(hidden(body.id)).toBe(true);
    press("Enter");
    expect(hidden(title.id)).toBe(false);
    expect(hidden(body.id)).toBe(true);
    press("Enter");
    expect(hidden(body.id)).toBe(false);
  });

  it("after the last element Enter moves to the next slide, and Backspace returns fully shown", () => {
    const c = lesson();
    render(<SlideLessonView content={c} />);
    expect(screen.getByText(/Slide 1\/2/)).toBeTruthy();
    press("Enter");
    press("Enter");
    expect(screen.getByText(/Slide 1\/2/)).toBeTruthy();
    press("Enter");
    expect(screen.getByText(/Khám phá · Slide 2\/2/)).toBeTruthy();
    press("Backspace");
    expect(screen.getByText(/Slide 1\/2/)).toBeTruthy();
    const [title, body] = c.activities[0]!.slides[0]!.elements as unknown as [
      { id: string },
      { id: string },
    ];
    expect(hidden(title.id)).toBe(false);
    expect(hidden(body.id)).toBe(false);
    press("Backspace");
    expect(hidden(body.id)).toBe(true);
    expect(hidden(title.id)).toBe(false);
  });

  it("arrow keys and the on-screen buttons do the same as Enter and Backspace", () => {
    const c = lesson();
    render(<SlideLessonView content={c} />);
    const title = c.activities[0]!.slides[0]!.elements[0]!;
    press("ArrowRight");
    expect(hidden(title.id)).toBe(false);
    press("ArrowLeft");
    expect(hidden(title.id)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Bước tiếp theo" }));
    expect(hidden(title.id)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Bước trước" }));
    expect(hidden(title.id)).toBe(true);
  });

  it('follows the saved order: a reordered element appears first, "with" joins, "immediate" is there at once', () => {
    let c = lesson();
    const s = c.activities[0]!.slides[0]!;
    const [title, body] = s.elements as unknown as [{ id: string }, { id: string }];
    c = moveElementInOrder(c, s.id, 1, 0); // content first
    render(<SlideLessonView content={c} />);
    press("Enter");
    expect(hidden(body.id)).toBe(false);
    expect(hidden(title.id)).toBe(true);
    cleanup();
    c = setElementAnim(c, s.id, title.id, "with");
    render(<SlideLessonView content={c} />);
    press("Enter");
    expect(hidden(body.id)).toBe(false);
    expect(hidden(title.id)).toBe(false);
    cleanup();
    c = setElementAnim(c, s.id, body.id, "immediate");
    render(<SlideLessonView content={c} />);
    expect(hidden(body.id)).toBe(false);
    expect(hidden(title.id)).toBe(false);
  });

  it("a slide with an added element gets one more step for it, at the end", () => {
    const id = counter();
    let c = newSlideContent(id);
    const s = c.activities[0]!.slides[0]!;
    c = addElement(c, s.id, "text", id);
    const added = findSlide(c, s.id)!.slide.elements[2]!;
    render(<SlideLessonView content={c} />);
    press("Enter");
    press("Enter");
    expect(hidden(added.id)).toBe(true);
    press("Enter");
    expect(hidden(added.id)).toBe(false);
  });

  it("has no editing controls", () => {
    render(<SlideLessonView content={lesson()} />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Xóa|Nhân đôi|Thêm|Hoàn tác/ })).toBeNull();
    expect(document.querySelector(".slide-order-badge")).toBeNull();
  });

  it("renders the lesson once and does not need every slide mounted", () => {
    let c = lesson();
    c = addSlide(c, c.activities[0]!.id, "cover", counter());
    render(<SlideLessonView content={c} />);
    expect(screen.getAllByTestId("slide-canvas")).toHaveLength(1);
  });

  it("shows a plain message for content that is not a slide lesson", () => {
    render(<SlideLessonView content={{ text: "chữ" }} />);
    expect(screen.getByText("Chưa có nội dung bài học.")).toBeTruthy();
  });
});

describe("CustomLesson in the classroom", () => {
  it("shows a slide lesson with the slide viewer", () => {
    render(<CustomLesson content={lesson()} />);
    expect(screen.getByTestId("slide-lesson")).toBeTruthy();
  });
  it("keeps showing text lessons exactly as before, one paragraph per Enter", () => {
    render(<CustomLesson content={{ text: "Đoạn một\n\nĐoạn hai" }} />);
    expect(screen.queryByTestId("slide-lesson")).toBeNull();
    const p = (t: string) => screen.getByText(t).closest("p") as HTMLElement;
    expect(p("Đoạn một").getAttribute("data-reveal")).toBe("shown");
    expect(p("Đoạn hai").getAttribute("data-reveal")).toBe("hidden");
    press("Enter");
    expect(p("Đoạn hai").getAttribute("data-reveal")).toBe("shown");
  });
  it("shows the empty message for an empty text lesson", () => {
    render(<CustomLesson content={{}} />);
    expect(screen.getByText("Chưa có nội dung bài học.")).toBeTruthy();
  });
});
