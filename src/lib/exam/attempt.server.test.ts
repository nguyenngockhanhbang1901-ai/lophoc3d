import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";
import type { QuestionBody } from "./questions";

let db: FakeDb;
vi.mock("./db.server", () => ({ examDb: () => db }));

const {
  beginAttempt,
  recordAnswer,
  finishAttempt,
  finishIfExpired,
  touchAttempt,
  reportViolation,
  GRACE_MS,
} = await import("./attempt.server");
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
    expect(last).toMatchObject({ reachedIndex: 4, completedAll: true, editWarning: false });
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

describe("anti-cheat", () => {
  let a: AssignmentRow;
  const DEV = "device-1";
  beforeEach(() => {
    a = seed();
  });

  async function answerAll(id: string, t: number) {
    const row = () => attempt(id);
    await recordAnswer(row(), 0, { kind: "mcq", choice: 0 }, t);
    await recordAnswer(row(), 1, { kind: "mcq", choice: 0 }, t);
    await recordAnswer(row(), 2, { kind: "tf", choices: [true, true, true, true] }, t);
    await recordAnswer(row(), 3, { kind: "short", text: "1" }, t);
  }

  it("keeps the paper on one device until it falls silent", async () => {
    const id = await beginAttempt(STUDENT, a, "", T0, DEV);
    await expect(touchAttempt(attempt(id), "device-2", T0 + 10_000)).rejects.toThrow(
      "thiết bị khác",
    );
    const r = await touchAttempt(attempt(id), DEV, T0 + 10_000);
    expect(r.drop).toBeNull();
    // the first device goes quiet for 40 s: the second takes over, and that is a drop
    const taken = await touchAttempt(attempt(id), "device-2", T0 + 50_000);
    expect(taken.attempt.session_hash).toBe("device-2");
    expect(taken.drop?.outcome).toBe("continue");
    expect(db.rows("exam_violations").map((v) => v["kind"])).toEqual(["second_device"]);
  });

  it("applies the network rule to lost connections", async () => {
    const id = await beginAttempt(STUDENT, a, "", T0, DEV);
    // 1 minute: carry on
    let r = await touchAttempt(attempt(id), DEV, T0 + 60_000);
    expect(r.drop).toMatchObject({ dropNumber: 1, outcome: "continue" });
    expect(r.attempt.disconnect_count).toBe(1);
    // 4 minutes: new exam, not counted
    r = await touchAttempt(attempt(id), DEV, T0 + 5 * 60_000);
    expect(r.drop?.outcome).toBe("new_exam");
    expect(r.attempt.status).toBe("cancelled_network");
    expect(r.attempt.counts_toward_attempts).toBe(false);
    expect(r.attempt.score).toBeNull();
    // a fresh paper is allowed even though max_attempts is 1
    const next = await beginAttempt(STUDENT, a, "", T0 + 5 * 60_000 + 1000, DEV);
    expect(next).not.toBe(id);
    // 6 minutes: new exam, counted
    r = await touchAttempt(attempt(next), DEV, T0 + 11 * 60_000 + 2000);
    expect(r.drop).toMatchObject({ dropNumber: 3, outcome: "new_exam_counted" });
    expect(r.attempt.counts_toward_attempts).toBe(true);
    expect(db.rows("exam_connection_events")).toHaveLength(3);
    // two cancellations so far: the second automatic retake is still allowed
    await expect(beginAttempt(STUDENT, a, "", T0 + 12 * 60_000, DEV)).resolves.toBeTruthy();
  });

  it("stops automatic retakes after the limit", async () => {
    a.settings = { scale: 10, autoRetakes: 1 };
    db.rows("exam_assignments")[0]!["settings"] = a.settings;
    const first = await beginAttempt(STUDENT, a, "", T0, DEV);
    await finishAttempt(attempt(first), "cancelled_edit", { counts: true, now: T0 + 1000 });
    const second = await beginAttempt(STUDENT, a, "", T0 + 2000, DEV);
    await finishAttempt(attempt(second), "cancelled_network", { counts: false, now: T0 + 3000 });
    await expect(beginAttempt(STUDENT, a, "", T0 + 4000, DEV)).rejects.toThrow("giáo viên");
  });

  it("refuses phones when the exam is for computers only", async () => {
    a.settings = { scale: 10, devices: "computer" };
    await expect(
      beginAttempt(STUDENT, a, "Mozilla/5.0 (Linux; Android 14)", T0 + 1000, DEV),
    ).rejects.toThrow("máy tính");
  });

  it("collects the paper after too many violations", async () => {
    const id = await beginAttempt(STUDENT, a, "", T0, DEV);
    for (let i = 1; i <= 3; i++) {
      const r = await reportViolation(attempt(id), "tab_hidden", 2000, T0 + i * 1000);
      expect(r).toMatchObject({ violationCount: i, maxWarnings: 3, status: "in_progress" });
    }
    const r = await reportViolation(attempt(id), "fullscreen_exit", null, T0 + 5000);
    expect(r.status).toBe("violation");
    expect(attempt(id).score).not.toBeNull();
    await expect(beginAttempt(STUDENT, a, "", T0 + 6000, DEV)).rejects.toThrow("vi phạm");
  });

  it("warns once, then cancels a fast paper whose answers keep changing", async () => {
    const id = await beginAttempt(STUDENT, a, "", T0, DEV);
    const t = T0 + 60_000; // 1 of 15 minutes: fast, limit 50% of 4 questions
    await answerAll(id, t);
    const row = () => attempt(id);
    let r = await recordAnswer(row(), 0, { kind: "mcq", choice: 1 }, t);
    // 1 changed; a second change would reach 50% but not exceed it → still fine
    expect(r).toMatchObject({ editWarning: false, status: "in_progress" });
    r = await recordAnswer(row(), 1, { kind: "mcq", choice: 1 }, t);
    // 2 of 4 changed: one more would cross 50% → warning
    expect(r.editWarning).toBe(true);
    expect(row().edit_warned_at).not.toBeNull();
    // changing back an answer is not an edit
    r = await recordAnswer(row(), 1, { kind: "mcq", choice: 0 }, t);
    expect(r.status).toBe("in_progress");
    r = await recordAnswer(row(), 1, { kind: "mcq", choice: 2 }, t);
    expect(r).toMatchObject({ editWarning: false, status: "in_progress" });
    r = await recordAnswer(row(), 3, { kind: "short", text: "2" }, t);
    expect(r.status).toBe("cancelled_edit");
    expect(row().counts_toward_attempts).toBe(true);
    expect(row().edit_count).toBe(3);
    // a new exam follows automatically
    expect(await beginAttempt(STUDENT, a, "", t + 1000, DEV)).not.toBe(id);
  });

  it("opens one more attempt with a teacher's permission, then uses it up", async () => {
    const id = await beginAttempt(STUDENT, a, "", T0, DEV);
    for (let i = 1; i <= 4; i++) await reportViolation(attempt(id), "tab_hidden", null, T0 + i);
    expect(attempt(id).status).toBe("violation");
    await expect(beginAttempt(STUDENT, a, "", T0 + 10_000, DEV)).rejects.toThrow("vi phạm");
    const grant = {
      id: db.id(),
      assignment_id: a.id,
      student_id: STUDENT,
      owner_id: OWNER,
      reason: "",
      expires_at: new Date(T0 + 3600_000).toISOString(),
      created_at: new Date(T0).toISOString(),
      used_at: null,
      used_attempt_id: null,
      revoked_at: null,
    };
    db.rows("exam_retake_grants").push({ ...grant, expires_at: new Date(T0).toISOString() });
    // an expired permission does nothing
    await expect(beginAttempt(STUDENT, a, "", T0 + 10_000, DEV)).rejects.toThrow("vi phạm");
    db.rows("exam_retake_grants").push(grant);
    const next = await beginAttempt(STUDENT, a, "", T0 + 20_000, DEV);
    expect(next).not.toBe(id);
    const used = db.rows("exam_retake_grants").find((g) => g["id"] === grant.id)!;
    expect(used["used_attempt_id"]).toBe(next);
    await finishAttempt(attempt(next), "submitted", { now: T0 + 30_000 });
    await expect(beginAttempt(STUDENT, a, "", T0 + 40_000, DEV)).rejects.toThrow();
  });
});
