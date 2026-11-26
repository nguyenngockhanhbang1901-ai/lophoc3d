import { describe, expect, it } from "vitest";
import {
  changeKind,
  emptyBody,
  normalizeShortInput,
  parseAnswerNumber,
  questionBodySchema,
  questionGaps,
  type QuestionBody,
} from "./questions";
import { scoreShare, shortAnswerMatches } from "./grading";

const mcq: QuestionBody = {
  stem: "Cho $a \\ss b$. Khẳng định nào đúng?",
  media: null,
  explanation: "",
  data: { kind: "mcq", options: ["A1", "B1", "C1", "D1"], correct: 2 },
};
const tf: QuestionBody = {
  stem: "Cho hình chóp $S.ABCD$.",
  media: null,
  explanation: "",
  data: { kind: "tf", statements: ["a", "b", "c", "d"], correct: [true, false, true, false] },
};
const short = (
  answers: string[],
  tolerance: number | null = null,
  mode: "number" | "text" = "number",
) => ({ kind: "short", mode, answers, tolerance }) as const;

describe("question model", () => {
  it("validates bodies and rejects broken ones", () => {
    expect(questionBodySchema.safeParse(mcq).success).toBe(true);
    expect(questionBodySchema.safeParse(tf).success).toBe(true);
    expect(
      questionBodySchema.safeParse({ ...mcq, data: { ...mcq.data, correct: 4 } }).success,
    ).toBe(false);
    expect(
      questionBodySchema.safeParse({
        ...mcq,
        data: { kind: "mcq", options: ["a", "b"], correct: 0 },
      }).success,
    ).toBe(false);
    expect(questionBodySchema.safeParse(emptyBody("short")).success).toBe(true);
  });

  it("lists what is missing", () => {
    expect(questionGaps(mcq)).toEqual([]);
    expect(questionGaps(emptyBody("mcq"))).toContain("Chưa chọn đáp án đúng");
    expect(questionGaps(emptyBody("tf"))).toContain("Chưa chọn Đúng/Sai cho đủ 4 ý");
    expect(questionGaps({ ...emptyBody("short"), stem: "x" })).toEqual(["Chưa có đáp án"]);
    expect(
      questionGaps({ stem: "x", media: null, explanation: "", data: short(["abc"]) })[0],
    ).toMatch(/không phải số/);
  });

  it("keeps the stem when the kind changes", () => {
    const next = changeKind(mcq, "short");
    expect(next.stem).toBe(mcq.stem);
    expect(next.data.kind).toBe("short");
    expect(changeKind(mcq, "mcq")).toBe(mcq);
  });
});

describe("short answers", () => {
  it("normalises typing differences", () => {
    expect(normalizeShortInput(" − 3 , 5 ")).toBe("-3.5");
    expect(parseAnswerNumber("3,1")).toBe(3.1);
    expect(parseAnswerNumber("03,10")).toBe(3.1);
    expect(parseAnswerNumber(".5")).toBe(0.5);
    expect(parseAnswerNumber("1/2")).toBe(0.5);
    expect(parseAnswerNumber("-3/4")).toBe(-0.75);
    expect(parseAnswerNumber("1/0")).toBeNull();
    expect(parseAnswerNumber("1.000.000")).toBeNull();
    expect(parseAnswerNumber("abc")).toBeNull();
  });

  it("compares numbers by value", () => {
    const d = short(["3,1"]);
    for (const s of ["3,1", "3.1", "3,10", "03,1", " 3 , 1 "])
      expect(shortAnswerMatches(d, s)).toBe(true);
    expect(shortAnswerMatches(d, "3,11")).toBe(false);
    expect(shortAnswerMatches(d, "")).toBe(false);
    expect(shortAnswerMatches(short(["0.3"]), "0.1+0.2")).toBe(false);
  });

  it("uses tolerance and several accepted answers", () => {
    expect(shortAnswerMatches(short(["1.41"], 0.01), "1,414")).toBe(true);
    expect(shortAnswerMatches(short(["1.41"], 0.01), "1,43")).toBe(false);
    expect(shortAnswerMatches(short(["2", "-2"]), "−2")).toBe(true);
    expect(shortAnswerMatches(short(["0.5"]), "1/2")).toBe(true);
  });

  it("compares words without case or marks", () => {
    const d = short(["Song song"], null, "text");
    expect(shortAnswerMatches(d, "song song")).toBe(true);
    expect(shortAnswerMatches(d, "SONG SONG")).toBe(true);
    expect(shortAnswerMatches(d, "cắt nhau")).toBe(false);
  });
});

describe("scoring", () => {
  it("scores each kind", () => {
    expect(scoreShare(mcq.data, { kind: "mcq", choice: 2 })).toBe(1);
    expect(scoreShare(mcq.data, { kind: "mcq", choice: 1 })).toBe(0);
    expect(scoreShare(mcq.data, null)).toBe(0);
    expect(scoreShare(tf.data, { kind: "tf", choices: [true, false, true, false] })).toBe(1);
    expect(scoreShare(tf.data, { kind: "tf", choices: [true, false, true, true] })).toBe(0.5);
    expect(scoreShare(tf.data, { kind: "tf", choices: [true, true, false, true] })).toBe(0.1);
    expect(scoreShare(tf.data, { kind: "tf", choices: [false, true, false, true] })).toBe(0);
    expect(scoreShare(short(["5"]), { kind: "short", text: "5,0" })).toBe(1);
    expect(scoreShare(short(["5"]), { kind: "mcq", choice: 0 })).toBe(0);
  });
});

describe("formula text", async () => {
  const { mathLines, insertSnippet, insideFormula } = await import("./math-text");
  it("splits inline and display formulas by line", () => {
    expect(mathLines("Cho $a \\ss b$ và\n$$S = \\pi r^2$$ xong")).toEqual([
      [
        { type: "text", value: "Cho " },
        { type: "inline", tex: "a \\ss b" },
        { type: "text", value: " và" },
      ],
      [{ type: "display", tex: "S = \\pi r^2" }],
      [{ type: "text", value: " xong" }],
    ]);
    expect(
      mathLines("giá 5$")
        .flat()
        .map((p) => (p.type === "text" ? p.value : ""))
        .join(""),
    ).toBe("giá 5$");
  });
  it("inserts snippets in or out of a formula", () => {
    expect(insideFormula("a $b", 4)).toBe(true);
    expect(insideFormula("a $b$ c", 7)).toBe(false);
    expect(insertSnippet("Cho ", 4, 4, "\\perp ")).toEqual({ text: "Cho $\\perp $", caret: 11 });
    expect(insertSnippet("$x$", 2, 2, "\\frac{}{}")).toEqual({ text: "$x\\frac{}{}$", caret: 8 });
    expect(insertSnippet("Cho AB", 4, 6, "\\overrightarrow{}")).toEqual({
      text: "Cho $\\overrightarrow{AB}$",
      caret: 23,
    });
  });
});
