import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
const fns = vi.hoisted(() => ({
  attendanceData: vi.fn(),
  saveAttendance: vi.fn(),
}));
vi.mock("@/lib/homeroom/homeroom.functions", () => fns);

import { AttendancePage } from "./AttendancePage";
import { vnToday } from "@/lib/homeroom/periods";

const settings = {
  yearStart: null,
  term2Start: null,
  yearEnd: null,
  twoSessions: false,
  alertConsecutive: 3,
  alertUnexcusedMonth: 2,
};
const cls = { id: "c1", name: "11A1", schoolYear: "2026-2027", studentCount: 3, settings };
const student = (id: string, fullName: string, status = "dang_hoc") => ({
  id,
  fullName,
  birthDate: null,
  studentCode: null,
  gender: null,
  status,
});

describe("AttendancePage", () => {
  beforeEach(() => {
    fns.attendanceData.mockReset();
    fns.saveAttendance.mockReset();
    fns.attendanceData.mockResolvedValue({
      settings,
      students: [
        student("s1", "Trần Văn Bình"),
        student("s2", "Nguyễn Thị An"),
        student("s3", "Lê Chuyển Đi", "chuyen_di"),
      ],
      absences: [],
      taken: [],
    });
    fns.saveAttendance.mockResolvedValue({ ok: true });
  });

  it("lists active students by given name, marks one absent and saves only that entry", async () => {
    render(<AttendancePage cls={cls} reloadClasses={async () => {}} openSettings={() => {}} />);
    await screen.findByText("Nguyễn Thị An");
    expect(screen.queryByText("Lê Chuyển Đi")).toBeNull();
    const names = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names[0]).toContain("Nguyễn Thị An");
    expect(screen.getByText("Chưa điểm danh")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Nghỉ không phép – Trần Văn Bình"));
    fireEvent.change(screen.getByPlaceholderText("Lý do (không bắt buộc)"), {
      target: { value: "Ốm" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Lưu điểm danh/ }));

    await waitFor(() => expect(fns.saveAttendance).toHaveBeenCalledTimes(1));
    expect(fns.saveAttendance.mock.calls[0]?.[0]?.data).toEqual({
      classId: "c1",
      day: vnToday(),
      session: "ca_ngay",
      entries: [{ studentId: "s1", kind: "khong_phep", reason: "Ốm" }],
    });
  });

  it("tapping the same mark again clears it", async () => {
    render(<AttendancePage cls={cls} reloadClasses={async () => {}} openSettings={() => {}} />);
    const p = await screen.findByLabelText("Nghỉ có phép – Nguyễn Thị An");
    fireEvent.click(p);
    expect(p.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(p);
    expect(p.getAttribute("aria-pressed")).toBe("false");
  });
});
