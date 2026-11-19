import { describe, expect, it } from 'vitest';
import { animatedLine, CONTAINED_SWING, lineSegment, nameAnchors, PLANE_HALF, PARALLEL_HEIGHT } from './geometry';

describe('Hoạt động 2 line names', () => {
  it('model 1: name d stays the same distance straight above the end of d', () => {
    for (let t = 0; t < 120; t += 0.1) {
      const { origin, direction } = animatedLine(1, t);
      const [, b] = lineSegment(1, origin, direction);
      const { d } = nameAnchors(1, origin, direction);
      expect([d[0], d[2]]).toEqual([b[0], b[2]]);
      expect(d[1] - PARALLEL_HEIGHT).toBeCloseTo(0.5);
    }
  });
  it('model 2: name M keeps one fixed offset from M, farther than before', () => {
    const { origin, direction } = animatedLine(0, 3);
    const { M } = nameAnchors(0, origin, direction);
    const off = [M![0] - origin[0], M![1] - origin[1], M![2] - origin[2]];
    expect(Math.hypot(...off)).toBeGreaterThan(Math.hypot(0.35, 0.12) * 1.1);
  });
  it('model 3: d swings at most ±CONTAINED_SWING, so its name stays past B and inside the plane', () => {
    for (let t = 0; t < 120; t += 0.1) {
      const { origin, direction } = animatedLine(2, t);
      expect(Math.abs(Math.atan2(direction[2], direction[0]))).toBeLessThanOrEqual(CONTAINED_SWING + 1e-9);
      const { d, B, A } = nameAnchors(2, origin, direction);
      const along = (p: readonly number[]) => (p[0]! - origin[0]) * direction[0] + (p[2]! - origin[2]) * direction[2];
      expect(along(d)).toBeGreaterThan(along(B!) + 0.7);
      expect(along(B!)).toBeGreaterThan(along(A!));
      expect(Math.abs(d[0])).toBeLessThan(PLANE_HALF.x);
      expect(Math.abs(d[2])).toBeLessThan(PLANE_HALF.z);
    }
  });
});
