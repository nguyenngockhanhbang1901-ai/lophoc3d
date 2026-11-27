import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";
import type { QuestionBody } from "./questions";
import type { StudentAnswer } from "./grading";

let db: FakeDb;
vi.mock("./db.server", () => ({ examDb: () => db }));

const {
  createWordExam,
  deleteWordExam,
  updateWordExamQuestion,
  wordExamQuestions,
  wordExamProblems,
} = await import("./word-exam.server");
const { beginAttempt, recordAnswer, finishAttempt, loadBodies } = await import("./attempt.server");
const { studentQuestion } = await import("./assignment");

const OWNER = "aaaaaaaa-0000-4000-8000-000000000000";
const STUDENT = "cccccccc-0000-4000-8000-000000000000";
const T0 = new Date("2026-11-27T08:00:00+07:00").getTime();

const mcq = (i: number): QuestionBody => ({
  stem: `TN ${i}`,
  media: null,
  explanation: "",
  data: { kind: "mcq", options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`], correct: 1 },
});
const tf: QuestionBody = {
  stem: "ĐS",
  media: null,
  explanation: "",
  data: { kind: "tf", statements: ["s1", "s2", "s3", "s4"], correct: [true, false, true, false] },
};
const short: QuestionBody = {
  stem: "TLN",
  media: null,
  explanation: "",
  data: { kind: "short", mode: "number", answers: ["2,5"], tolerance: null },
};

const input = (questions: QuestionBody[]) => ({
  title: "Kiểm tra 15 phút",
  sourceFile: "de-15-phut.docx",
  questions: questions.map((body) => ({ level: "nb" as const, body })),
  points: { mcq: 0.25, tf: 1, short: 0.5 },
  shuffleOptions: true,
  shuffleOrder: true,
  shuffleStatements: true,
});

beforeEach(() => {
  db = new FakeDb();
  db.uniques.push({
    table: "exam_attempts",
    columns: ["assignment_id", "student_id"],
    where: (r) => r["status"] === "in_progress",
  });
});

describe("exams made from a Word file", () => {
  it("refuses a file with an incomplete question", async () => {
    const broken: QuestionBody = {
      ...mcq(9),
      data: { kind: "mcq", options: ["a", "b", "c", "d"], correct: null },
    };
    expect(wordExamProblems([{ body: broken }])).toHaveLength(1);
    await expect(createWordExam(OWNER, input([mcq(1), broken]))).rejects.toThrow("Câu 2");
    expect(db.rows("exam_banks")).toHaveLength(0);
  });

  it("pins every question, shuffles per student and still grades right", async () => {
    // short first in the file: the exam still runs Phần I, II, III
    const id = await createWordExam(OWNER, input([short, mcq(1), tf, mcq(2)]));
    expect(db.rows("exam_banks")[0]).toMatchObject({ purpose: "word_exam" });
    const matrix = db.rows("exam_matrices")[0]!;
    expect(matrix).toMatchObject({
      purpose: "word_exam",
      shuffle_statements: true,
      source_file: "de-15-phut.docx",
    });
    const slots = matrix["slots"] as { kind: string; questionId: string }[];
    expect(slots.map((s) => s.kind)).toEqual(["mcq", "mcq", "tf", "short"]);

    const assignment = {
      id: "dddddddd-0000-4000-8000-000000000000",
      owner_id: OWNER,
      class_id: "eeeeeeee-0000-4000-8000-000000000000",
      title: "Kiểm tra",
      slots,
      shuffle_options: true,
      shuffle_order: true,
      shuffle_statements: true,
      opens_at: new Date(T0 - 60_000).toISOString(),
      closes_at: new Date(T0 + 3600_000).toISOString(),
      duration_minutes: 15,
      max_attempts: 3,
      settings: { scale: 10 },
    };
    db.rows("exam_assignments").push({ ...assignment, matrix_id: id });

    const attemptId = await beginAttempt(STUDENT, assignment as never, "", T0, "dev");
    const attempt = () =>
      db.rows("exam_attempts").find((a) => a["id"] === attemptId) as never as {
        items: {
          questionId: string;
          kind: string;
          optionOrder: number[] | null;
          statementOrder?: number[] | null;
        }[];
        code: string;
        score: number | null;
      } & Record<string, unknown>;
    const items = attempt().items;
    expect(new Set(items.map((i) => i.questionId)).size).toBe(4);
    expect(attempt().code).toMatch(/^\d{4}$/);
    const tfItem = items.find((i) => i.kind === "tf")!;
    expect([...tfItem.statementOrder!].sort()).toEqual([0, 1, 2, 3]);

    // answer everything right, in the order and arrangement the student sees
    const bodies = await loadBodies(items.map((i) => i.questionId));
    for (const [n, item] of items.entries()) {
      const shown = studentQuestion(bodies.get(item.questionId)!, item);
      let answer: StudentAnswer;
      if (shown.kind === "mcq") answer = { kind: "mcq", choice: item.optionOrder!.indexOf(1) };
      else if (shown.kind === "tf") {
        const truth = ["s1", "s3"];
        answer = { kind: "tf", choices: shown.statements.map((st) => truth.includes(st)) };
      } else answer = { kind: "short", text: "2.5" };
      await recordAnswer(attempt() as never, n, answer, T0 + (n + 1) * 1000);
    }
    await finishAttempt(attempt() as never, "submitted", { now: T0 + 10_000 });
    expect(attempt().score).toBe(10);
  });

  it("lets the teacher fix a question until someone starts, then locks it", async () => {
    const id = await createWordExam(OWNER, input([mcq(1), mcq(2), tf]));
    let view = await wordExamQuestions(OWNER, id);
    expect(view.locked).toBe(false);
    const second = view.questions[1]!.id;
    // turning a multiple-choice question into a short answer moves it to Phần III with its points
    await updateWordExamQuestion(OWNER, id, second, "th", short);
    view = await wordExamQuestions(OWNER, id);
    expect(view.questions.map((q) => q.body?.data.kind)).toEqual(["mcq", "tf", "short"]);
    expect(view.questions[2]).toMatchObject({ points: 0.25, level: "th" });
    await expect(updateWordExamQuestion("x", id, second, "nb", short)).rejects.toThrow();

    db.rows("exam_assignments").push({ id: "a1", matrix_id: id });
    await expect(deleteWordExam(OWNER, id)).rejects.toThrow("bài giao");
    db.rows("exam_attempts").push({ id: "t1", assignment_id: "a1" });
    expect((await wordExamQuestions(OWNER, id)).locked).toBe(true);
    await expect(updateWordExamQuestion(OWNER, id, second, "nb", short)).rejects.toThrow(
      "không sửa",
    );
  });

  it("deletes an unused exam with its questions", async () => {
    const id = await createWordExam(OWNER, input([mcq(1)]));
    await deleteWordExam(OWNER, id);
    expect(db.rows("exam_matrices")).toHaveLength(0);
    expect(db.rows("exam_banks")).toHaveLength(0);
  });
});
