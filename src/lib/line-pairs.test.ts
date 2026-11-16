import { describe, expect, it } from 'vitest';
import { PAIR_STEPS, pairSegments } from './line-pairs';
import { reconcileSteps, submitStep } from './goal-progress';
describe('Bài 11', () => {
  const release = '2026-11-15T03:00:00.000Z';
  const now = Date.parse(release);
  const empty = { answers: [], step: 0, completedAt: null, timings: [] };
  it('gives every one of six questions exactly 90 seconds', () => {
    expect(PAIR_STEPS.count).toBe(6); expect(PAIR_STEPS.limitMs).toBe(90_000);
    expect(reconcileSteps(empty, release, now + 89_999, PAIR_STEPS).step).toBe(0);
    expect(reconcileSteps(empty, release, now + 90_000, PAIR_STEPS).step).toBe(1);
  });
  it('does not start before teacher release', () => {
    expect(reconcileSteps(empty, release, now - 1, PAIR_STEPS).timings[0]?.started_at).toBeNull();
  });
  it('locks sent answers and completed work', () => {
    const started = reconcileSteps(empty, release, now, PAIR_STEPS);
    const sent = submitStep(started, 0, '0 điểm', now + 1000, PAIR_STEPS);
    expect(() => submitStep(sent, 0, 'đổi đáp án', now + 2000, PAIR_STEPS)).toThrow();
    const done = reconcileSteps(empty, release, now + 540_000, PAIR_STEPS);
    expect(done.completedAt).toBe(new Date(now + 540_000).toISOString());
    expect(() => submitStep(done, 5, 'đổi', now + 540_001, PAIR_STEPS)).toThrow();
  });
  it('keeps coplanar cases in P and skew lines noncoplanar', () => {
    for (const kind of ['parallel', 'intersecting', 'coincident'] as const) expect(pairSegments(kind).flat().every(p => p[1] === 0)).toBe(true);
    const [d, other] = pairSegments('skew'); expect(d?.[0][1]).toBe(0); expect(other?.[0][1]).toBe(1.25);
  });
});