// Pure gradebook rules (Thông tư 22): columns of a book, effective scores after the teacher's
// bonus/penalty, subject averages and the optional "điểm cộng theo số lần" suggestion.
import { z } from "zod";

/** tx/gk/ck = numeric ĐĐGtx/ĐĐGgk/ĐĐGck; dg = Đ/CĐ (subjects graded by comment); nx = text comment. */
export type ColumnKind = "tx" | "gk" | "ck" | "dg" | "nx";

export const columnSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,20}$/),
  kind: z.enum(["tx", "gk", "ck", "dg", "nx"]),
  label: z.string().trim().min(1).max(30),
  /** SMAS PointCode when the column came from a SMAS file */
  smasCode: z.string().max(40).optional(),
});
export type BookColumn = z.infer<typeof columnSchema>;
export const columnsSchema = z.array(columnSchema).min(1).max(20);

export const KIND_LABEL: Record<ColumnKind, string> = {
  tx: "ĐĐG TX",
  gk: "ĐĐG GK",
  ck: "ĐĐG CK",
  dg: "Đánh giá",
  nx: "Nhận xét",
};

export function defaultColumns(txCount = 4, comment = true): BookColumn[] {
  const tx = Array.from({ length: txCount }, (_, i) => ({
    key: `tx${i + 1}`,
    kind: "tx" as const,
    label: `TX${i + 1}`,
  }));
  return [
    ...tx,
    { key: "gk", kind: "gk", label: "GK" },
    { key: "ck", kind: "ck", label: "CK" },
    ...(comment ? [{ key: "nx", kind: "nx" as const, label: "Nhận xét" }] : []),
  ];
}

export const isNumeric = (c: BookColumn) => c.kind === "tx" || c.kind === "gk" || c.kind === "ck";

/** A score cell typed by the teacher: 0–10, comma or dot, at most two decimals. */
export function parseScore(text: string): number | null | "invalid" {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return "invalid";
  const n = Number(t);
  return n >= 0 && n <= 10 ? n : "invalid";
}

export function formatScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/** Excel-style ROUND to one decimal (half away from zero), safe for float noise. */
export function round1(x: number): number {
  return (Math.sign(x) * Math.round(Math.abs(x) * 10 + 1e-9)) / 10;
}

export interface Bonus {
  plus: number;
  minus: number;
}

/** Score after bonus/penalty, kept inside 0–10. */
export function adjusted(raw: number | null, bonus: Bonus | undefined): number | null {
  if (raw === null) return null;
  if (!bonus) return raw;
  const v = raw + bonus.plus - bonus.minus;
  return Math.min(10, Math.max(0, Math.round(v * 100) / 100));
}

export type Values = Record<string, number | null>;

/** Numeric values of a student as they count: the bonus target column carries the bonus. */
export function effectiveValues(
  columns: BookColumn[],
  raw: Values,
  bonus: Bonus | undefined,
  target: string | null,
): Values {
  const out: Values = {};
  for (const c of columns) {
    if (!isNumeric(c)) continue;
    const v = raw[c.key] ?? null;
    out[c.key] = target === c.key ? adjusted(v, bonus) : v;
  }
  return out;
}

/**
 * ĐTB môn học kỳ = (tổng ĐĐGtx + 2·ĐĐGgk + 3·ĐĐGck) / (số ĐĐGtx + 5), làm tròn 1 chữ số.
 * Needs GK, CK and at least one TX; `complete` tells whether every column is filled
 * (SMAS only computes the average when nothing is blank).
 */
export function termAverage(
  columns: BookColumn[],
  values: Values,
): { average: number | null; complete: boolean } {
  const tx = columns.filter((c) => c.kind === "tx").map((c) => values[c.key] ?? null);
  const gk = columns.find((c) => c.kind === "gk");
  const ck = columns.find((c) => c.kind === "ck");
  const g = gk ? (values[gk.key] ?? null) : null;
  const k = ck ? (values[ck.key] ?? null) : null;
  const filled = tx.filter((v): v is number => v !== null);
  const complete = !!gk && !!ck && g !== null && k !== null && filled.length === tx.length;
  if (g === null || k === null || !filled.length) return { average: null, complete };
  const sum = filled.reduce((a, b) => a + b, 0) + 2 * g + 3 * k;
  return { average: round1(sum / (filled.length + 5)), complete };
}

/** ĐTB cả năm = (ĐTB HK I + 2·ĐTB HK II) / 3. */
export function yearAverage(t1: number | null, t2: number | null): number | null {
  if (t1 === null || t2 === null) return null;
  return round1((t1 + 2 * t2) / 3);
}

// ---------- learning-process records and the bonus suggestion ----------

export const BEHAVIOR_KINDS = [
  "phat_bieu",
  "len_bang",
  "lam_tot",
  "khong_lam_bai",
  "khong_chuan_bi",
  "mat_trat_tu",
] as const;
export type BehaviorKind = (typeof BEHAVIOR_KINDS)[number];
export const BEHAVIOR_LABEL: Record<BehaviorKind, string> = {
  phat_bieu: "Phát biểu",
  len_bang: "Lên bảng",
  lam_tot: "Làm tốt nhiệm vụ",
  khong_lam_bai: "Không làm bài tập",
  khong_chuan_bi: "Không chuẩn bị bài",
  mat_trat_tu: "Mất trật tự",
};
export const BEHAVIOR_POSITIVE: Record<BehaviorKind, boolean> = {
  phat_bieu: true,
  len_bang: true,
  lam_tot: true,
  khong_lam_bai: false,
  khong_chuan_bi: false,
  mat_trat_tu: false,
};

export const bonusRuleSchema = z.object({
  enabled: z.boolean(),
  plusKinds: z.array(z.enum(BEHAVIOR_KINDS)),
  plusEvery: z.number().int().min(1).max(50),
  plusStep: z.number().min(0.05).max(5),
  minusKinds: z.array(z.enum(BEHAVIOR_KINDS)),
  minusEvery: z.number().int().min(1).max(50),
  minusStep: z.number().min(0.05).max(5),
});
export type BonusRule = z.infer<typeof bonusRuleSchema>;

export const DEFAULT_RULE: BonusRule = {
  enabled: false,
  plusKinds: ["phat_bieu", "len_bang", "lam_tot"],
  plusEvery: 5,
  plusStep: 0.5,
  minusKinds: ["khong_lam_bai", "khong_chuan_bi"],
  minusEvery: 3,
  minusStep: 0.5,
};

export type Counts = Partial<Record<BehaviorKind, number>>;

/** What the rule would give for these counts; the teacher decides whether to apply it. */
export function suggestBonus(counts: Counts, rule: BonusRule): Bonus {
  const sum = (kinds: BehaviorKind[]) => kinds.reduce((a, k) => a + (counts[k] ?? 0), 0);
  const steps = (n: number, every: number, step: number) =>
    Math.round(Math.floor(n / every) * step * 100) / 100;
  return {
    plus: steps(sum(rule.plusKinds), rule.plusEvery, rule.plusStep),
    minus: steps(sum(rule.minusKinds), rule.minusEvery, rule.minusStep),
  };
}

/** Colour of a score: under 5 red, under 3.5 dark red on a light red ground. */
export function scoreTone(v: number | null | undefined): "" | "low" | "very_low" {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  if (v < 3.5) return "very_low";
  if (v < 5) return "low";
  return "";
}
export const SCORE_TONE_CLASS: Record<"" | "low" | "very_low", string> = {
  "": "",
  low: "text-red-600 font-semibold",
  very_low: "text-red-900 font-bold bg-red-100",
};
export const scoreClass = (v: number | null | undefined) => SCORE_TONE_CLASS[scoreTone(v)];
