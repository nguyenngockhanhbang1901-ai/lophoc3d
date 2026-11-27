import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readDocx, isRedColor } from "./docx-reader";
import { splitQuestions, normalizeLatexDelimiters } from "./word-import";

const file = new Uint8Array(
  readFileSync(resolve(process.cwd(), "src/lib/exam/__fixtures__/de-mau.docx")),
);

describe("Word import", () => {
  const doc = readDocx(file);
  const qs = splitQuestions(doc.paragraphs);

  it("finds every question", () => {
    expect(qs.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(qs.map((q) => q.body.data.kind)).toEqual([
      "mcq",
      "mcq",
      "mcq",
      "mcq",
      "tf",
      "short",
      "short",
    ]);
  });

  it("reads underlined answers and Word equations", () => {
    const q = qs[0]!;
    expect(q.body.data).toMatchObject({ kind: "mcq", correct: 0 });
    expect(q.body.stem).toContain("$x=\\frac{1}{2}+\\sqrt{3}$");
    expect(q.body.data.kind === "mcq" && q.body.data.options).toEqual([
      "AB // (SCD)",
      "AB cắt (SCD)",
      "AB ⊂ (SCD)",
      "AB ⊥ (SCD)",
    ]);
    expect(q.issues).toEqual([]);
  });

  it("reads red answers from options on one line and ignores 'điểm A.' in the stem", () => {
    const q = qs[1]!;
    expect(q.body.stem).toBe(
      "Cho điểm A. Đường thẳng d đi qua A và song song với $\\Delta$. Giá trị của $2^3$ là",
    );
    expect(q.body.data).toMatchObject({ kind: "mcq", options: ["6", "8", "9", "12"], correct: 1 });
  });

  it("reads options in a table, \\( \\) formulas, level tag and the figure", () => {
    const q = qs[2]!;
    expect(q.level).toBe("th");
    expect(q.body.stem).toBe("Cho hình vẽ. Vectơ $\\overrightarrow{AB}$ bằng");
    expect(q.body.data).toMatchObject({ kind: "mcq", correct: 2 });
    expect(q.body.data.kind === "mcq" && q.body.data.options[2]).toBe("$\\overrightarrow{DC}$");
    expect(q.mediaPath).toMatch(/^word\/media\//);
    expect(doc.media.has(q.mediaPath!)).toBe(true);
  });

  it("uses 'Đáp án:' lines and keeps the solution", () => {
    const q = qs[3]!;
    expect(q.body.data).toMatchObject({ kind: "mcq", correct: 1 });
    expect(q.body.stem).toBe("Rút gọn ${\\left(a+b\\right)}^{2}$");
    expect(q.body.explanation).toBe("Ta có $(a+b)^2 = a^2 + 2ab + b^2$.");
  });

  it("reads true/false statements from underlined letters", () => {
    const q = qs[4]!;
    expect(q.body.data).toMatchObject({ kind: "tf", correct: [true, true, false, true] });
    expect(q.body.data.kind === "tf" && q.body.data.statements[0]).toBe(
      "SO là giao tuyến của (SAC) và (SBD)",
    );
  });

  it("reads short answers by number or by words", () => {
    expect(qs[5]!.body.data).toMatchObject({ kind: "short", mode: "number", answers: ["3,5"] });
    expect(qs[6]!.body.data).toMatchObject({ kind: "short", mode: "text", answers: ["song song"] });
  });

  it("produces formulas KaTeX can typeset", async () => {
    const katex = (await import("katex")).default;
    const { mathLines } = await import("./math-text");
    const texts = qs.flatMap((q) => [
      q.body.stem,
      q.body.explanation,
      ...(q.body.data.kind === "mcq"
        ? q.body.data.options
        : q.body.data.kind === "tf"
          ? q.body.data.statements
          : []),
    ]);
    let formulas = 0;
    for (const t of texts)
      for (const p of mathLines(t).flat())
        if (p.type !== "text") {
          formulas++;
          expect(() =>
            katex.renderToString(p.tex, {
              throwOnError: true,
              macros: { "\\ss": "\\mathrel{/\\mkern-5mu/}" },
            }),
          ).not.toThrow();
        }
    expect(formulas).toBeGreaterThan(8);
  });

  it("helpers", () => {
    expect(isRedColor("FF0000")).toBe(true);
    expect(isRedColor("C00000")).toBe(true);
    expect(isRedColor("000000")).toBe(false);
    expect(isRedColor("auto")).toBe(false);
    expect(normalizeLatexDelimiters("a \\(x^2\\) và \\[y\\]")).toBe("a $x^2$ và $$y$$");
  });

  it("rejects files that are not .docx", () => {
    expect(() => readDocx(new Uint8Array([1, 2, 3]))).toThrow(/docx/);
  });
});
