import { describe, expect, it, vi } from "vitest";
import {
  deleteMedia,
  isMediaKey,
  loadMediaSrc,
  matchesSearch,
  renameMedia,
  saveMedia,
} from "./media-library";
import type { SlideStore } from "./storage";

describe("media library", () => {
  const untouched = () => {
    const from = vi.fn();
    return { from, store: { from } as unknown as SlideStore };
  };

  it("recognises library keys and nothing else", () => {
    expect(isMediaKey("img:1")).toBe(true);
    expect(isMediaKey("glb:1", "model3d")).toBe(true);
    expect(isMediaKey("img:1", "model3d")).toBe(false);
    for (const k of ["11", "12", "11.1", "slides:1", "3f0c2a7e"]) expect(isMediaKey(k)).toBe(false);
  });

  it("never deletes, renames or reads a lesson through the library", async () => {
    const { from, store } = untouched();
    for (const key of ["11", "12", "slides:a", "old-uuid"]) {
      await expect(deleteMedia(store, "me", key)).rejects.toThrow();
      await expect(renameMedia(store, "me", key, "x")).rejects.toThrow();
      await expect(loadMediaSrc(store, "me", key)).rejects.toThrow();
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("saves an item under its own key, with a name and a preview", async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    const store = { from: () => ({ upsert }) } as unknown as SlideStore;
    const item = await saveMedia(
      store,
      "me",
      "image",
      "  Hình chóp  ",
      "data:x",
      "data:t",
      () => "u1",
    );
    expect(item).toEqual({ key: "img:u1", name: "Hình chóp", type: "image", thumb: "data:t" });
    expect(upsert).toHaveBeenCalledWith(
      {
        owner_id: "me",
        lesson_key: "img:u1",
        title: "Hình chóp",
        content: { kind: "media", type: "image", src: "data:x", thumb: "data:t" },
      },
      { onConflict: "owner_id,lesson_key" },
    );
  });

  it("searches names without caring about accents or case", () => {
    expect(matchesSearch("Đường thẳng song song", "duong THANG")).toBe(true);
    expect(matchesSearch("Hình chóp S.ABCD", "chop abcd")).toBe(true);
    expect(matchesSearch("Hình chóp", "lăng trụ")).toBe(false);
    expect(matchesSearch("bất kỳ", "  ")).toBe(true);
  });
});
