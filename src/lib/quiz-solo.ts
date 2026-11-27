import { reconcileSteps, type StepProgress } from './goal-progress';
import type { Timing } from './timer';
import { QUIZ_QUESTIONS, QUIZ_STEPS, quizCorrectCount } from './quiz-race';

/**
 * Bài 12.1: Luyện tập 3 · "AI NHANH HƠN" of Bài 12, played by each student on their own.
 * Students join with the class code and their name (like Bài 11.1), reusing the per-class
 * lesson111_students slots; their timed progress is stored as one JSON object in `answers`.
 */
export const QUIZ_SOLO_LESSON_KEY = '12.1';
export const QUIZ_SOLO_LESSON_TITLE = 'Bài 12.1: Đường thẳng và mặt phẳng song song';
export const QUIZ_SOLO_COUNT = QUIZ_QUESTIONS.length;

/** Stored shape inside lesson111_students.answers; `rev` guards against two writes racing. */
export type SoloStored = StepProgress & { rev: number };

function timingList(value: unknown): Timing[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: QUIZ_STEPS.count }, (_, i) => {
    const t = list[i] as Partial<Timing> | undefined;
    return { started_at: typeof t?.started_at === 'string' ? t.started_at : null, ended_at: typeof t?.ended_at === 'string' ? t.ended_at : null };
  });
}
/** A new slot holds `[]`; anything that is not our object reads as a fresh start. */
export function readSoloProgress(value: unknown): SoloStored {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value as { answers?: unknown; step?: unknown; completedAt?: unknown; timings?: unknown; rev?: unknown } : {};
  const answers = Array.isArray(v.answers) ? v.answers.map(a => typeof a === 'string' ? a : '') : [];
  const step = typeof v.step === 'number' && Number.isInteger(v.step) ? Math.min(Math.max(v.step, 0), QUIZ_STEPS.count - 1) : 0;
  return { answers, step, completedAt: typeof v.completedAt === 'string' ? v.completedAt : null, timings: timingList(v.timings), rev: typeof v.rev === 'number' ? v.rev : 0 };
}

export type SoloRow = { slot: number; name: string; progress: StepProgress };
export type SoloStanding = { slot: number; name: string; done: number; correct: number; finished: boolean; timeMs: number | null; answers: string[] };

/** Answering time: from the start of Câu 1 to the end of the last finished question (timed-out questions count their full 30 s). */
export function soloTimeMs(progress: StepProgress): number | null {
  const start = progress.timings[0]?.started_at;
  const ends = progress.timings.map(t => t.ended_at ? Date.parse(t.ended_at) : NaN).filter(Number.isFinite);
  if (!start || !ends.length) return null;
  return Math.max(0, Math.max(...ends) - Date.parse(start));
}

/**
 * Ranking by fastest time: students who finished come first, the shortest answering time on top;
 * then those still playing (further along first), then those who have not started, in join order.
 */
export function compareSolo(a: SoloStanding, b: SoloStanding): number {
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  if (a.finished) return (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || b.correct - a.correct || a.slot - b.slot;
  return b.done - a.done || (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || a.slot - b.slot;
}

export function soloStandings(rows: readonly SoloRow[], releasedAt: string | null, now: number): SoloStanding[] {
  return rows.map(({ slot, name, progress }) => {
    const r = releasedAt ? reconcileSteps(progress, releasedAt, now, QUIZ_STEPS) : progress;
    const finished = Boolean(r.completedAt);
    const done = finished ? QUIZ_STEPS.count : Math.min(r.step, QUIZ_STEPS.count);
    return { slot, name, done, correct: quizCorrectCount(r.answers), finished, timeMs: done ? soloTimeMs(r) : null, answers: r.answers };
  }).sort(compareSolo);
}

/** 1:05,3 style answering time. */
export function soloTimeLabel(ms: number | null): string {
  if (ms === null) return '—';
  const tenths = Math.round(ms / 100);
  const m = Math.floor(tenths / 600), s = (tenths % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0').replace('.', ',')}`;
}
