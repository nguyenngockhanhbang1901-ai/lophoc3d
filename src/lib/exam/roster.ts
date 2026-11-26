// Reading a class list from spreadsheet rows (already parsed by read-excel-file).
// Finds the header row, maps columns by their Vietnamese names, and reports every
// problem by row number before anything is saved.
import { cleanFullName, nameKey, stripMarks } from "./accounts";

export type RosterCell = string | number | boolean | Date | null | undefined;

export interface RosterStudent {
  /** 1-based row number in the sheet, for messages */
  row: number;
  fullName: string;
  /** ISO date YYYY-MM-DD */
  birthDate: string | null;
  studentCode: string | null;
}

export interface RosterProblem {
  row: number;
  message: string;
}

export interface RosterResult {
  students: RosterStudent[];
  problems: RosterProblem[];
}

export interface ExistingStudent {
  fullName: string;
  birthDate: string | null;
  studentCode: string | null;
}

type Column = "full" | "family" | "given" | "birth" | "code";

function headerKey(cell: RosterCell): string {
  return typeof cell === "string"
    ? stripMarks(cell)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function columnOf(key: string): Column | null {
  if (!key) return null;
  if (/^(ho va ten|ho ten|ho va ten hoc sinh|ten hoc sinh|hoc sinh|ho va ten hs)$/.test(key))
    return "full";
  if (/^(ho|ho dem|ho va ten dem|ho va dem|ho lot|ho va chu lot)$/.test(key)) return "family";
  if (key === "ten") return "given";
  if (/^ngay sinh|^ns$/.test(key)) return "birth";
  if (/^(ma hoc sinh|ma hs|ma dinh danh|ma so|ma so hoc sinh|mshs|ma)$/.test(key)) return "code";
  return null;
}

function findHeader(rows: RosterCell[][]): { index: number; columns: Map<Column, number> } | null {
  const limit = Math.min(rows.length, 15);
  for (let r = 0; r < limit; r++) {
    const columns = new Map<Column, number>();
    (rows[r] ?? []).forEach((cell, c) => {
      const col = columnOf(headerKey(cell));
      if (col && !columns.has(col)) columns.set(col, c);
    });
    if (columns.has("full") || columns.has("given")) return { index: r, columns };
  }
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Birth date from a cell: Date, Excel serial number, or text dd/mm/yyyy (also - or .). */
export function parseBirthDate(cell: RosterCell): string | null | "invalid" {
  if (cell === null || cell === undefined || cell === "") return null;
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return "invalid";
    return validDate(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate()) ?? "invalid";
  }
  if (typeof cell === "number") {
    // Excel serial date (1900 system): day 25569 = 1970-01-01
    const ms = Math.round((cell - 25569) * 86400000);
    const d = new Date(ms);
    return validDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) ?? "invalid";
  }
  const text = String(cell).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1])) ?? "invalid";
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3])) ?? "invalid";
  return "invalid";
}

function text(cell: RosterCell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return "";
  return String(cell).trim();
}

/** Two entries are the same student when the names match and the birth dates match (or both are missing). */
function duplicateKey(fullName: string, birthDate: string | null): string {
  return `${nameKey(fullName)}|${birthDate ?? ""}`;
}

export function displayDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function parseRoster(rows: RosterCell[][], existing: ExistingStudent[] = []): RosterResult {
  const header = findHeader(rows);
  if (!header) {
    return {
      students: [],
      problems: [
        {
          row: 1,
          message: 'Không tìm thấy cột "Họ và tên" (hoặc hai cột "Họ" và "Tên") trong 15 dòng đầu',
        },
      ],
    };
  }
  const { columns } = header;
  const students: RosterStudent[] = [];
  const problems: RosterProblem[] = [];
  const seen = new Map<string, number>();
  const seenCodes = new Map<string, number>();
  for (const s of existing) {
    seen.set(duplicateKey(s.fullName, s.birthDate), 0);
    if (s.studentCode) seenCodes.set(s.studentCode.toLowerCase(), 0);
  }
  const at = (row: RosterCell[], col: Column) => {
    const i = columns.get(col);
    return i === undefined ? undefined : row[i];
  };

  for (let r = header.index + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const rowNumber = r + 1;
    if (row.every((c) => text(c) === "" && !(c instanceof Date))) continue;
    const full = columns.has("full")
      ? text(at(row, "full"))
      : [text(at(row, "family")), text(at(row, "given"))].filter(Boolean).join(" ");
    const fullName = cleanFullName(full);
    const birth = parseBirthDate(at(row, "birth"));
    const code = text(at(row, "code")) || null;

    if (!fullName) {
      // A numbered row with nothing else (STT only) is a blank line, not an error.
      const others = row.filter((c, i) => i !== columns.get("birth") && text(c) !== "");
      if (others.length <= 1 && birth === null && !code) continue;
      problems.push({ row: rowNumber, message: "Thiếu họ tên" });
      continue;
    }
    if (fullName.length > 100) {
      problems.push({ row: rowNumber, message: "Họ tên dài quá 100 ký tự" });
      continue;
    }
    if (birth === "invalid") {
      problems.push({
        row: rowNumber,
        message: `Ngày sinh không đọc được: "${text(at(row, "birth"))}" (dùng dạng ngày/tháng/năm)`,
      });
      continue;
    }
    if (code && code.length > 30) {
      problems.push({ row: rowNumber, message: "Mã học sinh dài quá 30 ký tự" });
      continue;
    }
    const key = duplicateKey(fullName, birth);
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      problems.push({
        row: rowNumber,
        message:
          earlier === 0
            ? `Trùng với học sinh đã có trong lớp: ${fullName}${birth ? ", " + displayDate(birth) : ""}`
            : `Trùng với dòng ${earlier}: ${fullName}${birth ? ", " + displayDate(birth) : ""}`,
      });
      continue;
    }
    if (code) {
      const codeEarlier = seenCodes.get(code.toLowerCase());
      if (codeEarlier !== undefined) {
        problems.push({
          row: rowNumber,
          message:
            codeEarlier === 0
              ? `Mã học sinh ${code} đã có trong lớp`
              : `Mã học sinh ${code} trùng với dòng ${codeEarlier}`,
        });
        continue;
      }
      seenCodes.set(code.toLowerCase(), rowNumber);
    }
    seen.set(key, rowNumber);
    students.push({ row: rowNumber, fullName, birthDate: birth, studentCode: code });
  }
  if (!students.length && !problems.length)
    problems.push({
      row: header.index + 1,
      message: "Danh sách không có học sinh nào dưới dòng tiêu đề",
    });
  return { students, problems };
}
