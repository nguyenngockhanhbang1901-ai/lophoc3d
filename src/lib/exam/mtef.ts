// MathType equations in Word files. Each equation is an OLE object (word/embeddings/oleObjectN.bin):
// a Compound File holding an "Equation Native" stream in MathType's binary format (MTEF).
// This module reads the compound file, parses MTEF version 3 (Equation Editor 3.0, "Equation.3")
// and version 5 (MathType 4–7, "Equation.DSMT4…7"), and writes LaTeX for KaTeX.
// Format reference: Design Science "MTEF v5" specification; cross-checked against the record
// layouts of the MIT-licensed `mathtype` Ruby gem and its sample equations.
import { SYMBOLS } from "./omml";

// ---------- Compound File (OLE2) ----------

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

/** Bytes of the named stream inside an OLE2 compound file, or null. */
export function readCfbStream(file: Uint8Array, name: string): Uint8Array | null {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (file.length < 512 || sig.some((b, i) => file[i] !== b)) return null;
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);
  const sectorSize = 1 << u16(0x1e);
  const miniSize = 1 << u16(0x20);
  const firstDir = u32(0x30);
  const cutoff = u32(0x38);
  const firstMiniFat = u32(0x3c);
  const firstDifat = u32(0x44);
  const sectorOffset = (sid: number) => (sid + 1) * sectorSize;
  const perSector = sectorSize / 4;

  // FAT sector ids from the header DIFAT and any DIFAT chain
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const sid = u32(0x4c + i * 4);
    if (sid !== FREESECT) fatSectors.push(sid);
  }
  for (
    let sid = firstDifat, guard = 0;
    sid !== ENDOFCHAIN && sid !== FREESECT && guard < 10_000;
    guard++
  ) {
    const base = sectorOffset(sid);
    if (base + sectorSize > file.length) break;
    for (let i = 0; i < perSector - 1; i++) {
      const s = u32(base + i * 4);
      if (s !== FREESECT) fatSectors.push(s);
    }
    sid = u32(base + (perSector - 1) * 4);
  }
  const fat = (sid: number): number => {
    const sector = fatSectors[Math.floor(sid / perSector)];
    if (sector === undefined) return ENDOFCHAIN;
    const o = sectorOffset(sector) + (sid % perSector) * 4;
    return o + 4 <= file.length ? u32(o) : ENDOFCHAIN;
  };
  const chain = (start: number): number[] => {
    const out: number[] = [];
    for (
      let sid = start;
      sid !== ENDOFCHAIN && sid !== FREESECT && out.length < 100_000;
      sid = fat(sid)
    )
      out.push(sid);
    return out;
  };
  const readChain = (start: number, size: number): Uint8Array => {
    const out = new Uint8Array(size);
    let at = 0;
    for (const sid of chain(start)) {
      const o = sectorOffset(sid);
      const n = Math.min(sectorSize, size - at, file.length - o);
      if (n <= 0) break;
      out.set(file.subarray(o, o + n), at);
      at += n;
      if (at >= size) break;
    }
    return out;
  };

  const dirSectors = chain(firstDir);
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (const sid of dirSectors) {
    const base = sectorOffset(sid);
    for (let i = 0; i < sectorSize / 128; i++) {
      const o = base + i * 128;
      if (o + 128 > file.length) break;
      const nameLen = u16(o + 64);
      let entryName = "";
      for (let j = 0; j + 2 < nameLen && j < 64; j += 2)
        entryName += String.fromCharCode(u16(o + j));
      entries.push({
        name: entryName,
        type: file[o + 66] ?? 0,
        start: u32(o + 116),
        size: u32(o + 120),
      });
    }
  }
  const root = entries[0];
  const entry = entries.find((e) => e.type === 2 && e.name === name);
  if (!root || !entry) return null;
  if (entry.size >= cutoff) return readChain(entry.start, entry.size);

  // small stream: stored in the mini stream (the root entry's data) via the mini FAT
  const miniStream = readChain(root.start, root.size);
  const miniFatSectors = chain(firstMiniFat);
  const miniFat = (sid: number): number => {
    const sector = miniFatSectors[Math.floor(sid / perSector)];
    if (sector === undefined) return ENDOFCHAIN;
    return u32(sectorOffset(sector) + (sid % perSector) * 4);
  };
  const out = new Uint8Array(entry.size);
  let at = 0;
  for (
    let sid = entry.start, guard = 0;
    sid !== ENDOFCHAIN && at < entry.size && guard < 100_000;
    sid = miniFat(sid), guard++
  ) {
    const o = sid * miniSize;
    const n = Math.min(miniSize, entry.size - at);
    out.set(miniStream.subarray(o, o + n), at);
    at += n;
  }
  return out;
}

// ---------- MTEF records ----------

type Obj =
  | { t: "line"; items: Obj[] | null }
  | { t: "char"; typeface: number; code: number; embells: number[]; funcStart: boolean }
  | { t: "tmpl"; selector: number; variation: number; items: Obj[] }
  | { t: "pile"; lines: Obj[] }
  | { t: "matrix"; rows: number; cols: number; cells: Obj[] }
  | { t: "embell"; kind: number };

class Reader {
  pos: number;
  constructor(
    readonly b: Uint8Array,
    start: number,
  ) {
    this.pos = start;
  }
  u8(): number {
    if (this.pos >= this.b.length) throw new Error("MTEF: hết dữ liệu");
    return this.b[this.pos++]!;
  }
  i8(): number {
    const v = this.u8();
    return v > 127 ? v - 256 : v;
  }
  u16(): number {
    const lo = this.u8();
    return lo | (this.u8() << 8);
  }
  str(): string {
    let s = "";
    for (let c = this.u8(); c !== 0; c = this.u8()) s += String.fromCharCode(c);
    return s;
  }
  skip(n: number) {
    this.pos += n;
  }
  /** MTEF 5 compressed unsigned int */
  mtUint(): number {
    const first = this.u8();
    if (first < 0xff) return first;
    return this.u16();
  }
}

function skipNudge(r: Reader) {
  const dx = r.i8();
  const dy = r.i8();
  if (dx === -128 && dy === -128) r.skip(4);
}

function skipRuler(r: Reader) {
  const stops = r.u8();
  r.skip(stops * 3);
}

/** Parse objects until END. `v5` selects the record layout. */
function readList(r: Reader, v5: boolean): Obj[] {
  const out: Obj[] = [];
  for (;;) {
    const obj = readRecord(r, v5);
    if (obj === "end") return out;
    if (obj) out.push(obj);
  }
}

function readEqnPrefs(r: Reader) {
  r.u8(); // options
  // two nibble-packed dimension arrays (sizes, spaces), each padded to a whole byte
  for (let a = 0; a < 2; a++) {
    const count = r.u8();
    let nibble = 0;
    const next = () => {
      const byte = r.b[r.pos] ?? 0;
      const v = nibble % 2 === 0 ? byte >> 4 : byte & 0x0f;
      if (nibble % 2 === 1) r.pos++;
      nibble++;
      return v;
    };
    for (let i = 0; i < count; i++) {
      next(); // unit
      for (let guard = 0; next() !== 0x0f && guard < 64; guard++);
    }
    if (nibble % 2 === 1) r.pos++;
  }
  const styles = r.u8();
  for (let i = 0; i < styles; i++) if (r.u8() !== 0) r.u8();
}

function readRecord(r: Reader, v5: boolean): Obj | "end" | null {
  const head = r.u8();
  const tag = v5 ? head : head & 0x0f;
  const tagOptions = v5 ? 0 : head >> 4;
  if (v5 && tag >= 100) {
    if (tag === 102) {
      const len = r.mtUint();
      r.skip(len);
    } else r.skip(r.mtUint());
    return null;
  }
  const options = (): number => (v5 ? r.u8() : tagOptions);
  switch (tag) {
    case 0:
      return "end";
    case 1: {
      const o = options();
      if (o & 0x08) skipNudge(r);
      if (o & 0x04) r.u16();
      if (o & 0x02) skipRuler(r);
      return { t: "line", items: o & 0x01 ? null : readList(r, v5) };
    }
    case 2: {
      const o = options();
      if (o & 0x08) skipNudge(r);
      const typeface = r.i8() + 128;
      let code = 0;
      if (v5) {
        if (!(o & 0x20)) code = r.u16();
        if (o & 0x04) {
          const pos8 = r.u8();
          if (o & 0x20) code = pos8;
        } else if (o & 0x10) {
          const pos16 = r.u16();
          if (o & 0x20) code = pos16;
        }
      } else code = r.u16();
      const hasEmbell = v5 ? !!(o & 0x01) : !!(o & 0x02);
      const embells = hasEmbell
        ? readList(r, v5)
            .filter((e): e is Extract<Obj, { t: "embell" }> => e.t === "embell")
            .map((e) => e.kind)
        : [];
      return { t: "char", typeface, code, embells, funcStart: v5 && !!(o & 0x02) };
    }
    case 3: {
      const o = options();
      if (o & 0x08) skipNudge(r);
      const selector = r.u8();
      let variation = r.u8();
      if (v5 && variation & 0x80) variation = (variation & 0x7f) | (r.u8() << 8);
      r.u8(); // template-specific options
      return { t: "tmpl", selector, variation, items: readList(r, v5) };
    }
    case 4: {
      const o = options();
      if (o & 0x08) skipNudge(r);
      r.u8();
      r.u8();
      if (o & 0x02) skipRuler(r);
      return { t: "pile", lines: readList(r, v5) };
    }
    case 5: {
      const o = options();
      if (o & 0x08) skipNudge(r);
      r.u8();
      r.u8();
      r.u8();
      const rows = r.u8();
      const cols = r.u8();
      r.skip(Math.floor((rows + 4) / 4) + Math.floor((cols + 4) / 4));
      return { t: "matrix", rows, cols, cells: readList(r, v5) };
    }
    case 6: {
      const o = options();
      if (o & 0x08) skipNudge(r);
      const kind = r.u8();
      if (!v5) r.u8(); // MTEF 3 embellishments carry one more (unused) byte
      return { t: "embell", kind };
    }
    case 7:
      skipRuler(r);
      return null;
    case 8:
      if (v5) {
        r.u8();
        r.u8();
      } else {
        r.u8();
        r.u8();
        r.str();
      }
      return null;
    case 9: {
      const sel = r.u8();
      if (sel === 101) r.u16();
      else if (sel === 100) {
        r.u8();
        r.u16();
      } else r.u8();
      return null;
    }
    case 10:
    case 11:
    case 12:
    case 13:
    case 14:
      return null;
    case 15:
      r.u8();
      return null;
    case 16: {
      const o = r.u8();
      r.skip(o & 0x01 ? 8 : 6);
      if (o & 0x04) r.str();
      return null;
    }
    case 17:
      r.u8();
      r.str();
      return null;
    case 18:
      readEqnPrefs(r);
      return null;
    case 19:
      r.str();
      return null;
    default:
      throw new Error(`MTEF: bản ghi lạ ${tag}`);
  }
}

/** Top-level objects of an "Equation Native" stream. */
export function parseEquationNative(stream: Uint8Array): { version: number; objects: Obj[] } {
  if (stream.length < 34) throw new Error("MTEF: dữ liệu quá ngắn");
  const headerLen = stream[0]! | (stream[1]! << 8);
  const r = new Reader(stream, headerLen);
  const version = r.u8();
  if (version !== 2 && version !== 3 && version !== 4 && version !== 5)
    throw new Error(`MTEF: phiên bản ${version} chưa hỗ trợ`);
  r.skip(4); // platform, product, product version, subversion
  const v5 = version >= 4;
  if (v5) {
    r.str(); // application key, e.g. DSMT4
    r.u8(); // equation options
  }
  const objects: Obj[] = [];
  while (r.pos < stream.length) {
    const obj = readRecord(r, v5);
    if (obj === "end") break;
    if (obj) objects.push(obj);
  }
  return { version, objects };
}

// ---------- LaTeX ----------

const TF = {
  TEXT: 1,
  FUNCTION: 2,
  VARIABLE: 3,
  LCGREEK: 4,
  UCGREEK: 5,
  SYMBOL: 6,
  VECTOR: 7,
  NUMBER: 8,
  USER1: 9,
  USER2: 10,
  MTEXTRA: 11,
  TEXT_FE: 12,
  EXPAND: 22,
  MARKER: 23,
  SPACE: 24,
};

const FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "log",
  "ln",
  "lg",
  "exp",
  "lim",
  "max",
  "min",
  "sup",
  "inf",
  "det",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "tg",
  "cotg",
]);
const KATEX_FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "log",
  "ln",
  "lg",
  "exp",
  "lim",
  "max",
  "min",
  "sup",
  "inf",
  "det",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "tg",
]);

/** MathType's private-use characters (MT Extra) that school maths uses. */
const MT_EXTRA: Record<number, string> = {
  0xec00: "\\to ",
  0xec01: "\\leftarrow ",
  0xec02: "\\uparrow ",
  0xec03: "\\downarrow ",
  0xec0c: "\\ss ",
  0xe900: "\\cdots ",
  0xe901: "\\vdots ",
  0xe902: "\\ddots ",
  0xef00: "\\,",
  0xef01: "\\,",
  0xef02: "\\:",
  0xef03: "\\;",
  0xef04: "\\quad ",
  0xef05: "\\qquad ",
  0xef08: "",
  0x2009: "\\,",
  0x200a: "\\,",
  0x2002: "\\;",
  0x2003: "\\quad ",
  0x00a0: "~",
  0x2061: "",
  0x2062: "",
};

const EXTRA_SYMBOLS: Record<string, string> = {
  "∗": "*",
  "∘": "\\circ ",
  "∙": "\\cdot ",
  "⊥": "\\perp ",
  "⇀": "\\rightharpoonup ",
  "↼": "\\leftharpoonup ",
  "⏜": "\\frown ",
  "⌢": "\\frown ",
  "¬": "\\neg ",
  "∧": "\\wedge ",
  "∨": "\\vee ",
  "∝": "\\propto ",
  "∂": "\\partial ",
  "∇": "\\nabla ",
  ℓ: "\\ell ",
  ϑ: "\\vartheta ",
  ς: "\\varsigma ",
  κ: "\\kappa ",
  ν: "\\nu ",
  ξ: "\\xi ",
  ο: "o",
  υ: "\\upsilon ",
  χ: "\\chi ",
  ψ: "\\psi ",
  ζ: "\\zeta ",
  η: "\\eta ",
  ι: "\\iota ",
  Γ: "\\Gamma ",
  Θ: "\\Theta ",
  Λ: "\\Lambda ",
  Ξ: "\\Xi ",
  Υ: "\\Upsilon ",
  Ψ: "\\Psi ",
  "≺": "\\prec ",
  "≻": "\\succ ",
  "≪": "\\ll ",
  "≫": "\\gg ",
  "≅": "\\cong ",
  "≃": "\\simeq ",
  "⊕": "\\oplus ",
  "⊗": "\\otimes ",
  "↦": "\\mapsto ",
  "⟶": "\\longrightarrow ",
  "⟹": "\\Longrightarrow ",
  "⟺": "\\Longleftrightarrow ",
  "⋮": "\\vdots ",
  "⋱": "\\ddots ",
};

function charTex(code: number): string {
  if (MT_EXTRA[code] !== undefined) return MT_EXTRA[code]!;
  if (code >= 0xe000 && code <= 0xf8ff) return ""; // other private-use glyphs (spacing, markers)
  const ch = String.fromCodePoint(code);
  return EXTRA_SYMBOLS[ch] ?? SYMBOLS[ch] ?? ch;
}

const EMBELL: Record<number, (x: string) => string> = {
  2: (x) => `\\dot{${x}}`,
  3: (x) => `\\ddot{${x}}`,
  4: (x) => `\\dddot{${x}}`,
  5: (x) => `${x}'`,
  6: (x) => `${x}''`,
  7: (x) => `{}'${x}`,
  8: (x) => `\\tilde{${x}}`,
  9: (x) => `\\hat{${x}}`,
  10: (x) => `\\not{${x}}`,
  11: (x) => `\\overrightarrow{${x}}`,
  12: (x) => `\\overleftarrow{${x}}`,
  13: (x) => `\\overleftrightarrow{${x}}`,
  14: (x) => `\\overrightharpoon{${x}}`,
  15: (x) => `\\overleftharpoon{${x}}`,
  17: (x) => `\\bar{${x}}`,
  18: (x) => `${x}'''`,
  19: (x) => `\\overset{\\frown}{${x}}`,
  20: (x) => `\\overset{\\smile}{${x}}`,
  29: (x) => `\\underline{${x}}`,
  33: (x) => `\\underrightarrow{${x}}`,
  34: (x) => `\\underleftarrow{${x}}`,
};

const FENCE: Record<string, string> = {
  "\u2329": "\\langle",
  "\u232a": "\\rangle",
  "\u301a": "[\\![",
  "\u301b": "]\\!]",
  "(": "(",
  ")": ")",
  "[": "[",
  "]": "]",
  "{": "\\{",
  "}": "\\}",
  "|": "|",
  "‖": "\\|",
  "⟨": "\\langle",
  "⟩": "\\rangle",
  "〈": "\\langle",
  "〉": "\\rangle",
  "⌊": "\\lfloor",
  "⌋": "\\rfloor",
  "⌈": "\\lceil",
  "⌉": "\\rceil",
  "⟦": "[\\![",
  "⟧": "]\\!]",
};

/** Template meaning by selector, which differs between MTEF 3 and 5. */
type Kind =
  | "fence"
  | "root"
  | "frac"
  | "sub"
  | "sup"
  | "subsup"
  | "ubar"
  | "obar"
  | "arrow"
  | "bigop"
  | "lim"
  | "hbrace"
  | "ldiv"
  | "dirac"
  | "vec"
  | "tilde"
  | "hat"
  | "arc"
  | "plain";

function kindOf(selector: number, variation: number, v5: boolean): Kind {
  if (v5) {
    if (selector <= 9) return "fence";
    const map: Record<number, Kind> = {
      10: "root",
      11: "frac",
      12: "ubar",
      13: "obar",
      14: "arrow",
      23: "lim",
      24: "hbrace",
      25: "hbrace",
      26: "ldiv",
      27: "sub",
      28: "sup",
      29: "subsup",
      30: "dirac",
      31: "vec",
      32: "tilde",
      33: "hat",
      34: "arc",
    };
    if (selector >= 15 && selector <= 22) return "bigop";
    return map[selector] ?? "plain";
  }
  if (selector <= 12) return "fence";
  if (selector === 13) return "root";
  if (selector === 14 || selector === 41) return "frac";
  if (selector === 15 || selector === 44)
    return variation === 0 ? "sup" : variation === 1 ? "sub" : "subsup";
  if (selector === 16) return "ubar";
  if (selector === 17) return "obar";
  if (selector >= 18 && selector <= 20) return "arrow";
  if (
    (selector >= 21 && selector <= 26) ||
    (selector >= 29 && selector <= 38) ||
    selector === 42 ||
    selector === 43
  )
    return "bigop";
  if (selector === 27 || selector === 28) return "hbrace";
  if (selector === 39) return "lim";
  if (selector === 40) return "ldiv";
  if (selector === 45) return "dirac";
  if (selector === 46 || selector === 47) return "vec";
  return "plain";
}

const BIGOP_DEFAULT_V5: Record<number, string> = {
  15: "\\int",
  16: "\\sum",
  17: "\\prod",
  18: "\\coprod",
  19: "\\bigcup",
  20: "\\bigcap",
  21: "\\int",
  22: "\\sum",
};
const BIG_CHARS: Record<string, string> = {
  "∫": "\\int",
  "∬": "\\iint",
  "∭": "\\iiint",
  "∮": "\\oint",
  "∑": "\\sum",
  "∏": "\\prod",
  "∐": "\\coprod",
  "⋃": "\\bigcup",
  "⋂": "\\bigcap",
};

function g(s: string): string {
  return `{${s.trim()}}`;
}

class Writer {
  constructor(readonly v5: boolean) {}

  line(o: Obj | undefined): string {
    if (!o) return "";
    if (o.t === "line") return o.items ? this.items(o.items) : "";
    if (o.t === "pile") return this.pile(o);
    return this.items([o]);
  }

  pile(p: Extract<Obj, { t: "pile" }>): string {
    const lines = p.lines.map((l) => this.line(l));
    return lines.length === 1 ? lines[0]! : `\\begin{array}{l}${lines.join(" \\\\ ")}\\end{array}`;
  }

  /** A run of objects; scripts attach to what precedes them, function letters group into \sin etc. */
  items(list: Obj[]): string {
    const out: string[] = [];
    let i = 0;
    while (i < list.length) {
      const o = list[i]!;
      if (
        o.t === "char" &&
        (o.typeface === TF.FUNCTION ||
          o.typeface === TF.TEXT ||
          o.typeface === TF.USER1 ||
          o.typeface === TF.TEXT_FE)
      ) {
        // gather a run of letters in the same face
        let j = i;
        let text = "";
        while (j < list.length) {
          const c = list[j]!;
          if (c.t !== "char" || c.typeface !== o.typeface || c.embells.length) break;
          if (j > i && c.funcStart) break;
          text += String.fromCodePoint(c.code);
          j++;
        }
        if (j === i) {
          out.push(this.char(o));
          i++;
          continue;
        }
        out.push(this.word(text, o.typeface === TF.FUNCTION));
        i = j;
        continue;
      }
      if (o.t === "tmpl") {
        const kind = kindOf(o.selector, o.variation, this.v5);
        if (kind === "sub" || kind === "sup" || kind === "subsup") {
          const [subLine, supLine] = o.items.filter((x) => x.t === "line" || x.t === "pile");
          const sub = kind === "sup" && !this.v5 ? "" : this.line(subLine);
          const sup = kind === "sup" && !this.v5 ? this.line(subLine) : this.line(supLine);
          if (this.v5 && o.variation & 0x0001) {
            // script written before the item (e.g. a left index)
            out.push(`{}${sub ? `_${g(sub)}` : ""}${sup ? `^${g(sup)}` : ""}`);
            i++;
            continue;
          }
          const base = out.pop() ?? "{}";
          const scripted =
            /^(\\[a-zA-Z]+\s*|.)$/.test(base.trim()) || base.trim().startsWith("\\right")
              ? base
              : g(base);
          out.push(`${scripted}${sub ? `_${g(sub)}` : ""}${sup ? `^${g(sup)}` : ""}`);
          i++;
          continue;
        }
      }
      out.push(this.obj(o));
      i++;
    }
    return out.join("");
  }

  /** A run typed in a text or function face: letters become words, the rest stays maths. */
  word(text: string, func: boolean): string {
    return text
      .split(/([\p{L}]+(?:[ \u00a0]+[\p{L}]+)*)/u)
      .map((part, i) => {
        if (!part) return "";
        if (i % 2 === 0) {
          // punctuation, digits, spaces
          let out = "";
          for (const ch of part)
            out += ch === " " || ch === "\u00a0" ? "\\ " : charTex(ch.codePointAt(0) ?? 32);
          return out;
        }
        if (func && KATEX_FUNCTIONS.has(part)) return `\\${part} `;
        if (func && /^[A-Za-z]+$/.test(part)) return `\\operatorname{${part}} `;
        return `\\text{${part}}`;
      })
      .join("");
  }

  char(c: Extract<Obj, { t: "char" }>): string {
    if (c.typeface === TF.SPACE) return MT_EXTRA[c.code] ?? "\\,";
    if (c.typeface === TF.MARKER || c.typeface === TF.EXPAND) return "";
    let s = charTex(c.code);
    if (c.typeface === TF.VECTOR && /^[A-Za-z0-9]$/.test(s)) s = `\\mathbf{${s}}`;
    for (const e of c.embells) {
      const f = EMBELL[e];
      if (f) s = f(s);
    }
    return s;
  }

  obj(o: Obj): string {
    switch (o.t) {
      case "line":
        return o.items ? this.items(o.items) : "";
      case "pile":
        return this.pile(o);
      case "char":
        return this.char(o);
      case "matrix": {
        const rows: string[] = [];
        for (let r = 0; r < o.rows; r++)
          rows.push(
            o.cells
              .slice(r * o.cols, r * o.cols + o.cols)
              .map((c) => this.line(c))
              .join(" & "),
          );
        return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
      }
      case "embell":
        return "";
      case "tmpl":
        return this.tmpl(o);
    }
  }

  tmpl(o: Extract<Obj, { t: "tmpl" }>): string {
    const slots = o.items.filter((x) => x.t === "line" || x.t === "pile");
    const chars = o.items.filter((x): x is Extract<Obj, { t: "char" }> => x.t === "char");
    const s = (i: number) => this.line(slots[i]).trim();
    const kind = kindOf(o.selector, o.variation, this.v5);
    switch (kind) {
      case "fence": {
        const fenceChars = chars.map((c) => String.fromCodePoint(c.code));
        let left = fenceChars[0];
        let right = fenceChars[1];
        const defaults = this.v5 ? defaultFenceV5(o.selector) : defaultFenceV3(o.selector);
        if (this.v5 && o.selector <= 8) {
          const hasL = o.variation & 0x01;
          const hasR = o.variation & 0x02;
          if (fenceChars.length < 2) {
            left = hasL ? (fenceChars.length && hasL && !hasR ? fenceChars[0] : defaults[0]) : "";
            right = hasR ? (fenceChars.length && hasR && !hasL ? fenceChars[0] : defaults[1]) : "";
          }
        } else {
          left = left ?? defaults[0];
          right = right ?? defaults[1];
        }
        // MT Extra private-use glyphs stand for the template's own fence
        const known = (c: string | undefined, d: string) =>
          !c ? "" : FENCE[c] ? c : (c.codePointAt(0) ?? 0) >= 0xe000 ? d : c;
        left = known(left, defaults[0]);
        right = known(right, defaults[1]);
        const L = left ? (FENCE[left] ?? left) : ".";
        const R = right ? (FENCE[right] ?? right) : ".";
        return `\\left${L} ${s(0)} \\right${R}`;
      }
      case "root": {
        const index = s(1);
        return index ? `\\sqrt[${index}]${g(s(0))}` : `\\sqrt${g(s(0))}`;
      }
      case "frac":
        return this.v5 && o.variation & 0x02
          ? `${g(s(0))}/${g(s(1))}`
          : `\\frac${g(s(0))}${g(s(1))}`;
      case "ubar":
        return `\\underline${g(s(0))}`;
      case "obar":
        return `\\overline${g(s(0))}`;
      case "arrow": {
        const top = s(0);
        const bottom = s(1);
        const left = this.v5 ? !!(o.variation & 0x10) && !(o.variation & 0x20) : o.selector === 18;
        const cmd = left ? "\\xleftarrow" : "\\xrightarrow";
        return `${cmd}${bottom ? `[${bottom}]` : ""}${g(top)}`;
      }
      case "bigop": {
        const opChar = chars[chars.length - 1];
        const op =
          (opChar && BIG_CHARS[String.fromCodePoint(opChar.code)]) ??
          (this.v5 ? BIGOP_DEFAULT_V5[o.selector] : undefined) ??
          "\\int";
        const lower = s(1);
        const upper = s(2);
        return `${op}${lower ? `_${g(lower)}` : ""}${upper ? `^${g(upper)}` : ""} ${s(0)}`;
      }
      case "lim": {
        const lower = s(1);
        const upper = s(2);
        const main = s(0) || "\\lim";
        return `${main}${lower ? `_${g(lower)}` : ""}${upper ? `^${g(upper)}` : ""} `;
      }
      case "hbrace": {
        const top = this.v5 ? !!(o.variation & 0x01) : o.selector === 27;
        const label = s(1);
        return top
          ? `\\overbrace${g(s(0))}${label ? `^${g(label)}` : ""}`
          : `\\underbrace${g(s(0))}${label ? `_${g(label)}` : ""}`;
      }
      case "dirac":
        return `\\left\\langle ${s(0)}\\middle|${s(1)}\\right\\rangle`;
      case "vec": {
        const leftOnly = this.v5 ? (o.variation & 0x03) === 0x01 : false;
        const both = this.v5 ? (o.variation & 0x03) === 0x03 : false;
        return `${both ? "\\overleftrightarrow" : leftOnly ? "\\overleftarrow" : "\\overrightarrow"}${g(s(0))}`;
      }
      case "tilde":
        return `\\widetilde${g(s(0))}`;
      case "hat":
        return `\\widehat${g(s(0))}`;
      case "arc":
        return `\\overset{\\frown}${g(s(0))}`;
      default:
        return slots.map((x) => this.line(x)).join("");
    }
  }
}

function defaultFenceV5(selector: number): [string, string] {
  return (
    (
      [
        ["⟨", "⟩"],
        ["(", ")"],
        ["{", "}"],
        ["[", "]"],
        ["|", "|"],
        ["‖", "‖"],
        ["⌊", "⌋"],
        ["⌈", "⌉"],
        ["⟦", "⟧"],
        ["(", ")"],
      ] as [string, string][]
    )[selector] ?? ["(", ")"]
  );
}
function defaultFenceV3(selector: number): [string, string] {
  return (
    (
      [
        ["⟨", "⟩"],
        ["(", ")"],
        ["{", "}"],
        ["[", "]"],
        ["|", "|"],
        ["‖", "‖"],
        ["⌊", "⌋"],
        ["⌈", "⌉"],
      ] as [string, string][]
    )[selector] ?? ["(", ")"]
  );
}

/** LaTeX for the "Equation Native" stream of one MathType equation. */
export function mtefToLatex(stream: Uint8Array): string {
  const { version, objects } = parseEquationNative(stream);
  const w = new Writer(version >= 4);
  return (
    w
      .items(
        objects.flatMap((o) => (o.t === "line" ? (o.items ?? []) : o.t === "pile" ? [o] : [o])),
      )
      .replace(/\s+/g, " ")
      .replace(/ ([_^}])/g, "$1")
      // Vietnamese decimal comma: 0,98 without the space TeX puts after a comma
      .replace(/(\d),(?=\d)/g, "$1{,}")
      .trim()
  );
}

/** LaTeX for a MathType OLE object file (oleObjectN.bin); null when it is not a MathType equation. */
export function mathTypeOleToLatex(ole: Uint8Array): string | null {
  const stream = readCfbStream(ole, "Equation Native");
  if (!stream) return null;
  return mtefToLatex(stream);
}
