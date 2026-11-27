import { expect, it, vi } from "vitest";

const written = vi.hoisted(() => ({
  sheets: [] as { sheet: string; data: unknown[][] }[],
  file: "",
}));
vi.mock("write-excel-file/browser", () => ({
  default: (sheets: { sheet: string; data: unknown[][] }[]) => {
    written.sheets = sheets;
    return {
      toFile: async (name: string) => {
        written.file = name;
      },
    };
  },
}));

const { downloadAssignmentReport } = await import("./files");

it("writes the four report sheets, cancelled attempts included", async () => {
  await downloadAssignmentReport({
    title: "Kiểm tra 15 phút",
    scale: 10,
    scoreRule: "latest",
    students: [
      { id: "s1", fullName: "Nguyễn Văn An", username: "annv", studentCode: null },
      { id: "s2", fullName: "Trần Bình", username: "binht", studentCode: "HS2" },
    ],
    attempts: [
      {
        studentId: "s1",
        attemptNo: 1,
        status: "cancelled_edit",
        counts: true,
        code: "A1",
        startedAt: "2026-11-27T01:00:00Z",
        completedAllAt: "2026-11-27T01:02:00Z",
        finishedAt: "2026-11-27T01:05:00Z",
        score: null,
        correctCount: 2,
        questionCount: 4,
        violationCount: 1,
        disconnectCount: 0,
        editCount: 3,
      },
      {
        studentId: "s1",
        attemptNo: 2,
        status: "submitted",
        counts: true,
        code: "A2",
        startedAt: "2026-11-27T01:10:00Z",
        completedAllAt: null,
        finishedAt: "2026-11-27T01:20:00Z",
        score: 7.5,
        correctCount: 3,
        questionCount: 4,
        violationCount: 0,
        disconnectCount: 1,
        editCount: 0,
      },
    ],
    edits: [
      {
        studentId: "s1",
        attemptNo: 1,
        at: "2026-11-27T01:03:00Z",
        label: "Câu 1 (Phần I)",
        before: { kind: "mcq", choice: 0 },
        after: { kind: "mcq", choice: 2 },
        afterCompletion: true,
      },
    ],
    incidents: [
      {
        studentId: "s1",
        attemptNo: 2,
        at: "2026-11-27T01:12:00Z",
        kind: "drop",
        counted: false,
        durationMs: 40_000,
        outcome: "continue",
      },
    ],
  });
  expect(written.sheets.map((s) => s.sheet)).toEqual([
    "Tổng hợp",
    "Tất cả các lượt",
    "Nhật ký sửa đáp án",
    "Vi phạm và mất mạng",
  ]);
  const [summary, attempts, edits, incidents] = written.sheets.map((s) => s.data);
  expect(summary![1]).toEqual(
    expect.arrayContaining(["Nguyễn Văn An", 2, 1, 7.5, "Nộp bình thường"]),
  );
  expect(summary![2]).toContain("Chưa làm");
  expect(attempts).toHaveLength(3);
  expect(attempts![1]).toContain("Hủy do sửa đáp án");
  expect(edits![1]).toEqual(expect.arrayContaining(["A", "C", "Có"]));
  expect(incidents![1]).toEqual(expect.arrayContaining(["Mất kết nối", "40 giây", "Làm tiếp"]));
  expect(written.file).toBe("ket-qua-Kiem_tra_15_phut.xlsx");
});
