import { describe, expect, it } from "vitest";
import {
  addDays,
  defaultTerms,
  isSchoolDay,
  monthRange,
  periodRange,
  previousPeriod,
  termOf,
  vnToday,
  weekRange,
} from "./periods";
import {
  attendanceAlerts,
  currentAbsenceRun,
  dayTaken,
  takenCount,
  tallies,
  type AbsenceRecord,
  type TakenSession,
} from "./attendance";
import { cleanPhone, normalizeGuardians, parseProfileSheet } from "./profiles";

describe("periods", () => {
  it("takes today in Vietnam time", () => {
    expect(vnToday(new Date("2026-11-28T18:30:00Z"))).toBe("2026-11-29");
    expect(vnToday(new Date("2026-11-28T16:59:00Z"))).toBe("2026-11-28");
  });
  it("weeks run Monday to Sunday", () => {
    expect(weekRange("2026-11-28")).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(weekRange("2026-11-30")).toEqual({ from: "2026-11-30", to: "2026-12-06" });
    expect(isSchoolDay("2026-11-28")).toBe(true);
    expect(isSchoolDay("2026-11-29")).toBe(false);
  });
  it("months handle December and February", () => {
    expect(monthRange("2026-12-10")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(monthRange("2028-02-03")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("uses default school year dates when none are set", () => {
    expect(defaultTerms("2026-11-28").yearStart).toBe("2026-09-05");
    expect(defaultTerms("2027-03-01").term2Start).toBe("2027-01-15");
    const none = { yearStart: null, term2Start: null, yearEnd: null };
    expect(periodRange("term1", "2026-11-28", none)).toEqual({
      from: "2026-09-05",
      to: "2027-01-14",
    });
    expect(termOf("2027-02-01", none)).toBe(2);
    expect(termOf("2027-07-01", none)).toBe(null);
  });
  it("finds the previous period of the same kind", () => {
    const none = { yearStart: null, term2Start: null, yearEnd: null };
    const w = weekRange("2026-11-28");
    expect(previousPeriod("week", w, none)).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(previousPeriod("month", monthRange("2027-01-05"), none)).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(previousPeriod("year", periodRange("year", "2026-11-28", none), none)).toBe(null);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

const rec = (studentId: string, day: string, kind: AbsenceRecord["kind"]): AbsenceRecord => ({
  studentId,
  day,
  session: "ca_ngay",
  kind,
  reason: "",
});
const taken = (...days: string[]): TakenSession[] =>
  days.map((day) => ({ day, session: "ca_ngay" }));

describe("attendance", () => {
  const records = [
    rec("a", "2026-11-23", "khong_phep"),
    rec("a", "2026-11-25", "co_phep"),
    rec("a", "2026-11-26", "khong_phep"),
    rec("a", "2026-11-27", "co_phep"),
    rec("b", "2026-11-26", "di_muon"),
    rec("a", "2026-10-30", "khong_phep"),
  ];
  const days = taken("2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27");

  it("tallies only the range", () => {
    const t = tallies(["a", "b", "c"], records, weekRange("2026-11-26"));
    expect(t.get("a")).toEqual({ coPhep: 2, khongPhep: 2, diMuon: 0, absent: 4 });
    expect(t.get("b")).toEqual({ coPhep: 0, khongPhep: 0, diMuon: 1, absent: 0 });
    expect(t.get("c")?.absent).toBe(0);
  });

  it("counts the current run of absences, skipping untaken days", () => {
    expect(currentAbsenceRun("a", records, days, "2026-11-28")).toEqual({
      count: 3,
      since: "2026-11-25",
    });
    // a late arrival is not an absence
    expect(currentAbsenceRun("b", records, days, "2026-11-28").count).toBe(0);
  });

  it("raises alerts from the teacher's thresholds", () => {
    const alerts = attendanceAlerts(
      ["a", "b"],
      records,
      days,
      { alertConsecutive: 3, alertUnexcusedMonth: 2 },
      "2026-11-28",
    );
    expect(alerts).toEqual([
      { kind: "consecutive", studentId: "a", count: 3, since: "2026-11-25" },
      { kind: "unexcused_month", studentId: "a", count: 2 },
    ]);
  });

  it("knows whether a day was taken for every session", () => {
    const two: TakenSession[] = [{ day: "2026-11-28", session: "sang" }];
    expect(dayTaken("2026-11-28", two, true)).toBe(false);
    expect(dayTaken("2026-11-28", [...two, { day: "2026-11-28", session: "chieu" }], true)).toBe(
      true,
    );
    expect(takenCount(days, weekRange("2026-11-26"))).toBe(5);
  });
});

describe("profiles", () => {
  const students = [
    { id: "1", fullName: "Nguyễn Văn An", birthDate: "2009-09-05", studentCode: "HS001" },
    { id: "2", fullName: "Trần Thị Bình", birthDate: "2009-03-17", studentCode: null },
    { id: "3", fullName: "Trần Thị Bình", birthDate: "2009-08-01", studentCode: null },
    { id: "4", fullName: "Lê Minh", birthDate: null, studentCode: null },
  ];
  it("matches rows by code, name + birth date, or a unique name", () => {
    const sheet = [
      [
        "Họ và tên",
        "Ngày sinh",
        "Mã HS",
        "Giới tính",
        "Dân tộc",
        "Người liên hệ chính",
        "SĐT",
        "Trạng thái",
      ],
      ["Nguyen Van An khac", "", "hs001", "Nam", "Kinh", "Nguyễn Văn Ba", 912345678, ""],
      ["Trần Thị Bình", "01/08/2009", "", "nữ", "", "", "", "Chuyển đến"],
      ["Trần Thị Bình", "", "", "", "", "", "", ""],
      ["Lê Minh", "", "", "khác", "", "", "", "đã nghỉ"],
      ["Phạm Không Có", "", "", "", "", "", "", ""],
    ];
    const r = parseProfileSheet(sheet, students);
    expect(r.rows.map((x) => x.studentId)).toEqual(["1", "3", "4"]);
    expect(r.rows[0]?.profile).toEqual({ gender: "nam", ethnicity: "Kinh" });
    expect(r.rows[0]?.guardian?.phone).toBe("0912345678");
    expect(r.rows[1]?.profile).toEqual({ gender: "nu", status: "chuyen_den" });
    expect(r.problems.map((p) => p.row)).toEqual([4, 5, 5, 6]);
  });
  it("keeps exactly one primary contact", () => {
    const g = { relation: "", phone: "", zalo: "" };
    expect(
      normalizeGuardians([
        { ...g, fullName: "A", isPrimary: false },
        { ...g, fullName: " ", isPrimary: true },
        { ...g, fullName: "B", isPrimary: false },
      ]).map((x) => x.isPrimary),
    ).toEqual([true, false]);
    expect(cleanPhone("0912 345 678")).toBe("0912345678");
  });
});
