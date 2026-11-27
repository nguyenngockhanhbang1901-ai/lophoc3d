import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";
import type { QuestionBody } from "./questions";

let db: FakeDb;
vi.mock("./db.server", () => ({ examDb: () => db }));

const { beginAttempt, recordAnswer, finishAttempt, finishIfExpired, GRACE_MS } =
  await import("./attempt.server");
type AssignmentRow = import("./attempt.server").AssignmentRow;
type AttemptRow = import("./attempt.server").AttemptRow;

const OWNER = "aaaaaaaa-0000-4000-8000-000000000000";
const BANK = "bbbbbbbb-0000-4000-8000-000000000000";
const STUDENT = "cccccccc-0000-4000-8000-000000000000";
const T0 = new Date("2026-11-27T08:00:00+07:00").getTime();

const mcq = (i: number): QuestionBody => ({
  stem: `TN ${i}`,
  media: null,
  explanation: "",
  data: { kind: "mcq", options: ["a", "b", "c", "d"], correct: 1 },
});
const tf: QuestionBody = {
  stem: "ĐS",
  media: null,
  explanation: "",
  data: { kind: "tf", statements: ["1", "2", "3", "4"], correct: [true, true, false, false] },
};
const short: QuestionBody = {
  stem: "TLN",
  media: null,
  explanation: "",
  data: { kind: "short", mode: "number", answers: ["2,5"], tolerance: null },
};

function seed(): AssignmentRow {
  db = new FakeDb();
  db.uniques.push({
    table: "exam_attempts",
    columns: ["assignment_id", "student_id"],
    where: (r) => r["status"] === "in_progress",
  });
  const add = (body: QuestionBody, position: number) =>
    db.rows("exam_questions").push({
      id: db.id(),
      owner_id: OWNER,
      bank_id: BANK,
      kind: body.data.kind,
      level: "nb",
      position,
      hidden: false,
      body,
    });
  [1, 2, 3, 4].forEach((i) => add(mcq(i), i));
  add(tf, 5);
  add(short, 6);
  const assignment: AssignmentRow = {
    id: "dddddddd-0000-4000-8000-000000000000",
    owner_id: OWNER,
    class_id: "eeeeeeee-0000-4000-8000-000000000000",
    title: "15 phút",
    slots: [
      { bankId: BANK, kind: "mcq", level: null, points: 0.25 },
      { bankId: BANK, kind: "mcq", level: null, points: 0.25 },
      { bankId: BANK, kind: "tf", level: null, points: 1 },
      { bankId: BANK, kind: "short", level: null, points: 0.5 },
    ],
    shuffle_options: true,
    shuffle_order: false,
    opens_at: new Date(T0).toISOString(),
    closes_at: new Date(T0 + 3600_000).toISOString(),
    duration_minutes: 15,
    max_attempts: 1,
    settings: { scale: 10 },
  };
  db.rows("exam_assignments").push({ ...assignment });
  return assignment;
}

const attempt = (id: string) =>
  db.rows("exam_attempts").find((r) => r["id"] === id) as unknown as AttemptRow;

describe("attempt engine", () => {
  let a: AssignmentRow;
  beforeEach(() => {
    a = seed();
  });

  it("respects the opening window and the number of attempts", async () => {
    await expect(beginAttempt(STUDENT, a, "", T0 - 1000)).rejects.toThrow("chưa đến giờ mở");
    await expect(beginAttempt(STUDENT, a, "", T0 + 3600_000)).rejects.toThrow("đã đóng");
    const id = await beginAttempt(STUDENT, a, "", T0 + 60_000);
    // opening again while it runs resumes the same paper
    expect(await beginAttempt(STUDENT, a, "", T0 + 120_000)).toBe(id);
    const row = attempt(id);
    expect(row.items.map((i) => i.kind)).toEqual(["mcq", "mcq", "tf", "short"]);
    expect(new Set(row.items.map((i) => i.questionId)).size).toBe(4);
    expect(new Date(row.deadline_at).getTime()).toBe(T0 + 60_000 + 15 * 60_000);
    await finishAttempt(row, "submitted");
    await expect(beginAttempt(STUDENT, a, "", T0 + 130_000)).rejects.toThrow("hết số lần");
  });

  it("opens questions one at a time, grades with the student's option order, and stops after the deadline", async () => {
    const id = await beginAttempt(STUDENT, a, "", T0);
    const t = T0 + 60_000;
    const row = () => attempt(id);
    await expect(recordAnswer(row(), 1, { kind: "mcq", choice: 0 }, t)).rejects.toThrow("chưa mở");
    // pick the displayed option that is really "b" (index 1 in the stored question)
    const right0 = row().items[0]!.optionOrder!.indexOf(1);
    expect((await recordAnswer(row(), 0, { kind: "mcq", choice: right0 }, t)).reachedIndex).toBe(1);
    const wrong1 = row().items[1]!.optionOrder!.indexOf(0);
    await recordAnswer(row(), 1, { kind: "mcq", choice: wrong1 }, t);
    // partial true/false does not open the next question
    expect(
      (await recordAnswer(row(), 2, { kind: "tf", choices: [true, true, null, null] }, t))
        .reachedIndex,
    ).toBe(2);
    await expect(recordAnswer(row(), 2, { kind: "short", text: "1" } as never, t)).rejects.toThrow(
      "không đúng dạng",
    );
    expect(
      (await recordAnswer(row(), 2, { kind: "tf", choices: [true, true, false, true] }, t))
        .reachedIndex,
    ).toBe(3);
    const last = await recordAnswer(row(), 3, { kind: "short", text: "2.50" }, t);
    expect(last).toEqual({ reachedIndex: 4, completedAll: true });
    expect(row().completed_all_at).not.toBeNull();
    expect(db.rows("exam_answers").every((r) => r["answer_at_completion"] !== undefined)).toBe(
      true,
    );
    expect(db.rows("exam_answer_events")).toHaveLength(5);
    // going back to change an answer is allowed
    await recordAnswer(
      row(),
      1,
      { kind: "mcq", choice: row().items[1]!.optionOrder!.indexOf(1) },
      t,
    );
    await expect(
      recordAnswer(row(), 0, { kind: "mcq", choice: 0 }, T0 + 15 * 60_000 + GRACE_MS + 1),
    ).rejects.toThrow("hết giờ");

    const done = await finishAttempt(row(), "submitted");
    // 0.25 + 0.25 + 1·0.5 + 0.5 = 1.5 of 2 points → 7.5 / 10
    expect(done?.score).toBe(7.5);
    expect(done?.correct_count).toBe(3);
    expect(await finishAttempt(row(), "submitted")).toBeNull();
    await expect(recordAnswer(row(), 0, { kind: "mcq", choice: 0 }, t)).rejects.toThrow("kết thúc");
  });

  it("collects the paper when time runs out", async () => {
    const id = await beginAttempt(STUDENT, a, "", T0);
    db.rows("exam_attempts")[0]!["deadline_at"] = new Date(
      Date.now() - GRACE_MS - 1000,
    ).toISOString();
    const closed = await finishIfExpired(id);
    expect(closed?.status).toBe("timeout");
    expect(closed?.score).toBe(0);
  });
});
