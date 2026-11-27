// Reading a .docx in the browser (or tests): paragraphs as runs of text that remember whether
// they are underlined or red (how teachers mark the right answer), Word equations converted to
// LaTeX, and embedded pictures. Tables are read cell by cell, so options laid out in a grid
// still come out in order.
import { unzipSync, strFromU8 } from "fflate";
import { ommlToLatex } from "./omml";
import { mathTypeOleToLatex } from "./mtef";

export type DocToken =
  | { kind: "text"; text: string; marked: boolean }
  | { kind: "math"; tex: string; marked: boolean }
  | { kind: "image"; path: string }
  | { kind: "unsupported"; what: "mathtype" | "image-format" };

export type DocParagraph = DocToken[];

export interface DocxContent {
  paragraphs: DocParagraph[];
  /** media files inside the package, by path ("word/media/image1.png") */
  media: Map<string, Uint8Array>;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function attr(el: Element, name: string): string | null {
  return el.getAttributeNS(W, name) ?? el.getAttribute(`w:${name}`);
}

/** Red-ish font colours used to mark answers: FF0000, C00000, E00000, … */
export function isRedColor(hex: string | null | undefined): boolean {
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r >= 0xb0 && g <= 0x60 && b <= 0x60;
}

function runMarked(rPr: Element | undefined | null): boolean {
  if (!rPr) return false;
  let marked = false;
  for (const c of Array.from(rPr.children)) {
    if (c.localName === "u") {
      const v = attr(c, "val");
      if (v !== "none" && v !== "0") marked = true;
    }
    if (c.localName === "color" && isRedColor(attr(c, "val"))) marked = true;
  }
  return marked;
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
};

export function imageMime(path: string): string | null {
  return IMAGE_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ["word", ...target.split("/")];
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

interface Ctx {
  rels: Map<string, string>;
  files: Record<string, Uint8Array>;
}

/** LaTeX of an embedded MathType / Equation Editor 3.0 object, or null when it cannot be read. */
function oleEquation(ole: Element, ctx: Ctx): string | null {
  const id = ole.getAttributeNS(R, "id") ?? ole.getAttribute("r:id");
  const path = id ? ctx.rels.get(id) : undefined;
  const bytes = path ? ctx.files[path] : undefined;
  if (!bytes) return null;
  try {
    const tex = mathTypeOleToLatex(bytes);
    return tex === null ? null : tex;
  } catch {
    return null;
  }
}

function collectRun(run: Element, ctx: Ctx, out: DocToken[]) {
  const rels = ctx.rels;
  const marked = runMarked(Array.from(run.children).find((c) => c.localName === "rPr"));
  for (const c of Array.from(run.children)) {
    switch (c.localName) {
      case "t":
        out.push({ kind: "text", text: c.textContent ?? "", marked });
        break;
      case "tab":
        out.push({ kind: "text", text: "\t", marked: false });
        break;
      case "br":
      case "cr":
        out.push({ kind: "text", text: "\n", marked: false });
        break;
      case "sym": {
        const code = attr(c, "char");
        if (code)
          out.push({
            kind: "text",
            text: String.fromCharCode(parseInt(code.slice(-4), 16) || 32),
            marked,
          });
        break;
      }
      case "drawing": {
        const blip = c.getElementsByTagNameNS("*", "blip")[0];
        const id = blip?.getAttributeNS(R, "embed") ?? blip?.getAttribute("r:embed");
        const path = id ? rels.get(id) : undefined;
        if (path)
          out.push(
            imageMime(path)
              ? { kind: "image", path }
              : { kind: "unsupported", what: "image-format" },
          );
        break;
      }
      case "pict":
      case "object": {
        const ole = c.getElementsByTagNameNS("*", "OLEObject")[0];
        if (ole && /equation/i.test(ole.getAttribute("ProgID") ?? "")) {
          const tex = oleEquation(ole, ctx);
          out.push(
            tex === null
              ? { kind: "unsupported", what: "mathtype" }
              : tex
                ? { kind: "math", tex, marked }
                : { kind: "text", text: "", marked },
          );
          break;
        }
        const data = c.getElementsByTagNameNS("*", "imagedata")[0];
        const id = data?.getAttributeNS(R, "id") ?? data?.getAttribute("r:id");
        const path = id ? rels.get(id) : undefined;
        if (path)
          out.push(
            imageMime(path)
              ? { kind: "image", path }
              : { kind: "unsupported", what: "image-format" },
          );
        break;
      }
      default:
        break;
    }
  }
}

/** Everything inside a paragraph, in reading order. */
function collectInline(el: Element, ctx: Ctx, out: DocToken[]) {
  for (const c of Array.from(el.children)) {
    const name = c.localName;
    if (name === "r") collectRun(c, ctx, out);
    else if (name === "oMath" || name === "oMathPara") {
      const tex = ommlToLatex(c);
      if (tex) out.push({ kind: "math", tex, marked: false });
    } else if (name === "del" || name === "pPr" || name === "moveFrom") continue;
    // hyperlinks, tracked insertions, content controls, smart tags, fields: look inside
    else collectInline(c, ctx, out);
  }
}

function collectBlocks(el: Element, ctx: Ctx, out: DocParagraph[]) {
  for (const c of Array.from(el.children)) {
    if (c.localName === "p") {
      const tokens: DocToken[] = [];
      collectInline(c, ctx, tokens);
      out.push(tokens);
    } else if (
      c.localName === "tbl" ||
      c.localName === "tr" ||
      c.localName === "tc" ||
      c.localName === "sdt" ||
      c.localName === "sdtContent" ||
      c.localName === "customXml"
    ) {
      collectBlocks(c, ctx, out);
    }
  }
}

export function readDocx(bytes: Uint8Array): DocxContent {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error(
      "Không mở được file. Hãy dùng file Word .docx (Word 2007 trở lên; file .doc cũ hãy mở bằng Word rồi Lưu thành .docx).",
    );
  }
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("File không phải tài liệu Word .docx");
  const parser = new DOMParser();
  const rels = new Map<string, string>();
  const relsXml = files["word/_rels/document.xml.rels"];
  if (relsXml) {
    const relDoc = parser.parseFromString(strFromU8(relsXml), "application/xml");
    for (const r of Array.from(relDoc.getElementsByTagName("Relationship"))) {
      const id = r.getAttribute("Id");
      const target = r.getAttribute("Target");
      if (id && target && r.getAttribute("TargetMode") !== "External")
        rels.set(id, resolveTarget(target));
    }
  }
  const xml = parser.parseFromString(strFromU8(doc), "application/xml");
  const body = xml.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error("File Word không có nội dung");
  const paragraphs: DocParagraph[] = [];
  collectBlocks(body, { rels, files }, paragraphs);
  const media = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(files))
    if (path.startsWith("word/media/")) media.set(path, data);
  return { paragraphs, media };
}
