import { endTime, remainingMs, type Timing } from './timer';
import { GOAL_QUESTIONS } from './goal-questions';

export type StepProgress = { answers: string[]; step: number; completedAt: string | null; timings: Timing[] };
export type GoalProgress = StepProgress;
/** A timed, server-reconciled question sequence: `count` questions, each with `limitMs` to answer. */
export type StepConfig = { count: number; limitMs: number; accepts: (step: number, answer: string) => boolean };

export function reconcileSteps(progress: StepProgress, releasedAt: string, now: number, config: StepConfig): StepProgress {
  const next: StepProgress = { ...progress, answers: [...progress.answers], timings: Array.from({ length: config.count }, (_, i) => ({ started_at: progress.timings[i]?.started_at ?? null, ended_at: progress.timings[i]?.ended_at ?? null })) };
  if (next.completedAt || Date.parse(releasedAt) > now) return next;
  let start = next.timings[next.step]?.started_at ?? (next.step === 0 ? releasedAt : new Date(now).toISOString());
  while (!next.completedAt) {
    const timing = next.timings[next.step];
    if (!timing) break;
    timing.started_at = start;
    if (remainingMs(start, now, config.limitMs) > 0) break;
    timing.ended_at = endTime(start, now, config.limitMs);
    if (next.step === config.count - 1) next.completedAt = timing.ended_at;
    else { next.step++; start = timing.ended_at; }
  }
  return next;
}

export function submitStep(progress: StepProgress, step: number, answer: string, now: number, config: StepConfig): StepProgress {
  if (progress.completedAt) throw new Error('Bài đã nộp · Không thể sửa');
  const timing = progress.timings[step];
  if (step !== progress.step || !timing?.started_at || timing.ended_at || remainingMs(timing.started_at, now, config.limitMs) === 0) throw new Error('Câu hỏi đã kết thúc');
  if (step >= config.count || !answer.trim() || !config.accepts(step, answer.trim())) throw new Error('Câu trả lời chưa hợp lệ');
  const next = { ...progress, answers: [...progress.answers], timings: progress.timings.map(t => ({ ...t })) };
  next.answers[step] = answer.trim();
  const current = next.timings[step];
  if (!current) return next;
  current.ended_at = endTime(current.started_at ?? '', now, config.limitMs);
  if (step === config.count - 1) next.completedAt = current.ended_at;
  else { next.step++; const following = next.timings[next.step]; if (following) following.started_at = new Date(now).toISOString(); }
  return next;
}

export const GOAL_STEPS: StepConfig = {
  count: GOAL_QUESTIONS.length,
  limitMs: 30_000,
  accepts: (step, answer) => { const options = GOAL_QUESTIONS[step]?.options; return !options || options.some(option => option === answer); },
};
export function reconcileGoal(progress: GoalProgress, releasedAt: string, now: number) { return reconcileSteps(progress, releasedAt, now, GOAL_STEPS); }
export function submitGoalStep(progress: GoalProgress, step: number, answer: string, now: number) { return submitStep(progress, step, answer, now, GOAL_STEPS); }

/** Teacher's shared screen during a timed part: the question every team has reached. A question is done for a team once it answered or its time ran out. */
export function sharedQuestion(teams: readonly StepProgress[], releasedAt: string, now: number, config: StepConfig): number {
  if (teams.length === 0 || Date.parse(releasedAt) > now) return 0;
  const reached = teams.map(team => { const r = reconcileSteps(team, releasedAt, now, config); return r.completedAt ? config.count : r.step; });
  return Math.max(0, Math.min(config.count - 1, ...reached));
}
