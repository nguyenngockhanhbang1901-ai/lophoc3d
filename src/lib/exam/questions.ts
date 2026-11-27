// Question model for the exam library: three kinds as in the Vietnamese high-school exam
// (four-option multiple choice, true/false with four statements, short answer). Text fields
// hold TeX between $...$ and are typeset by MathText. The body is stored as jsonb and always
// validated with questionBodySchema, on save and before it is ever served.
import { z } from "zod";

export type QuestionKind = "mcq" | "tf" | "short";
export type QuestionLevel = "nb" | "th" | "vd" | "vdc";

export const KIND_LABEL: Record<QuestionKind, string> = {
  mcq: "Trắc nghiệm 4 lựa chọn",
  tf: "Đúng/sai",
  short: "Trả lời ngắn",
};
export const LEVEL_LABEL: Record<QuestionLevel, string> = {
  nb: "Nhận biết",
  th: "Thông hiểu",
  vd: "Vận dụng",
  vdc: "Vận dụng cao",
};
export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
export const STATEMENT_LETTERS = ["a", "b", "c", "d"] as const;

const MAX_TEXT = 4000;
const MAX_MEDIA_SRC = 400_000;
const text = z.string().max(MAX_TEXT);

export const questionMediaSchema = z.union([
  z.object({
    kind: z.literal("image"),
    src: z.string().min(1).max(MAX_MEDIA_SRC),
    alt: z.string().max(200).optional(),
  }),
  z.object({
    kind: z.literal("model3d"),
    src: z.string().max(MAX_MEDIA_SRC).optional(),
    modelId: z.string().max(100).optional(),
    alt: z.string().max(200).optional(),
  }),
]);
export type QuestionMedia = z.infer<typeof questionMediaSchema>;

const mcqSchema = z.object({
  kind: z.literal("mcq"),
  options: z.tuple([text, text, text, text]),
  /** index of the right option, null while the teacher has not chosen */
  correct: z.number().int().min(0).max(3).nullable(),
});
const tfSchema = z.object({
  kind: z.literal("tf"),
  statements: z.tuple([text, text, text, text]),
  correct: z.tuple([
    z.boolean().nullable(),
    z.boolean().nullable(),
    z.boolean().nullable(),
    z.boolean().nullable(),
  ]),
});
const shortSchema = z.object({
  kind: z.literal("short"),
  /** "number": compared by value with a tolerance; "text": compared as words, ignoring case */
  mode: z.enum(["number", "text"]),
  answers: z.array(z.string().max(100)).max(10),
  /** allowed difference for numbers, e.g. 0.01; null = exact value */
  tolerance: z.number().min(0).max(1_000_000).nullable(),
});

export const questionDataSchema = z.discriminatedUnion("kind", [mcqSchema, tfSchema, shortSchema]);
export type QuestionData = z.infer<typeof questionDataSchema>;
export type McqData = z.infer<typeof mcqSchema>;
export type TfData = z.infer<typeof tfSchema>;
export type ShortData = z.infer<typeof shortSchema>;

export const questionBodySchema = z.object({
  stem: text,
  media: questionMediaSchema.nullable(),
  explanation: text,
  data: questionDataSchema,
});
export type QuestionBody = z.infer<typeof questionBodySchema>;

export interface QuestionRow {
  id: string;
  bank_id: string;
  position: number;
  kind: QuestionKind;
  level: QuestionLevel;
  topic: string;
  body: QuestionBody;
  hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface BankRow {
  id: string;
  title: string;
  topic: string;
  description: string;
  /** the bài this dạng toán belongs to in the classification tree (null: unclassified) */
  topic_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export function emptyData(kind: QuestionKind): QuestionData {
  if (kind === "mcq") return { kind, options: ["", "", "", ""], correct: null };
  if (kind === "tf")
    return { kind, statements: ["", "", "", ""], correct: [null, null, null, null] };
  return { kind, mode: "number", answers: [""], tolerance: null };
}

export function emptyBody(kind: QuestionKind): QuestionBody {
  return { stem: "", media: null, explanation: "", data: emptyData(kind) };
}

/** Moving between kinds keeps the stem, picture and explanation. */
export function changeKind(body: QuestionBody, kind: QuestionKind): QuestionBody {
  return body.data.kind === kind ? body : { ...body, data: emptyData(kind) };
}

/** What still has to be filled in before the question can go into an exam (empty = ready). */
export function questionGaps(body: QuestionBody): string[] {
  const gaps: string[] = [];
  if (!body.stem.trim()) gaps.push("Chưa có đề bài");
  const d = body.data;
  if (d.kind === "mcq") {
    d.options.forEach((o, i) => {
      if (!o.trim()) gaps.push(`Phương án ${OPTION_LETTERS[i]} trống`);
    });
    if (d.correct === null) gaps.push("Chưa chọn đáp án đúng");
  } else if (d.kind === "tf") {
    d.statements.forEach((s, i) => {
      if (!s.trim()) gaps.push(`Ý ${STATEMENT_LETTERS[i]} trống`);
    });
    if (d.correct.some((c) => c === null)) gaps.push("Chưa chọn Đúng/Sai cho đủ 4 ý");
  } else {
    const answers = d.answers.map((a) => a.trim()).filter(Boolean);
    if (!answers.length) gaps.push("Chưa có đáp án");
    if (d.mode === "number") {
      const bad = answers.filter((a) => parseAnswerNumber(a) === null);
      if (bad.length) gaps.push(`Đáp án không phải số: ${bad.join(", ")}`);
    }
  }
  return gaps;
}

// ---- Short-answer normalisation (shared with grading) ----

/** Remove spaces, unify the minus sign, accept both "," and "." as the decimal mark. */
export function normalizeShortInput(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\s+/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/,/g, ".")
    .replace(/^\+/, "");
}

/** Number from a short answer: 3,1 · -0.5 · .5 · 03,10 · 1/2 · -3/4. null when not a number. */
export function parseAnswerNumber(input: string): number | null {
  const s = normalizeShortInput(input);
  if (/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return Number(s);
  const frac = /^(-?\d+)\/(\d+)$/.exec(s);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  return null;
}
