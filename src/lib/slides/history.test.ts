import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, canRedo, canUndo, commit, redo, startHistory, undo } from "./history";

describe("editor history", () => {
  it("undoes and redoes in order", () => {
    let h = startHistory("a");
    h = commit(h, "b");
    h = commit(h, "c");
    expect(h.present).toBe("c");
    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe("c");
    expect(canRedo(h)).toBe(false);
    expect(redo(h)).toBe(h);
  });

  it("ignores a commit of the same value and clears redo after a new edit", () => {
    let h = commit(startHistory("a"), "b");
    expect(commit(h, "b")).toBe(h);
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = commit(h, "x");
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(["a"]);
  });

  it("keeps only the most recent steps", () => {
    let h = startHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(20);
    expect(h.present).toBe(HISTORY_LIMIT + 20);
  });
});
