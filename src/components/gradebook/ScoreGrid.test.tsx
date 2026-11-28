import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
const fns = vi.hoisted(() => ({ saveScores: vi.fn() }));
vi.mock("@/lib/gradebook/gradebook.functions", () => fns);

import { ScoreGrid } from "./ScoreGrid";
import { defaultColumns } from "@/lib/gradebook/scores";
import type { BookData } from "@/lib/gradebook/gradebook.functions";

const data: BookData = {
  book: {
    id: "b1",
    classId: "c1",
    className: "11A1",
    subject: "Toán",
    semester: 1,
    schoolYear: "2026-2027",
    studentCount: 2,
    hasSmas: false,
    updatedAt: "",
    columns: defaultColumns(2),
    bonusTarget: "tx2",
    bonusRule: null,
    termFrom: "2026-09-05",
    termTo: "2027-01-14",
  },
  students: [
    { id: "s1", fullName: "Trần Văn Bình", studentCode: null, status: "dang_hoc" },
    { id: "s2", fullName: "Nguyễn Thị An", studentCode: null, status: "dang_hoc" },
  ],
  scores: [
    { studentId: "s2", key: "tx1", num: 8, txt: null },
    { studentId: "s2", key: "tx2", num: 7, txt: null },
    { studentId: "s2", key: "gk", num: 6, txt: null },
    { studentId: "s2", key: "ck", num: 9, txt: null },
  ],
  bonus: [{ studentId: "s2", plus: 1, minus: 0, note: "" }],
  counts: { s2: { phat_bieu: 4, khong_lam_bai: 1 } },
};

describe("ScoreGrid", () => {
  beforeEach(() => {
    fns.saveScores.mockReset();
    fns.saveScores.mockResolvedValue({ saved: 1 });
  });

  it("shows the average with the bonus applied to its column", () => {
    render(<ScoreGrid data={data} onChanged={() => {}} onBonus={() => {}} />);
    // An: tx2 7 + 1 = 8 → (8 + 8 + 12 + 27) / 7 = 7.857 → 7,9
    expect(screen.getByText("7,9")).toBeTruthy();
    expect(screen.getByText("+1")).toBeTruthy();
  });

  it("saves a typed score with a comma and rejects an invalid one", async () => {
    const changed = vi.fn();
    render(<ScoreGrid data={data} onChanged={changed} onBonus={() => {}} />);
    const cell = screen.getByLabelText("TX1 – Trần Văn Bình") as HTMLInputElement;
    fireEvent.change(cell, { target: { value: "8,5" } });
    fireEvent.keyDown(cell, { key: "Enter" });
    await waitFor(() => expect(fns.saveScores).toHaveBeenCalledTimes(1));
    expect(fns.saveScores.mock.calls[0]?.[0]).toEqual({
      data: { bookId: "b1", cells: [{ studentId: "s1", key: "tx1", num: 8.5, txt: null }] },
    });
    const gk = screen.getByLabelText("GK – Trần Văn Bình") as HTMLInputElement;
    fireEvent.change(gk, { target: { value: "11" } });
    fireEvent.blur(gk);
    expect(gk.className).toContain("border-red-500");
    expect(fns.saveScores).toHaveBeenCalledTimes(1);
  });
});
