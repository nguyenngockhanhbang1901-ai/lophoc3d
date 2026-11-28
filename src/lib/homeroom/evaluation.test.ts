import { describe, expect, it } from "vitest";
import { studyLevel, subjectResult, yearResult, type SubjectResult } from "./evaluation";
import { DEFAULT_WEEKLY_RULE, weekScore } from "./weekly";
import { defaultColumns, type BookColumn } from "@/lib/gradebook/scores";

const s = (value: number): SubjectResult => ({ kind: "score", value, complete: true });
const c = (pass: boolean): SubjectResult => ({ kind: "comment", pass });
const subjects = (scores: number[], comments: boolean[] = []) => [
  ...scores.map((v, i) => ({ subject: `M${i + 1}`, result: s(v) })),
  ...comments.map((p, i) => ({ subject: `NX${i + 1}`, result: c(p) })),
];

describe("studyLevel (Điều 9)", () => {
  it("Tốt: all ≥ 6.5 and six ≥ 8.0, comment subjects Đạt", () => {
    expect(studyLevel(subjects([8, 8, 8, 8, 8, 8, 6.5, 7], [true])).level).toBe("tot");
    expect(studyLevel(subjects([8, 8, 8, 8, 8, 7.9, 6.5, 7], [true])).level).toBe("kha");
  });
  it("Khá: all ≥ 5.0 and six ≥ 6.5", () => {
    expect(studyLevel(subjects([6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 5, 5])).level).toBe("kha");
  });
  it("Đạt: six ≥ 5.0, none < 3.5, at most one comment subject Chưa đạt", () => {
    expect(studyLevel(subjects([5, 5, 5, 5, 5, 5, 3.5, 4], [false])).level).toBe("dat");
    expect(studyLevel(subjects([5, 5, 5, 5, 5, 5, 3.4, 4])).level).toBe("chua_dat");
    expect(studyLevel(subjects([5, 5, 5, 5, 5, 5], [false, false])).level).toBe("chua_dat");
  });
  it("khoản 3: one subject alone pulling the level down two steps raises it one step", () => {
    // without M8 this would be Tốt; 3.0 alone makes it Chưa đạt → raised to Đạt
    const r = studyLevel(subjects([9, 9, 9, 9, 9, 9, 9, 3]));
    expect(r).toMatchObject({ level: "dat", raisedBecause: "M8" });
  });
  it("waits for every subject", () => {
    const r = studyLevel([
      { subject: "Toán", result: s(8) },
      { subject: "Văn", result: undefined },
    ]);
    expect(r).toEqual({ level: null, missing: ["Văn"] });
  });
});

describe("subject results", () => {
  it("averages score subjects with the bonus and reads Đ/CĐ subjects", () => {
    const r = subjectResult({
      columns: defaultColumns(2),
      bonusTarget: "tx1",
      raw: { tx1: 7, tx2: 8, gk: 6, ck: 7 },
      texts: {},
      bonus: { plus: 1, minus: 0 },
    });
    // (8 + 8 + 12 + 21) / 7 = 7.0
    expect(r).toEqual({ kind: "score", value: 7, complete: true });
    const dg: BookColumn[] = [
      { key: "dg1", kind: "dg", label: "1" },
      { key: "dg2", kind: "dg", label: "2" },
    ];
    const base = { columns: dg, bonusTarget: null, raw: {}, bonus: undefined };
    expect(subjectResult({ ...base, texts: { dg1: "Đ", dg2: "Đ" } })).toEqual({
      kind: "comment",
      pass: true,
    });
    expect(subjectResult({ ...base, texts: { dg1: "Đ", dg2: "CĐ" } })).toEqual({
      kind: "comment",
      pass: false,
    });
    expect(subjectResult({ ...base, texts: { dg1: "Đ" } })).toEqual({
      kind: "comment",
      pass: null,
    });
    expect(yearResult(s(6.5), s(7.1))).toMatchObject({ value: 6.9 });
    expect(yearResult(c(false), c(true))).toEqual(c(true));
  });
});

describe("weekScore", () => {
  it("starts at 100, caps speaking points and maps to a level", () => {
    const w = weekScore(
      [
        "phat_bieu",
        "phat_bieu",
        "phat_bieu",
        "phat_bieu",
        "phat_bieu",
        "phat_bieu",
        "khong_lam_bai",
      ],
      [{ kind: "khong_phep" }, { kind: "di_muon" }],
      [{ type: "vi_pham", points: -5, content: "Không đeo thẻ" }],
      DEFAULT_WEEKLY_RULE,
    );
    // +10 (capped) −3 −10 −2 −5 = −10
    expect(w.points).toBe(90);
    expect(w.level).toBe("kha");
    expect(w.lines.find((l) => l.label === "Phát biểu")).toEqual({
      label: "Phát biểu",
      count: 6,
      points: 10,
    });
    expect(weekScore([], [], [], DEFAULT_WEEKLY_RULE).level).toBe("tot");
  });
});

describe("yearConduct (Điều 8)", () => {
  it("combines the two terms", async () => {
    const { yearConduct } = await import("./evaluation");
    expect(yearConduct("kha", "tot")).toBe("tot");
    expect(yearConduct("dat", "tot")).toBe("kha");
    expect(yearConduct("chua_dat", "kha")).toBe("dat");
    expect(yearConduct("tot", "dat")).toBe("kha");
    expect(yearConduct("kha", "dat")).toBe("dat");
    expect(yearConduct("tot", "chua_dat")).toBe("chua_dat");
    expect(yearConduct(null, "tot")).toBe(null);
  });
});

describe("report summary", () => {
  it("counts a student's period and lists scores entered in it", async () => {
    const { summarize, speakText } = await import("./report");
    const range = { from: "2026-11-23", to: "2026-11-29" };
    const m = summarize(
      ["a"],
      {
        absences: [
          { studentId: "a", day: "2026-11-24", session: "ca_ngay", kind: "co_phep", reason: "" },
          { studentId: "a", day: "2026-11-10", session: "ca_ngay", kind: "khong_phep", reason: "" },
        ],
        events: [
          { studentId: "a", day: "2026-11-24", kind: "phat_bieu", subject: "Toán" },
          { studentId: "a", day: "2026-11-25", kind: "phat_bieu", subject: "Toán" },
          { studentId: "a", day: "2026-11-25", kind: "phat_bieu", subject: "Ngữ văn" },
          { studentId: "a", day: "2026-11-26", kind: "khong_lam_bai", subject: "Vật lí" },
        ],
        incidents: [
          { studentId: "a", day: "2026-11-27", type: "vi_pham", content: "Không đeo thẻ" },
        ],
        weekly: [{ studentId: "a", weekStart: "2026-11-23", level: "kha", points: 92 }],
        books: [
          {
            subject: "Toán",
            semester: 1,
            bonusTarget: null,
            bonus: [],
            columns: defaultColumns(2),
            scores: [
              { studentId: "a", key: "tx1", num: 8, txt: null, updatedAt: "2026-11-24T03:00:00Z" },
              { studentId: "a", key: "tx2", num: 7, txt: null, updatedAt: "2026-11-01T03:00:00Z" },
              {
                studentId: "a",
                key: "nx",
                num: null,
                txt: "Tốt",
                updatedAt: "2026-11-24T03:00:00Z",
              },
            ],
          },
        ],
      },
      range,
    );
    const s = m.get("a")!;
    expect([s.coPhep, s.khongPhep, s.good, s.bad]).toEqual([1, 0, 3, 1]);
    expect(speakText(s)).toBe("3 lần (Toán 2, Ngữ văn 1)");
    expect(s.viPham).toEqual(["Không đeo thẻ"]);
    expect(s.weeks).toEqual([{ weekStart: "2026-11-23", level: "kha", points: 92 }]);
    expect(s.scores).toEqual([{ subject: "Toán", label: "TX1", value: "8" }]);
  });
});

describe("learning alerts and AI helpers", () => {
  it("flags averages under 5 and term II drops of 1.5 or more", async () => {
    const { learningAlerts } = await import("./evaluation");
    const b = (semester: 1 | 2, v: number) => ({
      subject: "Toán",
      semester,
      columns: defaultColumns(1),
      bonusTarget: null,
      scores: ["tx1", "gk", "ck"].map((key) => ({ studentId: "a", key, num: v, txt: null })),
      bonus: [],
    });
    expect(learningAlerts([b(1, 8), b(2, 6.5)], ["a"], 2)).toEqual([
      { kind: "drop", studentId: "a", subject: "Toán", from: 8, to: 6.5 },
    ]);
    expect(learningAlerts([b(1, 3)], ["a"], 1)).toEqual([
      { kind: "very_low", studentId: "a", subject: "Toán", value: 3 },
    ]);
    expect(learningAlerts([b(1, 4.5)], ["a"], 1)).toEqual([
      { kind: "low", studentId: "a", subject: "Toán", value: 4.5 },
    ]);
  });

  it("keeps names out of prompts and restores them in the browser", async () => {
    const { codesFor, restoreNames, classPrompt, cleanAi } = await import("./ai");
    const codes = codesFor(["x", "y"]);
    const prompt = classPrompt({
      className: "11A1",
      period: "Tháng 11/2026",
      size: 2,
      sessions: 20,
      rows: [
        {
          code: codes.get("x")!,
          coPhep: 1,
          khongPhep: 2,
          diMuon: 0,
          speak: 0,
          good: 0,
          bad: 1,
          khen: 0,
          viPham: 1,
          lowSubjects: ["Toán"],
        },
        {
          code: codes.get("y")!,
          coPhep: 0,
          khongPhep: 0,
          diMuon: 0,
          speak: 0,
          good: 0,
          bad: 0,
          khen: 0,
          viPham: 0,
          lowSubjects: [],
        },
      ],
      previous: null,
      extra: [],
    });
    expect(prompt).toContain("HS01; 1/2; 0; 0; 0; 1; 0; 1; Toán");
    expect(prompt).not.toContain("HS02;");
    expect(
      restoreNames(
        "HS01 cần quan tâm, HS02 tốt.",
        codes,
        new Map([
          ["x", "An"],
          ["y", "Bình"],
        ]),
      ),
    ).toBe("An cần quan tâm, Bình tốt.");
    expect(cleanAi("**Tiến bộ:**\n* Tốt\n\n\n# Hết")).toBe("Tiến bộ:\n- Tốt\n\nHết");
  });

  it("relays Gemini errors as teacher messages", async () => {
    const { requestHomeroomAi } = await import("./ai");
    const ok = await requestHomeroomAi(
      "k",
      "comment",
      "p",
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Em **chăm ngoan**." }] } }],
          }),
        ),
    );
    expect(ok).toEqual({ text: "Em chăm ngoan.", error: "" });
    const bad = await requestHomeroomAi(
      "k",
      "comment",
      "p",
      async () =>
        new Response(
          JSON.stringify({
            error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] },
          }),
          { status: 400 },
        ),
    );
    expect(bad.error).toContain("API_KEY_INVALID");
  });
});
