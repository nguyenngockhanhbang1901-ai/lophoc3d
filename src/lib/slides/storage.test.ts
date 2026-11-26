import { describe, expect, it, vi } from "vitest";
import { deleteSlideLesson, saveSlideLesson, type SlideStore } from "./storage";
import { newSlideContent } from "./model";

describe("slide storage guards", () => {
  const untouched = () => {
    const from = vi.fn();
    return { from, store: { from } as unknown as SlideStore };
  };

  it("refuses to delete anything that is not a slide lesson, without calling the database", async () => {
    const { from, store } = untouched();
    for (const key of ["11", "11.1", "12", "3f0c2a7e-0000-4000-8000-000000000000", ""])
      await expect(deleteSlideLesson(store, "me", key)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses to write over a non-slide lesson key", async () => {
    const { from, store } = untouched();
    await expect(
      saveSlideLesson(store, "me", { lesson_key: "12", title: "x", content: newSlideContent() }),
    ).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
});
