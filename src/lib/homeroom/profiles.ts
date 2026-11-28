// Pure profile model for the homeroom module: field limits, statuses, and the profile
// spreadsheet (export columns + import that matches rows to existing students).
// Name, birth date and student code stay on exam_students (shared with exam accounts).
import { z } from "zod";
import { nameKey, stripMarks } from "@/lib/exam/accounts";
import { parseBirthDate, type RosterCell } from "@/lib/exam/roster";

export const STATUSES = ["dang_hoc", "chuyen_den", "chuyen_di", "nghi_hoc"] as const;
export type StudentStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<StudentStatus, string> = {
  dang_hoc: "Đang học",
  chuyen_den: "Chuyển đến",
  chuyen_di: "Chuyển đi",
  nghi_hoc: "Nghỉ học",
};
/** Students who count toward class size and attendance. */
export const isActive = (s: StudentStatus) => s === "dang_hoc" || s === "chuyen_den";

export type Gender = "nam" | "nu";
export const GENDER_LABEL: Record<Gender, string> = { nam: "Nam", nu: "Nữ" };

export const profileSchema = z.object({
  gender: z.enum(["nam", "nu"]).nullable(),
  ethnicity: z.string().trim().max(30),
  permanentAddress: z.string().trim().max(200),
  currentAddress: z.string().trim().max(200),
  classRole: z.string().trim().max(50),
  groupName: z.string().trim().max(30),
  seat: z.string().trim().max(10),
  careNote: z.string().trim().max(300),
  privateNote: z.string().trim().max(2000),
  status: z.enum(STATUSES),
  statusDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const guardianSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  relation: z.string().trim().max(30),
  phone: z.string().trim().max(20),
  zalo: z.string().trim().max(20),
  isPrimary: z.boolean(),
});
export type Guardian = z.infer<typeof guardianSchema>;

export const emptyProfile = (): Profile => ({
  gender: null,
  ethnicity: "",
  permanentAddress: "",
  currentAddress: "",
  classRole: "",
  groupName: "",
  seat: "",
  careNote: "",
  privateNote: "",
  status: "dang_hoc",
  statusDate: null,
});

/** Exactly one primary contact when there is anyone at all (the first, if none was marked). */
export function normalizeGuardians(list: Guardian[]): Guardian[] {
  const kept = list.filter((g) => g.fullName.trim());
  const primary = Math.max(
    0,
    kept.findIndex((g) => g.isPrimary),
  );
  return kept.map((g, i) => ({ ...g, isPrimary: i === primary }));
}

export function primaryGuardian(list: Guardian[]): Guardian | null {
  return list.find((g) => g.isPrimary) ?? list[0] ?? null;
}

/** Vietnamese class-list order: by given name (last word), then the full name. */
export function byGivenName<T extends { fullName: string }>(a: T, b: T): number {
  const given = (s: string) => s.trim().split(/\s+/).pop() ?? "";
  return (
    given(a.fullName).localeCompare(given(b.fullName), "vi") ||
    a.fullName.localeCompare(b.fullName, "vi")
  );
}

// ---------- spreadsheet ----------

/** Columns of the profile sheet, in order. Private and care notes are never exported. */
export const SHEET_COLUMNS = [
  "STT",
  "Họ và tên",
  "Ngày sinh",
  "Mã học sinh",
  "Giới tính",
  "Dân tộc",
  "Địa chỉ thường trú",
  "Nơi ở hiện tại",
  "Chức vụ",
  "Tổ",
  "Chỗ ngồi",
  "Trạng thái",
  "Người liên hệ chính",
  "Quan hệ",
  "Số điện thoại",
  "Zalo",
] as const;

type Col =
  | "name"
  | "birth"
  | "code"
  | "gender"
  | "ethnicity"
  | "permanent"
  | "current"
  | "role"
  | "group"
  | "seat"
  | "status"
  | "guardian"
  | "relation"
  | "phone"
  | "zalo";

function headerKey(cell: RosterCell): string {
  return typeof cell === "string"
    ? stripMarks(cell)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function columnOf(k: string): Col | null {
  if (/^(ho va ten|ho ten|ho va ten hoc sinh|hoc sinh)$/.test(k)) return "name";
  if (/^ngay sinh/.test(k)) return "birth";
  if (/^(ma hoc sinh|ma hs|ma dinh danh)$/.test(k)) return "code";
  if (/^gioi tinh$/.test(k)) return "gender";
  if (/^dan toc$/.test(k)) return "ethnicity";
  if (/^(dia chi thuong tru|thuong tru|dia chi)$/.test(k)) return "permanent";
  if (/^(noi o hien tai|cho o hien tai|dia chi hien tai|tam tru)$/.test(k)) return "current";
  if (/^(chuc vu|chuc vu trong lop)$/.test(k)) return "role";
  if (/^(to|nhom|to nhom)$/.test(k)) return "group";
  if (/^cho ngoi$/.test(k)) return "seat";
  if (/^trang thai$/.test(k)) return "status";
  if (/^(nguoi lien he chinh|nguoi lien he|phu huynh|ho ten phu huynh|cha me)$/.test(k))
    return "guardian";
  if (/^quan he$/.test(k)) return "relation";
  if (/^(so dien thoai|sdt|dien thoai|sdt phu huynh)$/.test(k)) return "phone";
  if (/^zalo$/.test(k)) return "zalo";
  return null;
}

const text = (c: RosterCell): string =>
  c === null || c === undefined ? "" : c instanceof Date ? "" : String(c).trim();

/** Phone numbers typed into Excel lose their leading 0 when stored as numbers. */
export function cleanPhone(c: RosterCell): string {
  if (typeof c === "number") {
    const s = String(Math.trunc(c));
    return s.length === 9 ? `0${s}` : s;
  }
  return text(c).replace(/[^\d+]/g, "");
}

export function parseGender(c: RosterCell): Gender | null | "invalid" {
  const k = headerKey(text(c));
  if (!k) return null;
  if (k === "nam" || k === "m") return "nam";
  if (k === "nu" || k === "f") return "nu";
  return "invalid";
}

export function parseStatus(c: RosterCell): StudentStatus | null {
  const k = headerKey(text(c));
  if (!k) return null;
  const hit = STATUSES.find((s) => headerKey(STATUS_LABEL[s]) === k);
  return hit ?? null;
}

export interface SheetStudent {
  id: string;
  fullName: string;
  birthDate: string | null;
  studentCode: string | null;
}

export interface ProfileImportRow {
  row: number;
  studentId: string;
  fullName: string;
  /** only the cells the sheet actually has */
  profile: Partial<Profile>;
  guardian: Guardian | null;
}

export interface ProfileImport {
  rows: ProfileImportRow[];
  problems: { row: number; message: string }[];
}

/**
 * Read a filled-in profile sheet. Rows are matched to existing students by student code,
 * then by name + birth date, then by name alone when it is unique; unmatched rows are reported.
 * Empty cells never erase saved data.
 */
export function parseProfileSheet(rows: RosterCell[][], students: SheetStudent[]): ProfileImport {
  const problems: ProfileImport["problems"] = [];
  let headerAt = -1;
  const cols = new Map<Col, number>();
  for (let r = 0; r < Math.min(rows.length, 15) && headerAt < 0; r++) {
    cols.clear();
    (rows[r] ?? []).forEach((cell, c) => {
      const col = columnOf(headerKey(cell));
      if (col && !cols.has(col)) cols.set(col, c);
    });
    if (cols.has("name")) headerAt = r;
  }
  if (headerAt < 0)
    return { rows: [], problems: [{ row: 1, message: 'Không thấy cột "Họ và tên"' }] };

  const byCode = new Map<string, SheetStudent>();
  const byName = new Map<string, SheetStudent[]>();
  for (const s of students) {
    if (s.studentCode) byCode.set(s.studentCode.trim().toLowerCase(), s);
    const k = nameKey(s.fullName);
    byName.set(k, [...(byName.get(k) ?? []), s]);
  }
  const cell = (row: RosterCell[], c: Col): RosterCell =>
    cols.has(c) ? row[cols.get(c)!] : undefined;

  const out: ProfileImportRow[] = [];
  const seen = new Set<string>();
  for (let r = headerAt + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = text(cell(row, "name"));
    if (!name) continue;
    const n = r + 1;
    const code = text(cell(row, "code")).toLowerCase();
    const birth = parseBirthDate(cell(row, "birth") ?? null);
    const same = byName.get(nameKey(name)) ?? [];
    const student =
      (code ? byCode.get(code) : undefined) ??
      (birth && birth !== "invalid" ? same.find((s) => s.birthDate === birth) : undefined) ??
      (same.length === 1 ? same[0] : undefined);
    if (!student) {
      problems.push({
        row: n,
        message:
          same.length > 1
            ? `${name}: có nhiều học sinh trùng tên, hãy điền mã học sinh hoặc ngày sinh`
            : `${name}: không có trong lớp (thêm học sinh ở trang Tài khoản học sinh trước)`,
      });
      continue;
    }
    if (seen.has(student.id)) {
      problems.push({ row: n, message: `${name}: trùng với một dòng phía trên` });
      continue;
    }
    seen.add(student.id);

    const profile: Partial<Profile> = {};
    const g = parseGender(cell(row, "gender"));
    if (g === "invalid")
      problems.push({ row: n, message: `${name}: giới tính phải là Nam hoặc Nữ` });
    else if (g) profile.gender = g;
    const put = <K extends keyof Profile>(k: K, c: Col, max: number) => {
      const v = text(cell(row, c));
      if (v) (profile as Record<string, unknown>)[k] = v.slice(0, max);
    };
    put("ethnicity", "ethnicity", 30);
    put("permanentAddress", "permanent", 200);
    put("currentAddress", "current", 200);
    put("classRole", "role", 50);
    put("groupName", "group", 30);
    put("seat", "seat", 10);
    const st = cell(row, "status");
    if (text(st)) {
      const s = parseStatus(st);
      if (s) profile.status = s;
      else problems.push({ row: n, message: `${name}: trạng thái "${text(st)}" không hợp lệ` });
    }
    const gName = text(cell(row, "guardian"));
    const guardian: Guardian | null = gName
      ? {
          fullName: gName.slice(0, 100),
          relation: text(cell(row, "relation")).slice(0, 30),
          phone: cleanPhone(cell(row, "phone")).slice(0, 20),
          zalo: cleanPhone(cell(row, "zalo")).slice(0, 20),
          isPrimary: true,
        }
      : null;
    out.push({ row: n, studentId: student.id, fullName: student.fullName, profile, guardian });
  }
  return { rows: out, problems };
}
