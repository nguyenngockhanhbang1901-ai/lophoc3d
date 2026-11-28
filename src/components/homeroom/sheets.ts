// Browser-side spreadsheet and print helpers for the homeroom pages.
import { displayDate } from "@/lib/exam/roster";
import type { RosterCell } from "@/lib/exam/roster";
import {
  GENDER_LABEL,
  SHEET_COLUMNS,
  STATUS_LABEL,
  primaryGuardian,
} from "@/lib/homeroom/profiles";
import type { StudentProfile } from "@/lib/homeroom/homeroom.functions";

const header = (value: string) => ({
  value,
  fontWeight: "bold" as const,
  backgroundColor: "#E8EEF7",
});

export function fileSafe(text: string): string {
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

export async function readSheetFile(file: File): Promise<RosterCell[][]> {
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(file)) as RosterCell[][];
}

/** Profile sheet: the same columns the import reads, so a teacher can fill it in and re-import. */
export async function downloadProfiles(className: string, students: StudentProfile[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const rows = students.map((s, i) => {
    const g = primaryGuardian(s.guardians);
    const p = s.profile;
    return [
      i + 1,
      s.fullName,
      displayDate(s.birthDate),
      s.studentCode ?? "",
      p.gender ? GENDER_LABEL[p.gender] : "",
      p.ethnicity,
      p.permanentAddress,
      p.currentAddress,
      p.classRole,
      p.groupName,
      p.seat,
      STATUS_LABEL[p.status],
      g?.fullName ?? "",
      g?.relation ?? "",
      g?.phone ?? "",
      g?.zalo ?? "",
    ];
  });
  await writeXlsxFile([SHEET_COLUMNS.map((c) => header(c)), ...rows], {
    columns: [6, 26, 12, 12, 9, 10, 30, 30, 14, 8, 9, 12, 24, 10, 14, 14].map((width) => ({
      width,
    })),
    sheet: "Hồ sơ",
  }).toFile(`ho-so-${fileSafe(className)}.xlsx`);
}

export async function downloadTable(
  fileName: string,
  sheet: string,
  head: string[],
  rows: (string | number)[][],
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile([head.map((h) => header(h)), ...rows], {
    columns: head.map((h, i) => ({ width: i === 1 ? 26 : Math.max(8, h.length + 2) })),
    sheet,
  }).toFile(fileName);
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Open a printable page with one table. Returns false when the browser blocked the window. */
export function printTable(
  title: string,
  subtitle: string,
  head: string[],
  rows: (string | number)[][],
): boolean {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;margin:12mm;color:#111;font-size:12px}
  h1{font-size:17px;margin:0 0 2px;text-align:center}p{margin:0 0 10px;text-align:center;color:#444}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #666;padding:4px 6px;text-align:left}
  th{background:#eef2f8}td.n{text-align:center}@media print{body{margin:8mm}}</style></head><body>
  <h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td${typeof c === "number" ? ' class="n"' : ""}>${esc(String(c))}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

/** Several titled tables, one per printed page (e.g. a progress sheet per student). */
export function printPages(
  title: string,
  pages: { heading: string; subtitle: string; head: string[]; rows: (string | number)[][] }[],
): boolean {
  const body = pages
    .map(
      (p) =>
        `<section><h1>${esc(p.heading)}</h1><p>${esc(p.subtitle)}</p><table><thead><tr>${p.head
          .map((h) => `<th>${esc(h)}</th>`)
          .join("")}</tr></thead><tbody>${p.rows
          .map((r) => `<tr>${r.map((c) => `<td>${esc(String(c))}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></section>`,
    )
    .join("");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;margin:12mm;color:#111;font-size:13px}
  section{break-after:page;margin-bottom:24px}section:last-child{break-after:auto}
  h1{font-size:17px;margin:0 0 2px;text-align:center}p{margin:0 0 10px;text-align:center;color:#444}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #666;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#eef2f8}td:first-child{width:28%;font-weight:bold}@media print{body{margin:8mm}}</style></head><body>
  ${body}<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
