// Pure date helpers for the homeroom module. Days are ISO strings (YYYY-MM-DD) handled in UTC,
// so the browser's own time zone never shifts a school day; "today" is taken in Vietnam time.

export type Iso = string;

export interface Range {
  from: Iso;
  to: Iso;
}

export type PeriodKind = "week" | "month" | "term1" | "term2" | "year";

export interface TermDates {
  yearStart: Iso | null;
  term2Start: Iso | null;
  yearEnd: Iso | null;
}

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;

const toMs = (d: Iso) => Date.parse(`${d}T00:00:00Z`);
const fromMs = (ms: number): Iso => new Date(ms).toISOString().slice(0, 10);

export function isIsoDay(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && fromMs(toMs(text)) === text;
}

/** Today's date in Vietnam (UTC+7). */
export function vnToday(now: Date = new Date()): Iso {
  return fromMs(now.getTime() + VN_OFFSET_MS);
}

export function addDays(d: Iso, n: number): Iso {
  return fromMs(toMs(d) + n * DAY_MS);
}

/** 1 = Monday … 7 = Sunday. */
export function weekday(d: Iso): number {
  const w = new Date(toMs(d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Monday–Saturday are school days. */
export function isSchoolDay(d: Iso): boolean {
  return weekday(d) <= 6;
}

export function daysBetween(range: Range): Iso[] {
  const out: Iso[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekRange(d: Iso): Range {
  const from = addDays(d, 1 - weekday(d));
  return { from, to: addDays(from, 6) };
}

export function monthRange(d: Iso): Range {
  const [y, m] = d.split("-").map(Number) as [number, number];
  const from = `${d.slice(0, 7)}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

/**
 * Vietnamese school year containing d when the teacher has not set dates:
 * 5 September – 31 May, second term from 15 January.
 */
export function defaultTerms(d: Iso): Required<{ [K in keyof TermDates]: Iso }> {
  const y = Number(d.slice(0, 4));
  const startYear = d.slice(5) >= "08-01" ? y : y - 1;
  return {
    yearStart: `${startYear}-09-05`,
    term2Start: `${startYear + 1}-01-15`,
    yearEnd: `${startYear + 1}-05-31`,
  };
}

export function resolvedTerms(t: TermDates, today: Iso) {
  const base = defaultTerms(today);
  return {
    yearStart: t.yearStart ?? base.yearStart,
    term2Start: t.term2Start ?? base.term2Start,
    yearEnd: t.yearEnd ?? base.yearEnd,
  };
}

/** The reporting range of the given kind that contains `anchor`. */
export function periodRange(kind: PeriodKind, anchor: Iso, terms: TermDates): Range {
  if (kind === "week") return weekRange(anchor);
  if (kind === "month") return monthRange(anchor);
  const t = resolvedTerms(terms, anchor);
  if (kind === "term1") return { from: t.yearStart, to: addDays(t.term2Start, -1) };
  if (kind === "term2") return { from: t.term2Start, to: t.yearEnd };
  return { from: t.yearStart, to: t.yearEnd };
}

/** The same kind of period just before the given one (for "so với kỳ trước"). */
export function previousPeriod(kind: PeriodKind, range: Range, terms: TermDates): Range | null {
  if (kind === "week") return weekRange(addDays(range.from, -7));
  if (kind === "month") return monthRange(addDays(range.from, -1));
  if (kind === "term2") return periodRange("term1", range.from, terms);
  return null;
}

/** The term a day belongs to, for the overview header. */
export function termOf(d: Iso, terms: TermDates): 1 | 2 | null {
  const t = resolvedTerms(terms, d);
  if (d < t.yearStart || d > t.yearEnd) return null;
  return d < t.term2Start ? 1 : 2;
}

export function displayDay(d: Iso): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

const WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
export function weekdayName(d: Iso): string {
  return WEEKDAYS[weekday(d) - 1] ?? "";
}

export function periodLabel(kind: PeriodKind, range: Range): string {
  const span = `${displayDay(range.from)} – ${displayDay(range.to)}`;
  if (kind === "week") return `Tuần ${span}`;
  if (kind === "month") return `Tháng ${range.from.slice(5, 7)}/${range.from.slice(0, 4)}`;
  if (kind === "term1") return `Học kỳ I (${span})`;
  if (kind === "term2") return `Học kỳ II (${span})`;
  return `Cả năm (${span})`;
}
