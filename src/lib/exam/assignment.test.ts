import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  answerComplete,
  chosenScore,
  kindNumbering,
  readSettings,
  scoreAttempt,
  studentQuestion,
  windowState,
} from "./assignment";
import type { QuestionBody } from "./questions";

const mcq: QuestionBody = {
  stem: "s",
  media: null,
  explanation: "lời giải",
  data: { kind: "mcq", options: ["a", "b", "c", "d"], correct: 2 },
};
const tf: QuestionBody = {
  stem: "t",
  media: null,
  explanation: "",
  data: { kind: "tf", statements: ["1", "2", "3", "4"], correct: [true, false, true, false] },
};
const short: QuestionBody = {
  stem: "x",
  media: null,
  explanation: "",
  data: { kind: "short", mode: "number", answers: ["3,5"], tolerance: null },
};

describe("assignment rules", () => {
  it("fills defaults the plan agreed on", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      maxWarnings: 3,
      review: "none",
      scale: 10,
      scoreRule: "latest",
      autoRetakes: 2,
    });
    expect(DEFAULT_SETTINGS.network).toEqual({
      shortMinutes: 3,
      longMinutes: 5,
      freeDrops: 3,
      uncountedDrops: 5,
    });
    expect(DEFAULT_SETTINGS.editRule).toEqual({
      enabled: true,
      fastShare: 0.2,
      fastLimit: 0.5,
      slowLimit: 0.6,
    });
    expect(readSettings({ maxWarnings: 5, junk: 1 }).maxWarnings).toBe(5);
    expect(readSettings({ maxWarnings: -1 })).toEqual(DEFAULT_SETTINGS);
  });

  it("opens and closes on the clock", () => {
    const o = "2026-11-27T08:00:00+07:00";
    const c = "2026-11-27T09:00:00+07:00";
    expect(windowState(o, c, new Date("2026-11-27T07:59:59+07:00").getTime())).toBe("scheduled");
    expect(windowState(o, c, new Date(o).getTime())).toBe("open");
    expect(windowState(o, c, new Date(c).getTime())).toBe("closed");
  });

  it("never sends answers or solutions to the student, options in the drawn order", () => {
    const q = studentQuestion(mcq, { optionOrder: [2, 0, 3, 1] });
    expect(q).toEqual({ kind: "mcq", stem: "s", media: null, options: ["c", "a", "d", "b"] });
    expect(JSON.stringify(studentQuestion(tf, { optionOrder: null }))).not.toMatch(
      /correct|true|false/,
    );
    expect(studentQuestion(short, { optionOrder: null })).toEqual({
      kind: "short",
      stem: "x",
      media: null,
    });
  });

  it("knows when a question is done", () => {
    expect(answerComplete({ kind: "mcq", choice: null })).toBe(false);
    expect(answerComplete({ kind: "mcq", choice: 0 })).toBe(true);
    expect(answerComplete({ kind: "tf", choices: [true, null, false, true] })).toBe(false);
    expect(answerComplete({ kind: "tf", choices: [true, false, false, true] })).toBe(true);
    expect(answerComplete({ kind: "short", text: "  " })).toBe(false);
  });

  it("scores with the student's option order undone and scales to 10", () => {
    const items = [
      { points: 0.25, optionOrder: [2, 0, 3, 1] },
      { points: 1, optionOrder: null },
      { points: 0.5, optionOrder: null },
      { points: 0.25, optionOrder: [0, 1, 2, 3] },
    ];
    const s = scoreAttempt(
      items,
      [mcq, tf, short, mcq],
      [
        { kind: "mcq", choice: 0 },
        { kind: "tf", choices: [true, false, true, true] },
        { kind: "short", text: "3.50" },
        null,
      ],
      10,
    );
    // 0.25 + 0.5·1 + 0.5 + 0 = 1.25 of 2 points → 6.25 / 10
    expect(s.results.map((r) => r.share)).toEqual([1, 0.5, 1, 0]);
    expect(s.score).toBe(6.25);
    expect(s.correctCount).toBe(2);
  });

  it("picks the score that counts", () => {
    const a = [
      { score: 6, attempt_no: 1, counts: true },
      { score: 8, attempt_no: 2, counts: true },
      { score: 7, attempt_no: 3, counts: true },
      { score: 9, attempt_no: 4, counts: false },
    ];
    expect(chosenScore(a, "latest")?.score).toBe(7);
    expect(chosenScore(a, "highest")?.score).toBe(8);
    expect(chosenScore(a, "first")?.score).toBe(6);
    expect(kindNumbering(["mcq", "mcq", "tf", "short", "short"])).toEqual([1, 2, 1, 1, 2]);
  });
});
