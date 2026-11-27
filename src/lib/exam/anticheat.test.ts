import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./assignment";
import {
  editLimit,
  editVerdict,
  editedCount,
  isMobileUserAgent,
  networkDecision,
  retakeState,
} from "./anticheat";

const net = DEFAULT_SETTINGS.network;
const min = 60_000;

describe("networkDecision", () => {
  it("lets a short drop continue within the free drops", () => {
    expect(networkDecision(2 * min, 1, net)).toBe("continue");
    expect(networkDecision(20_000, 3, net)).toBe("continue");
  });
  it("gives a new uncounted exam for 3–5 minutes or the 4th–5th drop", () => {
    expect(networkDecision(3 * min, 1, net)).toBe("new_exam");
    expect(networkDecision(4.5 * min, 2, net)).toBe("new_exam");
    expect(networkDecision(30_000, 4, net)).toBe("new_exam");
    expect(networkDecision(30_000, 5, net)).toBe("new_exam");
  });
  it("counts the attempt past 5 minutes or past 5 drops", () => {
    expect(networkDecision(5 * min + 1, 1, net)).toBe("new_exam_counted");
    expect(networkDecision(30_000, 6, net)).toBe("new_exam_counted");
  });
});

describe("edit rule", () => {
  const rule = DEFAULT_SETTINGS.editRule;
  const mcq = (c: number) => ({ kind: "mcq" as const, choice: c });
  it("counts changed answers, short answers by value", () => {
    expect(
      editedCount(
        [mcq(1), mcq(2), { kind: "short", text: "1,5" }],
        [mcq(1), mcq(3), { kind: "short", text: "1.5" }],
      ),
    ).toBe(1);
  });
  it("uses the lower limit for a paper finished fast", () => {
    expect(editLimit({ firstPassMs: 5 * min, durationMs: 45 * min }, rule)).toBe(0.5);
    expect(editLimit({ firstPassMs: 20 * min, durationMs: 45 * min }, rule)).toBe(0.6);
  });
  it("warns once before cancelling", () => {
    const base = { total: 10, firstPassMs: 2 * min, durationMs: 45 * min };
    expect(editVerdict({ ...base, edited: 4, warned: false }, rule)).toBe("ok");
    expect(editVerdict({ ...base, edited: 5, warned: false }, rule)).toBe("warn");
    expect(editVerdict({ ...base, edited: 5, warned: true }, rule)).toBe("ok");
    expect(editVerdict({ ...base, edited: 6, warned: true }, rule)).toBe("cancel");
  });
  it("warns instead of cancelling when the limit is crossed in one step", () => {
    const s = { total: 1, edited: 1, firstPassMs: 0, durationMs: 1, warned: false };
    expect(editVerdict(s, rule)).toBe("warn");
    expect(editVerdict({ ...s, warned: true }, rule)).toBe("cancel");
  });
  it("allows more changes on a slow paper", () => {
    const base = { total: 10, firstPassMs: 30 * min, durationMs: 45 * min, warned: true };
    expect(editVerdict({ ...base, edited: 6 }, rule)).toBe("ok");
    expect(editVerdict({ ...base, edited: 7 }, rule)).toBe("cancel");
  });
  it("does nothing when switched off", () => {
    const s = { total: 2, edited: 2, firstPassMs: 0, durationMs: 1, warned: true };
    expect(editVerdict(s, { ...rule, enabled: false })).toBe("ok");
  });
});

describe("retakeState", () => {
  const a = (
    attempt_no: number,
    status: Parameters<typeof retakeState>[0][number]["status"],
    counts = true,
  ) => ({ attempt_no, status, counts_toward_attempts: counts });
  it("allows the first attempt and stops at the limit", () => {
    expect(retakeState([], 1, 2, "open")).toEqual({ kind: "allowed", auto: false });
    expect(retakeState([a(1, "submitted")], 1, 2, "open").kind).toBe("wait_teacher");
    expect(retakeState([a(1, "submitted")], 2, 2, "open").kind).toBe("allowed");
  });
  it("gives automatic new exams after cancellations, up to the limit", () => {
    expect(retakeState([a(1, "cancelled_edit")], 1, 2, "open")).toEqual({
      kind: "allowed",
      auto: true,
    });
    expect(
      retakeState([a(1, "cancelled_network", false), a(2, "cancelled_edit")], 1, 2, "open").kind,
    ).toBe("allowed");
    expect(
      retakeState(
        [a(1, "cancelled_network", false), a(2, "cancelled_edit"), a(3, "cancelled_edit")],
        1,
        2,
        "open",
      ).kind,
    ).toBe("wait_teacher");
  });
  it("needs the teacher after closing time or a violation", () => {
    expect(retakeState([a(1, "cancelled_edit")], 1, 2, "closed").kind).toBe("wait_teacher");
    expect(retakeState([a(1, "violation")], 3, 2, "open").kind).toBe("wait_teacher");
    expect(retakeState([], 1, 2, "closed").kind).toBe("closed");
  });
});

it("recognises phones and tablets", () => {
  expect(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
  expect(isMobileUserAgent("Mozilla/5.0 (Linux; Android 14; SM-A145F)")).toBe(true);
  expect(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe(false);
});
