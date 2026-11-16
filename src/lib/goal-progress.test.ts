import { describe, expect, it } from 'vitest';
import { GOAL_STEPS, reconcileGoal, sharedQuestion, submitGoalStep, type GoalProgress } from './goal-progress';
import { GOAL_QUESTIONS } from './goal-questions';
const released = '2026-11-13T14:00:00.000Z';
const now = Date.parse(released);
const empty = (): GoalProgress => ({ answers: Array(6).fill(''), step: 0, completedAt: null, timings: [] });
describe('Activity 1 deadlines', () => {
  it('gives each question 30 seconds and advances at the deadline', () => {
    expect(reconcileGoal(empty(), released, now + 29999).step).toBe(0);
    const result = reconcileGoal(empty(), released, now + 30000);
    expect(result.step).toBe(1);
    expect(result.timings[1]?.started_at).toBe(new Date(now + 30000).toISOString());
  });
  it('reconnect never grants extra time and the last deadline submits', () => {
    const result = reconcileGoal(empty(), released, now + 180000);
    expect(result.step).toBe(5);
    expect(result.completedAt).toBe(new Date(now + 180000).toISOString());
  });
  it('submitted answers cannot be changed', () => {
    const result = reconcileGoal(empty(), released, now + 180000);
    expect(() => submitGoalStep(result, 5, 'Vô số', now + 180001)).toThrow('Không thể sửa');
  });
  it('early NEXT starts the next 30-second clock and locks the previous question', () => {
    const result = submitGoalStep(reconcileGoal(empty(), released, now), 0, 'Nằm ngoài', now + 1000);
    expect(result.timings[1]?.started_at).toBe(new Date(now + 1000).toISOString());
    expect(() => submitGoalStep(result, 0, 'Nằm trong', now + 2000)).toThrow();
  });
});
describe('teacher screen follows the slowest team', () => {
  const answered = (n: number, at = now + 1000): GoalProgress => {
    let p = reconcileGoal(empty(), released, at);
    for (let i = 0; i < n; i++) p = submitGoalStep(p, i, GOAL_QUESTIONS[i]?.options?.[0] ?? 'Song song', at + i);
    return p;
  };
  it('shows question 1 as soon as the work is handed out', () => {
    expect(sharedQuestion([empty(), empty(), empty(), empty()], released, now, GOAL_STEPS)).toBe(0);
    expect(sharedQuestion([], released, now, GOAL_STEPS)).toBe(0);
  });
  it('stays on question 1 while one of 4 teams is still working on it', () => {
    expect(sharedQuestion([answered(1), answered(1), answered(2), empty()], released, now + 5000, GOAL_STEPS)).toBe(0);
  });
  it('moves to question 2 once all 4 teams finished question 1', () => {
    expect(sharedQuestion([answered(1), answered(1), answered(2), answered(1)], released, now + 5000, GOAL_STEPS)).toBe(1);
  });
  it('a team whose time ran out counts as finished', () => {
    expect(sharedQuestion([answered(1), empty()], released, now + 30000, GOAL_STEPS)).toBe(1);
  });
  it('stays on the last question when every team has submitted', () => {
    expect(sharedQuestion([answered(6), answered(6)], released, now + 5000, GOAL_STEPS)).toBe(5);
  });
});
