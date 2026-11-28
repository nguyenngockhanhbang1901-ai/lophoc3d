// Pure per-student summary for a report period (tuần / tháng / học kỳ): attendance, in-class
// records, incidents, locked weekly levels and the scores entered during the period.
import type { AbsenceRecord } from "./attendance";
import type { BehaviorKind, BookColumn } from "@/lib/gradebook/scores";
import { BEHAVIOR_POSITIVE } from "@/lib/gradebook/scores";
import type { Level } from "./evaluation";
import type { Range } from "./periods";

export interface ReportInput {
  absences: AbsenceRecord[];
  events: { studentId: string; day: string; kind: BehaviorKind; subject: string }[];
  incidents: { studentId: string; day: string; type: "khen" | "vi_pham"; content: string }[];
  weekly: { studentId: string; weekStart: string; level: Level; points: number }[];
  books: {
    subject: string;
    semester: 1 | 2;
    columns: BookColumn[];
    bonusTarget: string | null;
    bonus: { studentId: string; plus: number; minus: number }[];
    scores: {
      studentId: string;
      key: string;
      num: number | null;
      txt: string | null;
      updatedAt: string;
    }[];
  }[];
}

export interface StudentSummary {
  coPhep: number;
  khongPhep: number;
  diMuon: number;
  speak: number;
  speakBySubject: Record<string, number>;
  good: number;
  bad: number;
  kinds: Partial<Record<BehaviorKind, number>>;
  khen: string[];
  viPham: string[];
  weeks: { weekStart: string; level: Level; points: number }[];
  scores: { subject: string; label: string; value: string }[];
}

const empty = (): StudentSummary => ({
  coPhep: 0,
  khongPhep: 0,
  diMuon: 0,
  speak: 0,
  speakBySubject: {},
  good: 0,
  bad: 0,
  kinds: {},
  khen: [],
  viPham: [],
  weeks: [],
  scores: [],
});

/** Vietnam calendar day of a timestamp. */
export function vnDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function summarize(
  studentIds: string[],
  input: ReportInput,
  range: Range,
): Map<string, StudentSummary> {
  const out = new Map(studentIds.map((id) => [id, empty()]));
  const inR = (d: string) => d >= range.from && d <= range.to;
  for (const a of input.absences) {
    const s = out.get(a.studentId);
    if (!s || !inR(a.day)) continue;
    if (a.kind === "co_phep") s.coPhep++;
    else if (a.kind === "khong_phep") s.khongPhep++;
    else s.diMuon++;
  }
  for (const e of input.events) {
    const s = out.get(e.studentId);
    if (!s || !inR(e.day)) continue;
    s.kinds[e.kind] = (s.kinds[e.kind] ?? 0) + 1;
    if (BEHAVIOR_POSITIVE[e.kind]) s.good++;
    else s.bad++;
    if (e.kind === "phat_bieu") {
      s.speak++;
      const sub = e.subject || "Khác";
      s.speakBySubject[sub] = (s.speakBySubject[sub] ?? 0) + 1;
    }
  }
  for (const i of input.incidents) {
    const s = out.get(i.studentId);
    if (!s || !inR(i.day)) continue;
    (i.type === "khen" ? s.khen : s.viPham).push(i.content);
  }
  for (const w of input.weekly) {
    const s = out.get(w.studentId);
    if (s && inR(w.weekStart))
      s.weeks.push({ weekStart: w.weekStart, level: w.level, points: w.points });
  }
  for (const b of input.books) {
    const label = new Map(b.columns.map((c) => [c.key, c.label]));
    for (const sc of b.scores) {
      const s = out.get(sc.studentId);
      if (!s || !inR(vnDay(sc.updatedAt)) || !label.has(sc.key)) continue;
      const value = sc.num !== null ? String(sc.num).replace(".", ",") : (sc.txt ?? "");
      if (value && (sc.num !== null || b.columns.find((c) => c.key === sc.key)?.kind === "dg"))
        s.scores.push({ subject: b.subject, label: label.get(sc.key)!, value });
    }
  }
  for (const s of out.values()) s.weeks.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  return out;
}

export function speakText(s: StudentSummary): string {
  const parts = Object.entries(s.speakBySubject)
    .sort((a, b) => b[1] - a[1])
    .map(([sub, n]) => `${sub} ${n}`);
  return s.speak ? `${s.speak} lần${parts.length ? ` (${parts.join(", ")})` : ""}` : "0";
}
