// Exam matrices: an ordered list of slots, each saying "one question of this kind (and level)
// from this bank, worth this many points". Every student gets their own draw. Pure, so the
// teacher's preview and the server's real draw (stage 5) follow exactly the same rules.
import { z } from "zod";
import type { QuestionBody, QuestionKind, QuestionLevel } from "./questions";

export const matrixSlotSchema = z.object({
  bankId: z.string().uuid(),
  kind: z.enum(["mcq", "tf", "short"]),
  /** null = any level in the bank */
  level: z.enum(["nb", "th", "vd", "vdc"]).nullable(),
  points: z.number().min(0).max(100),
});
export const matrixSlotsSchema = z.array(matrixSlotSchema).max(200);
export type MatrixSlot = z.infer<typeof matrixSlotSchema>;

/** Points per question in the 2025 national maths exam: 12 × 0,25 + 4 × 1 + 6 × 0,5 = 10. */
export const THPT_POINTS: Record<QuestionKind, number> = { mcq: 0.25, tf: 1, short: 0.5 };
export const KIND_ORDER: QuestionKind[] = ["mcq", "tf", "short"];

/** What the matrix needs to know about a usable question (not hidden, nothing missing). */
export interface PoolQuestion {
  id: string;
  bankId: string;
  kind: QuestionKind;
  level: QuestionLevel;
  position: number;
}

export interface MatrixProblem {
  /** slot index (0-based), or null for the whole matrix */
  slot: number | null;
  severity: "error" | "warning";
  message: string;
}

export interface MatrixAnalysis {
  slotCount: number;
  byKind: Record<QuestionKind, { count: number; points: number }>;
  totalPoints: number;
  /** usable questions for each slot */
  poolSizes: number[];
  /** number of different exams (0 when the matrix cannot be filled) */
  distinctExams: number;
  /** expected number of questions two students have in common */
  expectedShared: number;
  problems: MatrixProblem[];
}

export function poolFor(slot: MatrixSlot, questions: PoolQuestion[]): PoolQuestion[] {
  return questions
    .filter(
      (q) =>
        q.bankId === slot.bankId &&
        q.kind === slot.kind &&
        (slot.level === null || q.level === slot.level),
    )
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** n·(n−1)·…·(n−k+1): ways to fill k slots from n questions without repeating one. */
function arrangements(n: number, k: number): number {
  if (k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r *= n - i;
  return r;
}

const LEVEL_TEXT: Record<QuestionLevel, string> = {
  nb: "nhận biết",
  th: "thông hiểu",
  vd: "vận dụng",
  vdc: "vận dụng cao",
};
const KIND_TEXT: Record<QuestionKind, string> = {
  mcq: "trắc nghiệm",
  tf: "đúng/sai",
  short: "trả lời ngắn",
};

export function analyzeMatrix(
  slots: MatrixSlot[],
  questions: PoolQuestion[],
  banks: { id: string; title: string }[],
  scale = 10,
): MatrixAnalysis {
  const problems: MatrixProblem[] = [];
  const byKind: MatrixAnalysis["byKind"] = {
    mcq: { count: 0, points: 0 },
    tf: { count: 0, points: 0 },
    short: { count: 0, points: 0 },
  };
  const bankTitle = new Map(banks.map((b) => [b.id, b.title]));
  const poolSizes = slots.map((s) => poolFor(s, questions).length);

  slots.forEach((s, i) => {
    byKind[s.kind].count += 1;
    byKind[s.kind].points += s.points;
    if (!bankTitle.has(s.bankId))
      problems.push({
        slot: i,
        severity: "error",
        message: `Vị trí ${i + 1}: ngân hàng không còn tồn tại`,
      });
    else if (poolSizes[i] === 0)
      problems.push({
        slot: i,
        severity: "error",
        message: `Vị trí ${i + 1}: ngân hàng “${bankTitle.get(s.bankId)}” không có câu ${KIND_TEXT[s.kind]}${s.level ? ` mức ${LEVEL_TEXT[s.level]}` : ""} nào dùng được`,
      });
    else if ((poolSizes[i] ?? 0) < 3)
      problems.push({
        slot: i,
        severity: "warning",
        message: `Vị trí ${i + 1}: chỉ có ${poolSizes[i]} câu để rút, nhiều học sinh sẽ trùng câu (nên có từ 3 câu)`,
      });
    if (s.points === 0)
      problems.push({ slot: i, severity: "warning", message: `Vị trí ${i + 1}: điểm bằng 0` });
  });

  // Count exams and shared questions group by group: slots of one bank and kind compete for the
  // same questions; level-specific slots take from their level, "any level" slots from what is left.
  let distinct = slots.length ? 1 : 0;
  let shared = 0;
  const groups = new Map<string, number[]>();
  slots.forEach((s, i) => {
    const key = `${s.bankId}|${s.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  for (const [key, idx] of groups) {
    const [bankId, kind] = key.split("|") as [string, QuestionKind];
    const all = questions.filter((q) => q.bankId === bankId && q.kind === kind);
    const specific = new Map<QuestionLevel, number>();
    let anyLevel = 0;
    for (const i of idx) {
      const level = slots[i]!.level;
      if (level) specific.set(level, (specific.get(level) ?? 0) + 1);
      else anyLevel += 1;
    }
    let taken = 0;
    const chance = new Map<string, number>();
    for (const [level, k] of specific) {
      const pool = all.filter((q) => q.level === level);
      distinct *= arrangements(pool.length, k);
      if (pool.length < k && pool.length > 0)
        problems.push({
          slot: idx.find((i) => slots[i]!.level === level) ?? null,
          severity: "error",
          message: `Ngân hàng “${bankTitle.get(bankId) ?? "?"}” có ${pool.length} câu ${KIND_TEXT[kind]} mức ${LEVEL_TEXT[level]} nhưng ma trận cần ${k} câu khác nhau`,
        });
      for (const q of pool) chance.set(q.id, pool.length ? Math.min(1, k / pool.length) : 0);
      taken += k;
    }
    if (anyLevel) {
      const left = all.length - taken;
      distinct *= arrangements(left, anyLevel);
      if (left < anyLevel && all.length > 0)
        problems.push({
          slot: idx.find((i) => slots[i]!.level === null) ?? null,
          severity: "error",
          message: `Ngân hàng “${bankTitle.get(bankId) ?? "?"}” có ${all.length} câu ${KIND_TEXT[kind]} nhưng ma trận cần ${taken + anyLevel} câu khác nhau`,
        });
      const extra = left > 0 ? Math.min(1, anyLevel / left) : 0;
      for (const q of all) {
        const p = chance.get(q.id) ?? 0;
        chance.set(q.id, p + (1 - p) * extra);
      }
    }
    for (const p of chance.values()) shared += p * p;
  }
  if (problems.some((p) => p.severity === "error")) distinct = 0;

  const totalPoints = Math.round(slots.reduce((sum, s) => sum + s.points, 0) * 1000) / 1000;
  if (slots.length && Math.abs(totalPoints - scale) > 1e-6)
    problems.push({
      slot: null,
      severity: "warning",
      message: `Tổng điểm là ${formatPoints(totalPoints)}, chưa bằng ${scale}`,
    });
  if (!slots.length)
    problems.push({ slot: null, severity: "error", message: "Ma trận chưa có vị trí nào" });

  return {
    slotCount: slots.length,
    byKind,
    totalPoints,
    poolSizes,
    distinctExams: distinct,
    expectedShared: shared,
    problems,
  };
}

export function formatPoints(n: number): string {
  return (Math.round(n * 1000) / 1000).toString().replace(".", ",");
}

/** "9.765.625", or "hơn 1 triệu tỉ" for numbers too large to be meaningful. */
export function formatExamCount(n: number): string {
  if (n >= 1e15) return "hơn 1 triệu tỉ";
  return Math.round(n).toLocaleString("vi-VN");
}

// ---------- drawing an exam ----------

/** Small seeded generator (mulberry32) so a preview can be repeated; the server passes crypto randomness. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface DrawnItem {
  slot: number;
  questionId: string;
  kind: QuestionKind;
  points: number;
  /** 1-based number of the question in its slot's pool (part of the exam code) */
  poolNumber: number;
  /** order the four options are shown in (original indices), mcq only */
  optionOrder: number[] | null;
}

export interface DrawnExam {
  /** questions in the order the student sees them: Phần I, II, III */
  items: DrawnItem[];
  /** one number per slot in matrix order, e.g. "3-1-4-2" */
  code: string;
}

export function drawExam(
  slots: MatrixSlot[],
  questions: PoolQuestion[],
  random: () => number,
  options: { shuffleOptions: boolean; shuffleOrder: boolean },
  /** questions to steer away from when the pool allows (e.g. a retake after a cancelled attempt) */
  avoid: ReadonlySet<string> = new Set(),
): DrawnExam {
  const used = new Set<string>();
  const picked: (DrawnItem | null)[] = slots.map(() => null);
  // level-specific slots first, so an "any level" slot never takes a question a later slot needs
  const order = slots
    .map((s, i) => i)
    .sort((a, b) => Number(slots[a]!.level === null) - Number(slots[b]!.level === null) || a - b);
  for (const i of order) {
    const slot = slots[i]!;
    const pool = poolFor(slot, questions);
    const free = pool.filter((q) => !used.has(q.id));
    if (!free.length) throw new Error(`Vị trí ${i + 1} không còn câu để rút`);
    const fresh = free.filter((q) => !avoid.has(q.id));
    const from = fresh.length ? fresh : free;
    const q = from[Math.floor(random() * from.length)]!;
    used.add(q.id);
    picked[i] = {
      slot: i,
      questionId: q.id,
      kind: slot.kind,
      points: slot.points,
      poolNumber: pool.indexOf(q) + 1,
      optionOrder:
        slot.kind === "mcq"
          ? options.shuffleOptions
            ? shuffle([0, 1, 2, 3], random)
            : [0, 1, 2, 3]
          : null,
    };
  }
  const code = picked.map((p) => p!.poolNumber).join("-");
  const items: DrawnItem[] = [];
  for (const kind of KIND_ORDER) {
    const part = picked.filter((p): p is DrawnItem => p !== null && p.kind === kind);
    items.push(...(options.shuffleOrder ? shuffle(part, random) : part));
  }
  return { items, code };
}

/** The question as this student sees it: options in their drawn order, answer moved with them. */
export function withOptionOrder(body: QuestionBody, order: number[] | null): QuestionBody {
  if (!order || body.data.kind !== "mcq") return body;
  const d = body.data;
  const options = order.map((i) => d.options[i] ?? "") as [string, string, string, string];
  const at = d.correct === null ? -1 : order.indexOf(d.correct);
  return { ...body, data: { ...d, options, correct: at < 0 ? null : at } };
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] ?? 1;
}
