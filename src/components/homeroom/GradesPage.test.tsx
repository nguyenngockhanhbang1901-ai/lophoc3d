import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
const fns = vi.hoisted(() => ({
  classBooks: vi.fn(),
  listEvaluations: vi.fn(),
  listIncidents: vi.fn(),
  saveEvaluation: vi.fn(),
  weeklyData: vi.fn(),
  attendanceData: vi.fn(),
  listExamClasses: vi.fn(),
  behaviorRange: vi.fn(),
  lockWeek: vi.fn(),
}));
vi.mock("@/lib/homeroom/records.functions", () => ({
  ...fns,
  INCIDENT_CATEGORIES: { khen: {}, vi_pham: {} },
}));
vi.mock("@/lib/homeroom/homeroom.functions", () => fns);
vi.mock("@/lib/exam/classes.functions", () => fns);
vi.mock("@/lib/gradebook/gradebook.functions", () => ({
  behaviorOfDay: vi.fn().mockResolvedValue([]),
  recordBehavior: vi.fn(),
  undoBehavior: vi.fn(),
}));

import { GradesPage } from "./GradesPage";
import { MeritPage } from "./MeritPage";
import { defaultColumns } from "@/lib/gradebook/scores";
import { DEFAULT_WEEKLY_RULE } from "@/lib/homeroom/weekly";

const settings = {
  yearStart: "2026-09-05",
  term2Start: "2027-01-15",
  yearEnd: "2027-05-31",
  twoSessions: false,
  alertConsecutive: 3,
  alertUnexcusedMonth: 2,
};
const ctx = {
  cls: { id: "c1", name: "11A1", schoolYear: "2026-2027", studentCount: 1, settings },
  reloadClasses: async () => {},
  openSettings: () => {},
};
const student = {
  id: "s1",
  fullName: "Nguyễn Văn An",
  birthDate: null,
  studentCode: null,
  gender: null,
  status: "dang_hoc",
};
const book = (subject: string, v: number) => ({
  id: subject,
  subject,
  semester: 1,
  columns: defaultColumns(1),
  bonusTarget: null,
  mine: true,
  scores: ["tx1", "gk", "ck"].map((key) => ({
    studentId: "s1",
    key,
    num: v,
    txt: null,
    updatedAt: "2026-11-20T00:00:00Z",
  })),
  bonus: [],
});

beforeEach(() => {
  for (const f of Object.values(fns)) f.mockReset();
  fns.attendanceData.mockResolvedValue({ settings, students: [student], absences: [], taken: [] });
  fns.listEvaluations.mockResolvedValue([]);
  fns.listIncidents.mockResolvedValue([]);
  fns.weeklyData.mockResolvedValue({ rule: DEFAULT_WEEKLY_RULE, results: [] });
  fns.saveEvaluation.mockResolvedValue({ ok: true });
  fns.behaviorRange.mockResolvedValue([]);
  fns.lockWeek.mockResolvedValue({ saved: 1 });
});

describe("GradesPage", () => {
  it("shows every subject's average, suggests the TT22 level and saves the teacher's choice", async () => {
    fns.classBooks.mockResolvedValue(
      ["Toán", "Ngữ văn", "Tiếng Anh", "Vật lí", "Hóa học", "Sinh học"]
        .map((s) => book(s, 8.5))
        .concat([book("Lịch sử", 7)]),
    );
    render(<GradesPage {...ctx} />);
    await screen.findByText("Nguyễn Văn An");
    expect(screen.getAllByText("8,5")).toHaveLength(6);
    expect(screen.getByText("Tốt", { selector: "b" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Học tập – Nguyễn Văn An"), {
      target: { value: "tot" },
    });
    await waitFor(() => expect(fns.saveEvaluation).toHaveBeenCalled());
    expect(fns.saveEvaluation.mock.calls[0]?.[0]).toEqual({
      data: {
        classId: "c1",
        studentId: "s1",
        term: 1,
        studyLevel: "tot",
        conductLevel: null,
        comment: "",
      },
    });
  });
});

describe("MeritPage weekly", () => {
  it("computes the week from absences and locks it", async () => {
    fns.attendanceData.mockResolvedValue({
      settings,
      students: [student],
      absences: [
        { studentId: "s1", day: "2026-11-24", session: "ca_ngay", kind: "khong_phep", reason: "" },
      ],
      taken: [],
    });
    render(<MeritPage {...ctx} />);
    const tab = await screen.findByRole("tab", { name: "Xếp loại tuần" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    await screen.findByText(/Nghỉ không phép/);
    expect(screen.getByText("90")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Chốt tuần/ }));
    await waitFor(() => expect(fns.lockWeek).toHaveBeenCalled());
    expect(fns.lockWeek.mock.calls[0]?.[0]?.data.rows).toEqual([
      { studentId: "s1", points: 90, level: "kha", note: "" },
    ]);
  });
});
