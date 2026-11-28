// Pure attendance rules: tallies per student and period, consecutive absences and alerts.
// Only absences and late arrivals are stored; a student with no record on a taken day was present.
import { monthRange, type Iso, type Range } from "./periods";

export type Session = "ca_ngay" | "sang" | "chieu";
export type AbsenceKind = "co_phep" | "khong_phep" | "di_muon";

export const KIND_LABEL: Record<AbsenceKind, string> = {
  co_phep: "Nghỉ có phép",
  khong_phep: "Nghỉ không phép",
  di_muon: "Đi muộn",
};
export const KIND_SHORT: Record<AbsenceKind, string> = {
  co_phep: "P",
  khong_phep: "K",
  di_muon: "M",
};
export const SESSION_LABEL: Record<Session, string> = {
  ca_ngay: "Cả ngày",
  sang: "Buổi sáng",
  chieu: "Buổi chiều",
};

export interface AbsenceRecord {
  studentId: string;
  day: Iso;
  session: Session;
  kind: AbsenceKind;
  reason: string;
}

export interface TakenSession {
  day: Iso;
  session: Session;
}

export interface Tally {
  coPhep: number;
  khongPhep: number;
  diMuon: number;
  /** co_phep + khong_phep */
  absent: number;
}

export const emptyTally = (): Tally => ({ coPhep: 0, khongPhep: 0, diMuon: 0, absent: 0 });

const inRange = (d: Iso, r: Range) => d >= r.from && d <= r.to;
const sessionOrder: Record<Session, number> = { sang: 0, ca_ngay: 1, chieu: 2 };
const key = (s: TakenSession) => `${s.day}|${sessionOrder[s.session]}`;

/** Counts per student within the range (every student id gets an entry). */
export function tallies(
  studentIds: string[],
  records: AbsenceRecord[],
  range: Range,
): Map<string, Tally> {
  const out = new Map(studentIds.map((id) => [id, emptyTally()]));
  for (const r of records) {
    if (!inRange(r.day, range)) continue;
    const t = out.get(r.studentId);
    if (!t) continue;
    if (r.kind === "co_phep") t.coPhep++;
    else if (r.kind === "khong_phep") t.khongPhep++;
    else t.diMuon++;
    t.absent = t.coPhep + t.khongPhep;
  }
  return out;
}

export function classTotal(t: Iterable<Tally>): Tally {
  const sum = emptyTally();
  for (const x of t) {
    sum.coPhep += x.coPhep;
    sum.khongPhep += x.khongPhep;
    sum.diMuon += x.diMuon;
    sum.absent += x.absent;
  }
  return sum;
}

/**
 * Absent sessions in a row, counted back from the most recent taken session up to `upTo`.
 * Late arrivals end a run (the student came). Sessions not taken are skipped.
 */
export function currentAbsenceRun(
  studentId: string,
  records: AbsenceRecord[],
  taken: TakenSession[],
  upTo: Iso,
): { count: number; since: Iso | null } {
  const absent = new Set(
    records.filter((r) => r.studentId === studentId && r.kind !== "di_muon").map((r) => key(r)),
  );
  const ordered = taken
    .filter((s) => s.day <= upTo)
    .slice()
    .sort((a, b) => (key(a) < key(b) ? 1 : -1));
  let count = 0;
  let since: Iso | null = null;
  for (const s of ordered) {
    if (!absent.has(key(s))) break;
    count++;
    since = s.day;
  }
  return { count, since };
}

export type Alert =
  | { kind: "consecutive"; studentId: string; count: number; since: Iso }
  | { kind: "unexcused_month"; studentId: string; count: number };

export interface AlertSettings {
  alertConsecutive: number;
  alertUnexcusedMonth: number;
}

/** Students to watch today: long absence runs and too many unexcused absences this month. */
export function attendanceAlerts(
  studentIds: string[],
  records: AbsenceRecord[],
  taken: TakenSession[],
  settings: AlertSettings,
  today: Iso,
): Alert[] {
  const out: Alert[] = [];
  const month = tallies(studentIds, records, monthRange(today));
  for (const id of studentIds) {
    const run = currentAbsenceRun(id, records, taken, today);
    if (run.count >= settings.alertConsecutive && run.since)
      out.push({ kind: "consecutive", studentId: id, count: run.count, since: run.since });
    const k = month.get(id)?.khongPhep ?? 0;
    if (k >= settings.alertUnexcusedMonth)
      out.push({ kind: "unexcused_month", studentId: id, count: k });
  }
  return out;
}

/** Sessions a class must take on a day. */
export function sessionsFor(twoSessions: boolean): Session[] {
  return twoSessions ? ["sang", "chieu"] : ["ca_ngay"];
}

/** True when every required session of the day has been taken. */
export function dayTaken(day: Iso, taken: TakenSession[], twoSessions: boolean): boolean {
  return sessionsFor(twoSessions).every((s) => taken.some((t) => t.day === day && t.session === s));
}

/** Count of distinct taken sessions inside the range (the denominator for attendance rates). */
export function takenCount(taken: TakenSession[], range: Range): number {
  return new Set(taken.filter((t) => inRange(t.day, range)).map(key)).size;
}
