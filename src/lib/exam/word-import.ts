// Turning a teacher's Word file into questions. Conventions of Vietnamese test papers:
//   "Câu 1." / "Câu 1:" / "Câu 1 (NB)." starts a question; "PHẦN I/II/III" sets the expected kind;
//   options "A. … B. … C. … D. …" (one per line, two per line or all on one line, also in tables);
//   true/false statements "a) … b) … c) … d) …";
//   the right answer is the option (or statement) whose letter or text is underlined and/or red,
//   or given in a line "Đáp án: B" / "Đáp án: ĐSĐS" / "Đáp án: 3,5";
//   "Lời giải" / "Hướng dẫn giải" starts the worked solution.
// Formulas arrive as LaTeX ($…$, \(…\), \[…\]) typed in the text or as Word equations.
import type { DocParagraph, DocToken } from "./docx-reader";
import {
  parseAnswerNumber,
  questionGaps,
  type QuestionBody,
  type QuestionKind,
  type QuestionLevel,
} from "./questions";

export interface ImportedQuestion {
  number: number | null;
  level: QuestionLevel | null;
  body: QuestionBody;
  /** picture to attach as the question's figure (path inside the .docx) */
  mediaPath: string | null;
  /** problems the teacher should look at before saving */
  issues: string[];
  /** the question as read from the file, for side-by-side review */
  source: string;
}

type Tok =
  | { k: "c"; ch: string; marked: boolean }
  | { k: "m"; tex: string; marked: boolean }
  | { k: "img"; path: string }
  | { k: "bad"; what: "mathtype" | "image-format" };

const MATH = "";
const IMG = "";
const BAD = "";

function toTokens(p: DocParagraph): Tok[] {
  const out: Tok[] = [];
  for (const t of p as DocToken[]) {
    if (t.kind === "text") for (const ch of t.text) out.push({ k: "c", ch, marked: t.marked });
    else if (t.kind === "math") out.push({ k: "m", tex: t.tex, marked: t.marked });
    else if (t.kind === "image") out.push({ k: "img", path: t.path });
    else out.push({ k: "bad", what: t.what });
  }
  return out;
}

function plain(toks: Tok[]): string {
  return toks
    .map((t) => (t.k === "c" ? t.ch : t.k === "m" ? MATH : t.k === "img" ? IMG : BAD))
    .join("");
}

/** LaTeX delimiters typed as text: \( \) → $ $ and \[ \] → $$ $$. */
export function normalizeLatexDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) => `$$${tex.trim()}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) => `$${tex.trim()}$`);
}

function render(toks: Tok[]): string {
  const raw = toks.map((t) => (t.k === "c" ? t.ch : t.k === "m" ? `$${t.tex}$` : "")).join("");
  return normalizeLatexDelimiters(raw)
    .replace(/\t/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sourceText(toks: Tok[]): string {
  return toks
    .map((t) =>
      t.k === "c"
        ? t.ch
        : t.k === "m"
          ? `[${t.tex}]`
          : t.k === "img"
            ? "[hình]"
            : "[công thức không đọc được]",
    )
    .join("")
    .replace(/\t/g, " ")
    .trim();
}

const QUESTION_START =
  /^[ \t\u00a0]*Câu[ \t\u00a0]*(\d+)[ \t\u00a0]*(?:[([]([^)\]]{1,20})[)\]])?[ \t\u00a0]*[.:)]?[ \t\u00a0]*/i;
const SECTION = /^[ \t]*PH[ẦA]N[ \t]+(III|II|I|1|2|3)\b/i;
const SOLUTION =
  /^[ \t]*(?:Lời giải(?: chi tiết)?|Hướng dẫn(?: giải)?|HD(?: giải)?|HDG|Giải)[ \t]*[:.]?[ \t]*/i;
const ANSWER = /^[ \t]*(?:Đáp án|ĐA|Đ\/A|Đáp số|Trả lời|Kết quả)[ \t]*[:.]?[ \t]*(.*)$/i;
const CHOOSE = /^[ \t]*Chọn[ \t]*[:.]?[ \t]*([A-D])\b[ \t.]*$/i;

const LEVELS: [RegExp, QuestionLevel][] = [
  [/^(vdc|vận dụng cao)$/i, "vdc"],
  [/^(vd|vận dụng)$/i, "vd"],
  [/^(th|thông hiểu)$/i, "th"],
  [/^(nb|nhận biết)$/i, "nb"],
];
function levelOf(tag: string | undefined): QuestionLevel | null {
  if (!tag) return null;
  const t = tag.trim();
  return LEVELS.find(([re]) => re.test(t))?.[1] ?? null;
}

function sectionKind(m: RegExpExecArray): QuestionKind {
  const n = m[1]!.toUpperCase();
  return n === "I" || n === "1" ? "mcq" : n === "II" || n === "2" ? "tf" : "short";
}

interface Marker {
  start: number;
  end: number;
  letter: string;
  letterAt: number;
  star: boolean;
}

/** Last chain of markers in order (A<B<C<D or a<b<c<d), so an "A." inside the stem is ignored. */
function markerChain(text: string, letters: readonly string[], pattern: RegExp): Marker[] | null {
  const found: Marker[] = [];
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    const lead = m[1] ?? "";
    const star = (m[2] ?? "") === "*";
    const letter = m[3]!;
    const start = m.index + lead.length;
    found.push({
      start,
      end: m.index + m[0].length,
      letter,
      letterAt: start + (star ? 1 : 0),
      star,
    });
    pattern.lastIndex = m.index + Math.max(1, lead.length);
  }
  const chain: Marker[] = [];
  let limit = Infinity;
  for (let i = letters.length - 1; i >= 0; i--) {
    const pick = [...found].reverse().find((f) => f.letter === letters[i] && f.start < limit);
    if (!pick) return null;
    chain.unshift(pick);
    limit = pick.start;
  }
  return chain;
}

const MCQ_PATTERN = () => /(^|[\s(])(\*?)([A-D])[ \t]*[.)](?=[\s$\\(]|$)/g;
const TF_PATTERN = () => /(^|\s)(\*?)([a-d])[ \t]*\)(?=[\s$\\(]|$)/g;

function rangeMarked(toks: Tok[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    const t = toks[i];
    if (!t) continue;
    if ((t.k === "c" && t.marked && t.ch.trim()) || (t.k === "m" && t.marked)) return true;
  }
  return false;
}

function letterMarked(toks: Tok[], m: Marker): boolean {
  const t = toks[m.letterAt];
  return m.star || (t?.k === "c" && t.marked);
}

function parseTfHint(hint: string): (boolean | null)[] | null {
  const compact = hint.replace(/[^a-zđĐsStTfF]/gi, "");
  const letters = hint.match(/[ĐĐSsTtFf](?:úng|ai)?/g);
  const byLetter: (boolean | null)[] = [null, null, null, null];
  const pairs = hint.matchAll(/([a-d])[ \t]*[).:-]?[ \t]*(Đúng|Sai|Đ|S|T|F)\b/gi);
  let any = false;
  for (const p of pairs) {
    const i = "abcd".indexOf(p[1]!.toLowerCase());
    byLetter[i] = /^(đ|đúng|t)$/i.test(p[2]!);
    any = true;
  }
  if (any) return byLetter;
  if (/^[ĐSTF]{4}$/i.test(compact)) return [...compact].map((c) => /[ĐT]/i.test(c));
  if (letters && letters.length === 4) return letters.map((l) => /^[ĐT]/i.test(l));
  return null;
}

function blockQuestion(
  paragraphs: Tok[][],
  number: number | null,
  tag: string | undefined,
  hintKind: QuestionKind | null,
): ImportedQuestion {
  const issues: string[] = [];
  const all = paragraphs.flatMap((p, i) =>
    i ? [{ k: "c", ch: "\n", marked: false } as Tok, ...p] : p,
  );
  const source = sourceText(all);

  // Solution and answer lines come out of the content first.
  let solutionAt = paragraphs.findIndex((p, i) => i > 0 && SOLUTION.test(plain(p)));
  if (solutionAt < 0) solutionAt = paragraphs.length;
  let hint: string | null = null;
  const content: Tok[][] = [];
  paragraphs.slice(0, solutionAt).forEach((p, i) => {
    const text = plain(p);
    const answer = i > 0 ? ANSWER.exec(text) : null;
    const choose = i > 0 ? CHOOSE.exec(text) : null;
    if (answer && answer[1]!.trim()) hint = render(p.slice(text.length - answer[1]!.length));
    else if (choose) hint = choose[1]!;
    else content.push(p);
  });
  const solutionToks = paragraphs
    .slice(solutionAt)
    .flatMap((p, i) => (i ? [{ k: "c", ch: "\n", marked: false } as Tok, ...p] : p));
  const explanation = render(
    solutionToks.slice(SOLUTION.exec(plain(solutionToks))?.[0].length ?? 0),
  );

  const toks = content.flatMap((p, i) =>
    i ? [{ k: "c", ch: "\n", marked: false } as Tok, ...p] : p,
  );
  const text = plain(toks);
  if (toks.some((t) => t.k === "bad" && t.what === "mathtype"))
    issues.push("Có công thức MathType không chuyển được, cần gõ lại bằng $…$");
  if (toks.some((t) => t.k === "bad" && t.what === "image-format"))
    issues.push("Có hình dạng WMF/EMF không hiển thị được trên web, cần chèn lại ảnh PNG/JPG");

  const mcq = markerChain(text, ["A", "B", "C", "D"], MCQ_PATTERN());
  const tf = mcq ? null : markerChain(text, ["a", "b", "c", "d"], TF_PATTERN());
  const kind: QuestionKind = mcq ? "mcq" : tf ? "tf" : "short";
  if (hintKind && hintKind !== kind)
    issues.push(
      `Câu nằm trong phần ${hintKind === "mcq" ? "trắc nghiệm" : hintKind === "tf" ? "đúng/sai" : "trả lời ngắn"} nhưng được nhận là ${kind === "mcq" ? "trắc nghiệm" : kind === "tf" ? "đúng/sai" : "trả lời ngắn"}`,
    );

  const stemEnd = mcq?.[0]?.start ?? tf?.[0]?.start ?? toks.length;
  const imagesAt = toks.map((t, i) => (t.k === "img" ? i : -1)).filter((i) => i >= 0);
  const stemImage = imagesAt.find((i) => i < stemEnd);
  if (imagesAt.some((i) => i >= stemEnd)) issues.push("Có hình nằm trong phương án, cần xem lại");
  if (imagesAt.filter((i) => i < stemEnd).length > 1)
    issues.push("Đề có nhiều hình, chỉ lấy hình đầu tiên");
  const stem = render(toks.slice(0, stemEnd));
  const mediaPath = stemImage === undefined ? null : (toks[stemImage] as { path: string }).path;

  let body: QuestionBody;
  if (mcq) {
    const options = mcq.map((m, i) =>
      render(toks.slice(m.end, mcq[i + 1]?.start ?? toks.length)),
    ) as [string, string, string, string];
    const byLetter = mcq.map((m) => letterMarked(toks, m));
    const byText = mcq.map((m, i) => rangeMarked(toks, m.end, mcq[i + 1]?.start ?? toks.length));
    let marked = byLetter.some(Boolean) ? byLetter : byText;
    if (!marked.some(Boolean) && hint) {
      const letter = /^\s*([A-D])\b/i.exec(hint)?.[1]?.toUpperCase();
      if (letter) marked = mcq.map((m) => m.letter === letter);
    }
    const chosen = marked.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (chosen.length > 1)
      issues.push(
        `Có ${chosen.length} phương án được đánh dấu (${chosen.map((i) => "ABCD"[i]).join(", ")}), đã lấy ${"ABCD"[chosen[0]!]}`,
      );
    if (!chosen.length)
      issues.push("Không nhận ra đáp án đúng (gạch chân hoặc tô đỏ chữ cái của phương án đúng)");
    body = {
      stem,
      media: null,
      explanation,
      data: { kind: "mcq", options, correct: chosen[0] ?? null },
    };
  } else if (tf) {
    const statements = tf.map((m, i) =>
      render(toks.slice(m.end, tf[i + 1]?.start ?? toks.length)),
    ) as [string, string, string, string];
    const marks = tf.map(
      (m, i) => letterMarked(toks, m) || rangeMarked(toks, m.end, tf[i + 1]?.start ?? toks.length),
    );
    let correct: (boolean | null)[] = marks.some(Boolean) ? marks : [null, null, null, null];
    if (!marks.some(Boolean) && hint) correct = parseTfHint(hint) ?? correct;
    if (correct.some((c) => c === null))
      issues.push(
        "Không nhận ra ý nào Đúng/Sai (gạch chân hoặc tô đỏ các ý đúng, hoặc ghi “Đáp án: ĐSĐS”)",
      );
    body = {
      stem,
      media: null,
      explanation,
      data: {
        kind: "tf",
        statements,
        correct: correct as [boolean | null, boolean | null, boolean | null, boolean | null],
      },
    };
  } else {
    const answers = (hint ?? "")
      .split(/\s*(?:;|\bhoặc\b)\s*/i)
      .map((a) => a.replace(/\$/g, "").trim())
      .filter(Boolean);
    if (!answers.length)
      issues.push(
        "Không thấy phương án A–D hay ý a)–d), và không có dòng “Đáp án: …” — đã để là câu trả lời ngắn",
      );
    const mode =
      answers.length && answers.every((a) => parseAnswerNumber(a) !== null)
        ? "number"
        : answers.length
          ? "text"
          : "number";
    body = {
      stem,
      media: null,
      explanation,
      data: { kind: "short", mode, answers: answers.length ? answers : [""], tolerance: null },
    };
  }

  for (const gap of questionGaps(body))
    if (!issues.some((i) => i.includes(gap))) {
      if (
        gap === "Chưa chọn đáp án đúng" ||
        gap.startsWith("Chưa chọn Đúng/Sai") ||
        gap === "Chưa có đáp án"
      )
        continue;
      issues.push(gap);
    }
  return { number, level: levelOf(tag), body, mediaPath, issues, source };
}

/** All questions in the file, in order. */
export function splitQuestions(paragraphs: DocParagraph[]): ImportedQuestion[] {
  const questions: ImportedQuestion[] = [];
  let section: QuestionKind | null = null;
  let current: {
    number: number;
    tag: string | undefined;
    section: QuestionKind | null;
    paragraphs: Tok[][];
  } | null = null;
  const flush = () => {
    if (current && current.paragraphs.some((p) => plain(p).trim() || p.some((t) => t.k !== "c")))
      questions.push(
        blockQuestion(current.paragraphs, current.number, current.tag, current.section),
      );
    current = null;
  };
  for (const p of paragraphs) {
    // a line break inside a paragraph counts as a new line for "Câu n" detection
    const pieces: Tok[][] = [[]];
    for (const t of toTokens(p)) {
      if (t.k === "c" && t.ch === "\n") pieces.push([]);
      else pieces[pieces.length - 1]!.push(t);
    }
    for (const toks of pieces) {
      const text = plain(toks);
      const sec = SECTION.exec(text);
      if (sec && !QUESTION_START.test(text)) {
        flush();
        section = sectionKind(sec);
        continue;
      }
      const start = QUESTION_START.exec(text);
      if (start) {
        flush();
        current = {
          number: Number(start[1]),
          tag: start[2],
          section,
          paragraphs: [toks.slice(start[0].length)],
        };
      } else if (current) current.paragraphs.push(toks);
    }
  }
  flush();
  return questions;
}
