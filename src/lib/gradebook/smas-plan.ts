// Pure planning between a SMAS sheet and a book: which sheet row is which student, which
// cells to import, and which cells to write back when exporting.
import { nameKey } from "@/lib/exam/accounts";
import type { BookColumn, Bonus } from "./scores";
import { effectiveValues, isNumeric } from "./scores";
import type { Fill, SmasSheet } from "./smas";

export interface ClassStudent {
  id: string;
  fullName: string;
  studentCode: string | null;
}

export interface RowMatch {
  row: number;
  fullName: string;
  code: string;
  studentId: string | null;
  how: "code" | "name" | null;
}

export interface ImportPlan {
  matches: RowMatch[];
  cells: { studentId: string; key: string; num: number | null; txt: string | null }[];
  /** students matched by name that have no code yet: give them SMAS's code */
  setCodes: { studentId: string; code: string }[];
  /** sheet column letter by book column key */
  columnMap: Record<string, string>;
}

export function planImport(
  sheet: SmasSheet,
  columns: BookColumn[],
  students: ClassStudent[],
): ImportPlan {
  const byCode = new Map(
    students.filter((s) => s.studentCode).map((s) => [s.studentCode!.trim().toLowerCase(), s]),
  );
  const byName = new Map<string, ClassStudent[]>();
  for (const s of students)
    byName.set(nameKey(s.fullName), [...(byName.get(nameKey(s.fullName)) ?? []), s]);
  const used = new Set<string>();
  const columnMap: Record<string, string> = {};
  sheet.columns.forEach((c, i) => {
    const key = columns[i]?.key;
    if (key) columnMap[key] = c.col;
  });

  const matches: RowMatch[] = [];
  const setCodes: ImportPlan["setCodes"] = [];
  for (const r of sheet.rows) {
    let s = r.code ? byCode.get(r.code.toLowerCase()) : undefined;
    let how: RowMatch["how"] = s ? "code" : null;
    if (!s) {
      const same = (byName.get(nameKey(r.fullName)) ?? []).filter((x) => !used.has(x.id));
      if (same.length === 1) {
        s = same[0];
        how = "name";
        if (s && !s.studentCode && r.code) setCodes.push({ studentId: s.id, code: r.code });
      }
    }
    if (s && used.has(s.id)) s = undefined;
    if (s) used.add(s.id);
    matches.push({
      row: r.row,
      fullName: r.fullName,
      code: r.code,
      studentId: s?.id ?? null,
      how: s ? how : null,
    });
  }

  const cells: ImportPlan["cells"] = [];
  sheet.rows.forEach((r, i) => {
    const id = matches[i]?.studentId;
    if (!id) return;
    for (const col of columns) {
      const letter = columnMap[col.key];
      if (!letter) continue;
      const v = r.values[letter];
      if (v === null || v === undefined || v === "") continue;
      if (isNumeric(col)) {
        const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
        if (Number.isFinite(n) && n >= 0 && n <= 10)
          cells.push({ studentId: id, key: col.key, num: Math.round(n * 100) / 100, txt: null });
      } else {
        cells.push({ studentId: id, key: col.key, num: null, txt: String(v).trim().slice(0, 255) });
      }
    }
  });
  return { matches, cells, setCodes, columnMap };
}

export interface ExportSource {
  columns: BookColumn[];
  bonusTarget: string | null;
  scores: { studentId: string; key: string; num: number | null; txt: string | null }[];
  bonus: { studentId: string; plus: number; minus: number }[];
}

/** Cells to write into the SMAS file: effective scores (bonus applied) and texts, blanks cleared. */
export function exportFills(
  src: ExportSource,
  map: { columns: Record<string, string>; rows: { row: number; studentId: string | null }[] },
): Fill[] {
  const byStudent = new Map<
    string,
    { num: Record<string, number | null>; txt: Record<string, string | null> }
  >();
  for (const s of src.scores) {
    const e = byStudent.get(s.studentId) ?? { num: {}, txt: {} };
    e.num[s.key] = s.num;
    e.txt[s.key] = s.txt;
    byStudent.set(s.studentId, e);
  }
  const bonus = new Map<string, Bonus>(src.bonus.map((b) => [b.studentId, b]));
  const fills: Fill[] = [];
  for (const r of map.rows) {
    if (!r.studentId) continue;
    const e = byStudent.get(r.studentId) ?? { num: {}, txt: {} };
    const eff = effectiveValues(src.columns, e.num, bonus.get(r.studentId), src.bonusTarget);
    for (const c of src.columns) {
      const col = map.columns[c.key];
      if (!col) continue;
      fills.push({
        row: r.row,
        col,
        value: isNumeric(c) ? (eff[c.key] ?? null) : (e.txt[c.key] ?? null),
      });
    }
  }
  return fills;
}
