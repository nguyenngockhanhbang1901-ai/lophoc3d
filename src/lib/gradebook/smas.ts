// SMAS score sheet ("SDGHS_<lớp>_<năm>_<kỳ>.xlsx", the file SMAS gives a subject teacher to fill
// in and import back). Reading finds the class, subject, term, the score columns (from SMAS's
// hidden JSON header row) and every student row. Writing puts scores into that same file —
// only the value cells change, so hidden ids, formulas and SMAS's checks stay exactly as SMAS
// made them and the file can be imported back into SMAS.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { BookColumn, ColumnKind } from "./scores";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

export interface SmasColumn {
  /** column letter in the sheet, e.g. "E" */
  col: string;
  kind: ColumnKind;
  code: string;
  label: string;
}

export interface SmasRow {
  /** 1-based sheet row */
  row: number;
  smasId: string;
  code: string;
  fullName: string;
  /** values already in the file, by column letter */
  values: Record<string, number | string | null>;
}

export interface SmasSheet {
  sheetPath: string;
  className: string;
  schoolYear: string;
  subject: string;
  semester: 1 | 2;
  columns: SmasColumn[];
  rows: SmasRow[];
}

type Cells = Map<string, Element>;

function colLetters(ref: string): string {
  return ref.replace(/\d+/g, "");
}

function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  return Array.from(el.getElementsByTagNameNS(NS, "t"))
    .map((t) => t.textContent ?? "")
    .join("");
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text.replace(/^\uFEFF/, ""), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("File Excel bị hỏng");
  return doc;
}

function sheetPathOf(files: Record<string, Uint8Array>): string {
  const wb = files["xl/workbook.xml"];
  const rels = files["xl/_rels/workbook.xml.rels"];
  if (wb && rels) {
    const first = parseXml(strFromU8(wb)).getElementsByTagNameNS(NS, "sheet")[0];
    const rid = first?.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "id",
    );
    const rel = Array.from(parseXml(strFromU8(rels)).getElementsByTagName("Relationship")).find(
      (r) => r.getAttribute("Id") === rid,
    );
    const target = rel?.getAttribute("Target");
    if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }
  return "xl/worksheets/sheet1.xml";
}

function sharedStrings(files: Record<string, Uint8Array>): string[] {
  const f = files["xl/sharedStrings.xml"];
  if (!f) return [];
  return Array.from(parseXml(strFromU8(f)).getElementsByTagNameNS(NS, "si")).map((si) =>
    textOf(si),
  );
}

function cellValue(c: Element, shared: string[]): number | string | null {
  const t = c.getAttribute("t");
  const v = c.getElementsByTagNameNS(NS, "v")[0]?.textContent ?? null;
  if (t === "s") return v === null ? null : (shared[Number(v)] ?? "");
  if (t === "inlineStr") return textOf(c.getElementsByTagNameNS(NS, "is")[0]) || null;
  if (t === "str" || t === "b" || t === "e") return v;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function readRows(doc: Document): Map<number, Cells> {
  const rows = new Map<number, Cells>();
  for (const r of Array.from(doc.getElementsByTagNameNS(NS, "row"))) {
    const n = Number(r.getAttribute("r"));
    const cells: Cells = new Map();
    for (const c of Array.from(r.getElementsByTagNameNS(NS, "c"))) {
      const ref = c.getAttribute("r");
      if (ref) cells.set(colLetters(ref), c);
    }
    rows.set(n, cells);
  }
  return rows;
}

interface PointJson {
  PointCode?: string;
  PointName?: string;
  PointType?: number;
  PointGroupCode?: string;
}

function kindOf(p: PointJson): ColumnKind | null {
  const group = (p.PointGroupCode ?? "").toUpperCase();
  const code = (p.PointCode ?? "").toUpperCase();
  if (p.PointType === 2) return null; // computed average
  if (p.PointType === 4 || code.startsWith("NHANXET")) return "nx";
  if (p.PointType === 3 || group.includes("NHANXET") || group.includes("DANHGIA")) return "dg";
  if (group.startsWith("DDGTX")) return "tx";
  if (group.startsWith("DDGGK")) return "gk";
  if (group.startsWith("DDGCK")) return "ck";
  return null;
}

function label(kind: ColumnKind, p: PointJson, nth: number): string {
  if (kind === "tx") return `TX${nth}`;
  if (kind === "gk") return "GK";
  if (kind === "ck") return "CK";
  if (kind === "nx") return "Nhận xét";
  return (p.PointName ?? `ĐG${nth}`).slice(0, 30);
}

export function unzipXlsx(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes);
  } catch {
    throw new Error("Không mở được file. Hãy chọn đúng file .xlsx tải từ SMAS.");
  }
}

export function readSmasSheet(bytes: Uint8Array): SmasSheet {
  const files = unzipXlsx(bytes);
  const sheetPath = sheetPathOf(files);
  const sheetFile = files[sheetPath];
  if (!sheetFile) throw new Error("File không có trang tính");
  const shared = sharedStrings(files);
  const rows = readRows(parseXml(strFromU8(sheetFile)));
  const val = (r: number, c: string) => {
    const cell = rows.get(r)?.get(c);
    return cell ? cellValue(cell, shared) : null;
  };

  // SMAS's hidden JSON row describes each score column.
  let jsonRow = -1;
  const columns: SmasColumn[] = [];
  const counter: Partial<Record<ColumnKind, number>> = {};
  for (const [n, cells] of rows) {
    const found: { col: string; kind: ColumnKind; p: PointJson }[] = [];
    for (const [col, cell] of cells) {
      const v = cellValue(cell, shared);
      if (typeof v !== "string" || !v.startsWith("{") || !v.includes("PointCode")) continue;
      try {
        const p = JSON.parse(v) as PointJson;
        const kind = kindOf(p);
        if (kind) found.push({ col, kind, p });
      } catch {
        /* not a SMAS header cell */
      }
    }
    if (found.length) {
      jsonRow = n;
      found.sort((a, b) => a.col.length - b.col.length || (a.col < b.col ? -1 : 1));
      for (const f of found) {
        counter[f.kind] = (counter[f.kind] ?? 0) + 1;
        columns.push({
          col: f.col,
          kind: f.kind,
          code: f.p.PointCode ?? f.col,
          label: label(f.kind, f.p, counter[f.kind]!),
        });
      }
      break;
    }
  }
  if (jsonRow < 0 || !columns.some((c) => c.kind !== "nx"))
    throw new Error(
      "Không nhận ra cột điểm. Hãy dùng file Excel tải từ SMAS (Sổ điểm → Xuất Excel).",
    );

  // Header row: the one naming "Họ và tên"; it also tells where codes and SMAS ids are.
  let nameCol = "D";
  let codeCol = "C";
  let idCol = "B";
  let headerRow = jsonRow + 1;
  for (let n = jsonRow + 1; n <= jsonRow + 3; n++) {
    for (const [col, cell] of rows.get(n) ?? []) {
      const v = String(cellValue(cell, shared) ?? "")
        .trim()
        .toLowerCase();
      if (v === "họ và tên" || v === "họ tên") {
        nameCol = col;
        headerRow = n;
      } else if (v === "mã học sinh" || v === "mã hs") codeCol = col;
      else if (v === "studentid") idCol = col;
    }
  }

  const out: SmasRow[] = [];
  const last = Math.max(...rows.keys());
  for (let n = headerRow + 1; n <= last; n++) {
    const name = String(val(n, nameCol) ?? "").trim();
    const smasId = String(val(n, idCol) ?? "").trim();
    if (!name || !smasId) continue;
    const values: SmasRow["values"] = {};
    for (const c of columns) values[c.col] = val(n, c.col);
    out.push({
      row: n,
      smasId,
      code: String(val(n, codeCol) ?? "").trim(),
      fullName: name,
      values,
    });
  }
  if (!out.length) throw new Error("File không có danh sách học sinh");

  // Row 1 (hidden) carries class, year, subject and term; the visible titles are the fallback.
  const meta = Array.from(rows.get(1)?.keys() ?? []).map((c) => val(1, c));
  const titles = Array.from(rows.values())
    .slice(0, jsonRow)
    .flatMap((cells) => Array.from(cells.values()).map((c) => String(cellValue(c, shared) ?? "")));
  const title = titles.find((t) => /ĐÁNH GIÁ MÔN/i.test(t)) ?? "";
  const termLine = titles.find((t) => /Học kỳ/i.test(t)) ?? "";
  const subject =
    (typeof meta[11] === "string" && meta[11]) ||
    title.match(/MÔN\s+(.+?)\s+-\s+LỚP/i)?.[1]?.trim() ||
    "";
  const className =
    (typeof meta[3] === "string" && meta[3]) || title.match(/LỚP\s+(\S+)/i)?.[1] || "";
  const schoolYear =
    (typeof meta[5] === "string" && meta[5]) || termLine.match(/(\d{4}\s*-\s*\d{4})/)?.[1] || "";
  const semester: 1 | 2 = meta[12] === 2 || /Học kỳ\s+II\b/i.test(termLine) ? 2 : 1;

  return {
    sheetPath,
    className: String(className),
    schoolYear: String(schoolYear).replace(/\s/g, ""),
    subject: subjectName(String(subject)),
    semester,
    columns,
    rows: out,
  };
}

/** "TOÁN" / "Toán" → "Toán". */
function subjectName(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

/** Book columns made from the SMAS sheet (keys stable per column kind and order). */
export function bookColumnsFrom(sheet: SmasSheet): BookColumn[] {
  const n: Partial<Record<ColumnKind, number>> = {};
  return sheet.columns.map((c) => {
    n[c.kind] = (n[c.kind] ?? 0) + 1;
    const key =
      c.kind === "gk" || c.kind === "ck" || c.kind === "nx"
        ? n[c.kind] === 1
          ? c.kind
          : `${c.kind}${n[c.kind]}`
        : `${c.kind}${n[c.kind]}`;
    return { key, kind: c.kind, label: c.label, smasCode: c.code };
  });
}

export type Fill = { row: number; col: string; value: number | string | null };

function setCell(doc: Document, rowEl: Element, ref: string, value: number | string | null) {
  let cell = Array.from(rowEl.getElementsByTagNameNS(NS, "c")).find(
    (c) => c.getAttribute("r") === ref,
  );
  if (!cell) {
    cell = doc.createElementNS(NS, "c");
    cell.setAttribute("r", ref);
    // keep cells in column order
    const col = colLetters(ref);
    const after = Array.from(rowEl.getElementsByTagNameNS(NS, "c")).find((c) => {
      const other = colLetters(c.getAttribute("r") ?? "");
      return other.length > col.length || (other.length === col.length && other > col);
    });
    rowEl.insertBefore(cell, after ?? null);
  }
  if (cell.getElementsByTagNameNS(NS, "f").length) return; // never overwrite formulas
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  cell.removeAttribute("t");
  if (value === null || value === "") return;
  if (typeof value === "number") {
    const v = doc.createElementNS(NS, "v");
    v.textContent = String(value);
    cell.appendChild(v);
  } else {
    cell.setAttribute("t", "inlineStr");
    const is = doc.createElementNS(NS, "is");
    const t = doc.createElementNS(NS, "t");
    t.textContent = value.slice(0, 255);
    is.appendChild(t);
    cell.appendChild(is);
  }
}

/** The same SMAS file with the given cells filled in (everything else byte-for-byte kept). */
export function fillSmasSheet(bytes: Uint8Array, sheetPath: string, fills: Fill[]): Uint8Array {
  const files = unzipXlsx(bytes);
  const sheet = files[sheetPath];
  if (!sheet) throw new Error("File mẫu SMAS không còn trang tính");
  const doc = parseXml(strFromU8(sheet));
  const rowsEl = new Map(
    Array.from(doc.getElementsByTagNameNS(NS, "row")).map((r) => [Number(r.getAttribute("r")), r]),
  );
  for (const f of fills) {
    const rowEl = rowsEl.get(f.row);
    if (!rowEl) continue;
    setCell(doc, rowEl, `${f.col}${f.row}`, f.value);
  }
  // formulas have no cached results; make Excel recompute them when the file opens
  for (const f of Array.from(doc.getElementsByTagNameNS(NS, "f"))) {
    const v = f.parentElement?.getElementsByTagNameNS(NS, "v")[0];
    if (v) v.remove();
  }
  let xml = new XMLSerializer().serializeToString(doc);
  if (!xml.startsWith("<?xml")) xml = `<?xml version="1.0" encoding="utf-8"?>${xml}`;
  const out: Record<string, Uint8Array> = { ...files, [sheetPath]: strToU8(xml) };
  return zipSync(out, { level: 6 });
}
