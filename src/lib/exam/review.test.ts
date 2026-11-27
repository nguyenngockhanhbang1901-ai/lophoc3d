import { describe, expect, it } from "vitest";
import {
  answerLog,
  answerText,
  attemptTimeline,
  correctText,
  itemLabels,
  reviewAllowed,
  reviewQuestion,
} from "./review";

const t = (s: number) => new Date(Date.UTC(2026, 10, 27, 1, 0, s)).toISOString();

describe("review", () => {
  it("shows the key in the student's option order", () => {
    const q = reviewQuestion(
      { kind: "mcq", points: 0.25, optionOrder: [2, 0, 3, 1] },
      {
        stem: "x",
        media: null,
        explanation: "vì",
        data: { kind: "mcq", options: ["a", "b", "c", "d"], correct: 0 },
      },
      { kind: "mcq", choice: 1 },
      { share: 1, points: 0.25, earned: 0.25 },
    );
    expect(q.options).toEqual(["c", "a", "d", "b"]);
    expect(q.correct).toEqual({ kind: "mcq", choice: 1 });
    expect(correctText(q.correct)).toBe("B");
  });

  it("follows the review setting", () => {
    const close = t(100);
    expect(reviewAllowed("none", "submitted", close, Date.parse(t(200)))).toBe(false);
    expect(reviewAllowed("immediate", "submitted", close, Date.parse(t(0)))).toBe(true);
    expect(reviewAllowed("immediate", "cancelled_edit", close, Date.parse(t(0)))).toBe(false);
    expect(reviewAllowed("after_close", "timeout", close, Date.parse(t(50)))).toBe(false);
    expect(reviewAllowed("after_close", "timeout", close, Date.parse(t(100)))).toBe(true);
  });

  it("labels questions per part and writes answers briefly", () => {
    expect(itemLabels(["mcq", "mcq", "tf", "short"])).toEqual([
      "Câu 1 (Phần I)",
      "Câu 2 (Phần I)",
      "Câu 1 (Phần II)",
      "Câu 1 (Phần III)",
    ]);
    expect(answerText({ kind: "tf", choices: [true, false, null, true] })).toBe("aĐ bS c? dĐ");
    expect(answerText({ kind: "short", text: "2,5" })).toBe("2,5");
  });

  it("logs each change with what it replaced and builds the timeline", () => {
    const log = answerLog(
      [
        { item_index: 0, answer: { kind: "mcq", choice: 0 }, at: t(5) },
        { item_index: 0, answer: { kind: "mcq", choice: 0 }, at: t(6) },
        { item_index: 1, answer: { kind: "mcq", choice: 2 }, at: t(10) },
        { item_index: 0, answer: { kind: "mcq", choice: 3 }, at: t(30) },
      ],
      t(10),
    );
    expect(log).toHaveLength(3);
    expect(log[2]).toMatchObject({ index: 0, afterCompletion: true });
    expect(answerText(log[2]!.before)).toBe("A");
    const tl = attemptTimeline({
      startedAt: t(0),
      completedAllAt: t(10),
      finishedAt: t(40),
      status: "submitted",
      labels: ["Câu 1 (Phần I)", "Câu 2 (Phần I)"],
      log,
      violations: [{ kind: "tab_hidden", at: t(20), counted: true }],
      drops: [
        {
          started_at: t(25),
          ended_at: t(28),
          duration_ms: 20_000,
          drop_number: 1,
          outcome: "continue",
        },
      ],
    });
    expect(tl.map((e) => e.kind)).toEqual([
      "start",
      "answer",
      "answer",
      "completed",
      "violation",
      "drop",
      "edit",
      "finish",
    ]);
    expect(tl[6]!.text).toBe("Câu 1 (Phần I): A → D (sửa sau khi làm xong)");
  });
});
