import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { bookColumnsFrom, fillSmasSheet, readSmasSheet } from "./smas";
import { exportFills, planImport } from "./smas-plan";
import {
  DEFAULT_RULE,
  adjusted,
  defaultColumns,
  effectiveValues,
  parseScore,
  round1,
  suggestBonus,
  termAverage,
  yearAverage,
} from "./scores";

const fixture = () =>
  new Uint8Array(
    readFileSync(resolve(process.cwd(), "src/lib/gradebook/__fixtures__/smas-mau.xlsx")),
  );

describe("SMAS sheet", () => {
  it("reads class, subject, term, columns and students", () => {
    const s = readSmasSheet(fixture());
    expect(s.className).toBe("11A1");
    expect(s.subject).toBe("Toán");
    expect(s.schoolYear).toBe("2026-2027");
    expect(s.semester).toBe(1);
    expect(s.columns.map((c) => `${c.col}:${c.kind}:${c.label}`)).toEqual([
      "E:tx:TX1",
      "F:tx:TX2",
      "G:tx:TX3",
      "H:tx:TX4",
      "I:gk:GK",
      "J:ck:CK",
      "L:nx:Nhận xét",
    ]);
    expect(s.rows.map((r) => [r.row, r.code, r.fullName, r.values["E"]])).toEqual([
      [14, "90000000-00-0001", "Nguyễn Văn An", 8.5],
      [15, "90000000-00-0002", "Trần Thị Bình", 6],
      [16, "90000000-00-0003", "Lê Minh Châu", 9.5],
    ]);
    expect(bookColumnsFrom(s).map((c) => c.key)).toEqual([
      "tx1",
      "tx2",
      "tx3",
      "tx4",
      "gk",
      "ck",
      "nx",
    ]);
  });

  it("fills scores into the same file without touching formulas or hidden ids", () => {
    const bytes = fixture();
    const s = readSmasSheet(bytes);
    const out = fillSmasSheet(bytes, s.sheetPath, [
      { row: 14, col: "F", value: 7.25 },
      { row: 14, col: "L", value: "Tích cực phát biểu" },
      { row: 15, col: "E", value: null },
      { row: 14, col: "K", value: 1 },
    ]);
    const again = readSmasSheet(out);
    expect(again.rows[0]?.values).toMatchObject({ E: 8.5, F: 7.25, L: "Tích cực phát biểu" });
    expect(again.rows[1]?.values["E"]).toBe(null);
    expect(again.rows[0]?.smasId).toBe(s.rows[0]?.smasId);
    const xml = new TextDecoder().decode(
      // the formula in K stays
      unzipSync(out)[s.sheetPath]!,
    );
    expect(xml).toContain("<f>IF(COUNTBLANK(E14:J14)=0");
    expect(xml).toContain('ref="A1:N16"');
  });

  it("rejects files that are not SMAS score sheets", () => {
    expect(() => readSmasSheet(new Uint8Array([1, 2, 3]))).toThrow(/SMAS/);
  });
});

describe("scores", () => {
  const cols = defaultColumns(4);
  it("parses typed scores", () => {
    expect(parseScore("8,5")).toBe(8.5);
    expect(parseScore(" 10 ")).toBe(10);
    expect(parseScore("")).toBe(null);
    expect(parseScore("10.5")).toBe("invalid");
    expect(parseScore("7.255")).toBe("invalid");
  });
  it("computes the term average like SMAS (half away from zero)", () => {
    const v = { tx1: 8, tx2: 7, tx3: 9, tx4: 6, gk: 7, ck: 8 };
    // (8+7+9+6 + 14 + 24)/9 = 68/9 = 7.555… → 7.6
    expect(termAverage(cols, v)).toEqual({ average: 7.6, complete: true });
    expect(termAverage(cols, { tx1: 8, gk: 7, ck: 8 })).toEqual({ average: 7.7, complete: false });
    expect(termAverage(cols, { tx1: 8, gk: 7 }).average).toBe(null);
    expect(round1(7.25)).toBe(7.3);
    expect(round1(8.05)).toBe(8.1);
    expect(yearAverage(6.5, 7.1)).toBe(6.9);
  });
  it("applies the bonus only to the chosen column, inside 0–10", () => {
    expect(adjusted(9.5, { plus: 1, minus: 0 })).toBe(10);
    expect(adjusted(0.25, { plus: 0, minus: 0.5 })).toBe(0);
    const e = effectiveValues(cols, { tx1: 7, tx2: 6 }, { plus: 0.5, minus: 0 }, "tx2");
    expect(e).toMatchObject({ tx1: 7, tx2: 6.5, gk: null });
  });
  it("suggests a bonus from counts", () => {
    const r = { ...DEFAULT_RULE, enabled: true };
    expect(suggestBonus({ phat_bieu: 7, lam_tot: 4, khong_lam_bai: 2 }, r)).toEqual({
      plus: 1,
      minus: 0,
    });
    expect(suggestBonus({ khong_lam_bai: 3, khong_chuan_bi: 3 }, r)).toEqual({ plus: 0, minus: 1 });
  });
});

describe("SMAS import/export plan", () => {
  it("matches by code, then a unique name, and plans cells and codes", () => {
    const s = readSmasSheet(fixture());
    const cols = bookColumnsFrom(s);
    const plan = planImport(s, cols, [
      { id: "a", fullName: "Nguyễn Văn An", studentCode: "90000000-00-0001" },
      { id: "b", fullName: "Trần Thị  Bình", studentCode: null },
      { id: "x", fullName: "Người Khác", studentCode: null },
    ]);
    expect(plan.matches.map((m) => [m.studentId, m.how])).toEqual([
      ["a", "code"],
      ["b", "name"],
      [null, null],
    ]);
    expect(plan.setCodes).toEqual([{ studentId: "b", code: "90000000-00-0002" }]);
    expect(plan.cells).toEqual([
      { studentId: "a", key: "tx1", num: 8.5, txt: null },
      { studentId: "b", key: "tx1", num: 6, txt: null },
    ]);
    expect(plan.columnMap).toMatchObject({ tx1: "E", gk: "I", ck: "J", nx: "L" });
  });

  it("exports effective scores into mapped rows", () => {
    const cols = defaultColumns(2);
    const fills = exportFills(
      {
        columns: cols,
        bonusTarget: "tx2",
        scores: [
          { studentId: "a", key: "tx1", num: 8, txt: null },
          { studentId: "a", key: "tx2", num: 7, txt: null },
          { studentId: "a", key: "nx", num: null, txt: "Tốt" },
        ],
        bonus: [{ studentId: "a", plus: 1, minus: 0.5 }],
      },
      {
        columns: { tx1: "E", tx2: "F", gk: "I", nx: "L" },
        rows: [
          { row: 14, studentId: "a" },
          { row: 15, studentId: null },
        ],
      },
    );
    expect(fills).toEqual([
      { row: 14, col: "E", value: 8 },
      { row: 14, col: "F", value: 7.5 },
      { row: 14, col: "I", value: null },
      { row: 14, col: "L", value: "Tốt" },
    ]);
  });
});
