import { describe, expect, it } from "vitest";
import {
  analyzeMatrix,
  drawExam,
  formatExamCount,
  matrixSlotsSchema,
  seededRandom,
  withOptionOrder,
  type MatrixSlot,
  type PoolQuestion,
} from "./matrix";
import { emptyBody, type QuestionBody, type QuestionKind, type QuestionLevel } from "./questions";
import { scoreAttempt } from "./assignment";

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const banks = [
  { id: B1, title: "Đường thẳng song song" },
  { id: B2, title: "Mặt phẳng song song" },
];
let n = 0;
function qs(
  bankId: string,
  kind: QuestionKind,
  count: number,
  level: QuestionLevel = "nb",
): PoolQuestion[] {
  return Array.from({ length: count }, () => ({ id: `q${++n}`, bankId, kind, level, position: n }));
}
const slot = (
  bankId: string,
  kind: QuestionKind = "mcq",
  points = 1,
  level: QuestionLevel | null = null,
): MatrixSlot => ({ bankId, kind, level, points });

describe("matrix analysis", () => {
  it("counts 5^10 exams for 10 slots of 5-question banks", () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      qs(`${i}0000000-0000-4000-8000-000000000000`, "mcq", 5),
    ).flat();
    const slots = Array.from({ length: 10 }, (_, i) =>
      slot(`${i}0000000-0000-4000-8000-000000000000`),
    );
    const bankList = slots.map((s) => ({ id: s.bankId, title: "x" }));
    const a = analyzeMatrix(slots, questions, bankList);
    expect(a.distinctExams).toBe(9_765_625);
    expect(formatExamCount(a.distinctExams)).toBe("9.765.625");
    expect(a.expectedShared).toBeCloseTo(10 / 5);
    expect(a.totalPoints).toBe(10);
    expect(a.problems).toEqual([]);
  });

  it("never repeats a question when one bank fills several slots", () => {
    const questions = qs(B1, "mcq", 4);
    const a = analyzeMatrix([slot(B1), slot(B1)], questions, banks, 2);
    expect(a.distinctExams).toBe(4 * 3);
    expect(a.expectedShared).toBeCloseTo(4 * (2 / 4) ** 2);
    const tooMany = analyzeMatrix(
      [slot(B1), slot(B1), slot(B1), slot(B1), slot(B1)],
      questions,
      banks,
      5,
    );
    expect(tooMany.distinctExams).toBe(0);
    expect(
      tooMany.problems.some((p) => p.severity === "error" && p.message.includes("cần 5 câu")),
    ).toBe(true);
  });

  it("warns about small banks, wrong kinds, missing banks and the total", () => {
    const questions = [...qs(B1, "mcq", 2), ...qs(B2, "tf", 4)];
    const a = analyzeMatrix(
      [slot(B1, "mcq", 0.25), slot(B2, "mcq", 0.25), slot("33333333-3333-4333-8333-333333333333")],
      questions,
      banks,
    );
    const msgs = a.problems.map((p) => p.message).join("\n");
    expect(msgs).toMatch(/Vị trí 1: chỉ có 2 câu/);
    expect(msgs).toMatch(/Vị trí 2: .*không có câu trắc nghiệm/);
    expect(msgs).toMatch(/Vị trí 3: ngân hàng không còn tồn tại/);
    expect(msgs).toMatch(/Tổng điểm là 1,5, chưa bằng 10/);
    expect(a.distinctExams).toBe(0);
  });

  it("takes levels into account", () => {
    const questions = [...qs(B1, "mcq", 3, "nb"), ...qs(B1, "mcq", 2, "th")];
    const a = analyzeMatrix(
      [slot(B1, "mcq", 1, "th"), slot(B1, "mcq", 1, null)],
      questions,
      banks,
      2,
    );
    expect(a.poolSizes).toEqual([2, 5]);
    expect(a.distinctExams).toBe(2 * 4);
  });

  it("validates stored slots", () => {
    expect(matrixSlotsSchema.safeParse([slot(B1)]).success).toBe(true);
    expect(matrixSlotsSchema.safeParse([{ ...slot(B1), kind: "essay" }]).success).toBe(false);
  });
});

describe("drawing exams", () => {
  const questions = [
    ...qs(B1, "mcq", 5),
    ...qs(B1, "tf", 3),
    ...qs(B2, "short", 4),
    ...qs(B2, "mcq", 1, "vd"),
  ];
  const slots = [
    slot(B2, "short", 0.5),
    slot(B1, "mcq", 0.25),
    slot(B1, "tf", 1),
    slot(B1, "mcq", 0.25),
    slot(B2, "mcq", 0.25, "vd"),
  ];

  it("gives one question per slot, no repeats, parts in order I–II–III and a code per slot", () => {
    const e = drawExam(slots, questions, seededRandom(7), {
      shuffleOptions: true,
      shuffleOrder: false,
    });
    expect(e.items.map((i) => i.kind)).toEqual(["mcq", "mcq", "mcq", "tf", "short"]);
    expect(e.items.map((i) => i.slot)).toEqual([1, 3, 4, 2, 0]);
    expect(new Set(e.items.map((i) => i.questionId)).size).toBe(5);
    expect(e.code.split("-")).toHaveLength(5);
    for (const it of e.items)
      if (it.kind === "mcq") expect([...it.optionOrder!].sort()).toEqual([0, 1, 2, 3]);
  });

  it("is repeatable with the same seed and varies with another", () => {
    const a = drawExam(slots, questions, seededRandom(1), {
      shuffleOptions: true,
      shuffleOrder: true,
    });
    const b = drawExam(slots, questions, seededRandom(1), {
      shuffleOptions: true,
      shuffleOrder: true,
    });
    expect(a).toEqual(b);
    const codes = new Set(
      Array.from(
        { length: 30 },
        (_, s) =>
          drawExam(slots, questions, seededRandom(s + 2), {
            shuffleOptions: false,
            shuffleOrder: false,
          }).code,
      ),
    );
    expect(codes.size).toBeGreaterThan(5);
  });

  it("keeps parts together when shuffling order and avoids given questions when it can", () => {
    const e = drawExam(
      slots,
      questions,
      seededRandom(3),
      { shuffleOptions: false, shuffleOrder: true },
      new Set(
        questions
          .filter((q) => q.kind === "short")
          .slice(0, 3)
          .map((q) => q.id),
      ),
    );
    expect(e.items.map((i) => i.kind)).toEqual(["mcq", "mcq", "mcq", "tf", "short"]);
    const shortId = e.items.find((i) => i.kind === "short")!.questionId;
    expect(shortId).toBe(questions.filter((q) => q.kind === "short")[3]!.id);
    expect(e.items.find((i) => i.kind === "mcq")!.optionOrder).toEqual([0, 1, 2, 3]);
  });

  it("moves the right answer with the options", () => {
    const body = {
      ...emptyBody("mcq"),
      data: {
        kind: "mcq" as const,
        options: ["a", "b", "c", "d"] as [string, string, string, string],
        correct: 1,
      },
    };
    const shown = withOptionOrder(body, [2, 1, 3, 0]);
    expect(shown.data).toEqual({ kind: "mcq", options: ["c", "b", "d", "a"], correct: 1 });
    expect(withOptionOrder(body, [3, 2, 1, 0]).data).toMatchObject({
      options: ["d", "c", "b", "a"],
      correct: 2,
    });
  });
});

describe("pinned slots and statement shuffling", () => {
  const B = "bbbbbbbb-0000-4000-8000-000000000000";
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const pool = [1, 2, 3].map((n) => ({
    id: id(n),
    bankId: B,
    kind: n === 3 ? ("tf" as const) : ("mcq" as const),
    level: "nb" as const,
    position: n,
  }));
  const slots = pool.map((q) => ({
    bankId: B,
    kind: q.kind,
    level: q.level,
    points: q.kind === "tf" ? 1 : 0.25,
    questionId: q.id,
  }));
  it("counts a fully pinned exam as one set shared by everyone", () => {
    const a = analyzeMatrix(slots, pool, [{ id: B, title: "Đề" }], 1.5);
    expect(a.distinctExams).toBe(1);
    expect(a.expectedShared).toBe(3);
    expect(a.problems.filter((p) => p.severity === "error")).toEqual([]);
    const missing = analyzeMatrix(slots, pool.slice(0, 2), [{ id: B, title: "Đề" }], 1.5);
    expect(missing.problems.some((p) => p.severity === "error")).toBe(true);
  });
  it("draws exactly the pinned questions and can shuffle the four statements", () => {
    const exam = drawExam(slots, pool, seededRandom(7), {
      shuffleOptions: true,
      shuffleOrder: true,
      shuffleStatements: true,
    });
    expect(exam.items.map((i) => i.questionId).sort()).toEqual(pool.map((q) => q.id).sort());
    expect(exam.items.at(-1)!.kind).toBe("tf");
    expect([...exam.items.at(-1)!.statementOrder!].sort()).toEqual([0, 1, 2, 3]);
    const tf: QuestionBody = {
      stem: "",
      media: null,
      explanation: "",
      data: { kind: "tf", statements: ["a", "b", "c", "d"], correct: [true, false, false, true] },
    };
    const shown = withOptionOrder(tf, null, [3, 0, 2, 1]);
    expect(shown.data).toMatchObject({
      statements: ["d", "a", "c", "b"],
      correct: [true, true, false, false],
    });
    const scored = scoreAttempt(
      [{ points: 1, optionOrder: null, statementOrder: [3, 0, 2, 1] }],
      [tf],
      [{ kind: "tf", choices: [true, true, false, false] }],
      10,
    );
    expect(scored.score).toBe(10);
  });
});
