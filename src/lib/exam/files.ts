// Browser-side spreadsheet and print helpers for class lists and account slips.
import type { RosterCell } from "./roster";
import { displayDate } from "./roster";

export interface AccountSlip {
  fullName: string;
  birthDate: string | null;
  username: string;
  /** null when the teacher cannot see it (print a note to ask the teacher) */
  password: string | null;
}

export interface ClassListRow {
  fullName: string;
  birthDate: string | null;
  studentCode: string | null;
  username: string;
  password: string | null;
  passwordByStudent: boolean;
  locked: boolean;
}

function safeFileName(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^A-Za-z0-9-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "lop"
  );
}

const header = (text: string) => ({
  value: text,
  fontWeight: "bold" as const,
  backgroundColor: "#E8EEF7",
});

export async function readRosterFile(file: File): Promise<RosterCell[][]> {
  const { readSheet } = await import("read-excel-file/browser");
  // First sheet of the workbook, as rows of cells (dates come back as Date objects).
  return (await readSheet(file)) as RosterCell[][];
}

export async function downloadTemplate(): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(
    [
      [header("STT"), header("Họ và tên"), header("Ngày sinh"), header("Mã học sinh")],
      [1, "Nguyễn Văn An", "05/09/2009", "HS001"],
      [2, "Trần Thị Bình", "17/03/2009", ""],
    ],
    { columns: [{ width: 6 }, { width: 30 }, { width: 14 }, { width: 16 }], sheet: "Danh sách" },
  ).toFile("mau-danh-sach-hoc-sinh.xlsx");
}

/** The class list with usernames and current passwords, for the teacher to keep or hand out. */
export async function downloadClassList(className: string, rows: ClassListRow[]): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(
    [
      [
        header("STT"),
        header("Họ và tên"),
        header("Ngày sinh"),
        header("Mã học sinh"),
        header("Tên đăng nhập"),
        header("Mật khẩu"),
        header("Ghi chú"),
      ],
      ...rows.map((s, i) => [
        i + 1,
        s.fullName,
        displayDate(s.birthDate),
        s.studentCode ?? "",
        s.username,
        s.password ?? "",
        [s.passwordByStudent ? "HS tự đổi mật khẩu" : "", s.locked ? "Đã khóa" : ""]
          .filter(Boolean)
          .join(", "),
      ]),
    ],
    {
      columns: [
        { width: 6 },
        { width: 30 },
        { width: 14 },
        { width: 16 },
        { width: 18 },
        { width: 16 },
        { width: 24 },
      ],
      sheet: "Danh sách",
    },
  ).toFile(`danh-sach-${safeFileName(className)}.xlsx`);
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/** A printable page of cut-out slips, one per student, opened in a new tab. */
export function printSlips(className: string, slips: AccountSlip[], siteUrl: string): boolean {
  const cards = slips
    .map(
      (s) => `
    <div class="slip">
      <div class="cls">${escapeHtml(className)}</div>
      <div class="name">${escapeHtml(s.fullName)}${s.birthDate ? ` <span>· ${displayDate(s.birthDate)}</span>` : ""}</div>
      <table><tr><td>Tên đăng nhập</td><td class="mono">${escapeHtml(s.username)}</td></tr>
      <tr><td>Mật khẩu</td><td class="mono">${s.password ? escapeHtml(s.password) : "(hỏi giáo viên)"}</td></tr></table>
      <div class="url">Đăng nhập tại ${escapeHtml(siteUrl)}</div>
    </div>`,
    )
    .join("");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu tài khoản · ${escapeHtml(className)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:12mm;color:#111}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
    .slip{border:1px dashed #888;padding:10px 12px;break-inside:avoid;font-size:13px}
    .cls{font-size:11px;color:#555}.name{font-weight:bold;font-size:15px;margin:2px 0 6px}.name span{font-weight:normal;color:#555;font-size:12px}
    td{padding:2px 10px 2px 0}.mono{font-family:Consolas,monospace;font-size:16px;font-weight:bold;letter-spacing:1px}
    .url{font-size:11px;color:#555;margin-top:4px}
    @media print{body{margin:8mm}.hint{display:none}}
  </style></head><body><p class="hint">Cắt theo đường viền nét đứt và phát cho từng học sinh.</p>
  <div class="grid">${cards}</div><script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
