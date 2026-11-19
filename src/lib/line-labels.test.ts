import { describe, expect, it } from 'vitest';
import { containedLabels, endLabel, LABEL_GAP } from './line-labels';

const rotate = (deg: number, r = 100) => { const t = deg * Math.PI / 180; return { a: { x: -r * Math.cos(t), y: -r * Math.sin(t) }, b: { x: r * Math.cos(t), y: r * Math.sin(t) } }; };
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
/** Distance from p to the infinite line through a, b. */
const offLine = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / dist(a, b);

describe('line name placement', () => {
  it('moves the d name smoothly as the line turns a full circle (no sudden jumps)', () => {
    let previous = endLabel(rotate(0).a, rotate(0).b);
    for (let deg = 1; deg <= 360; deg += 1) {
      const { a, b } = rotate(deg), next = endLabel(a, b);
      expect(dist(previous, next)).toBeLessThan(3);
      previous = next;
    }
  });
  it('keeps contained-line names smooth and off line d', () => {
    let previous = containedLabels(rotate(0).a, rotate(0).b, { x: 0, y: 0 }, [rotate(0).a]);
    for (let deg = 1; deg <= 360; deg += 1) {
      const { a, b } = rotate(deg), next = containedLabels(a, b, { x: 0, y: 0 }, [a, b]);
      expect(dist(previous.d, next.d)).toBeLessThan(3);
      expect(offLine(next.d, a, b)).toBeCloseTo(LABEL_GAP);
      for (const p of next.points) expect(offLine(p, a, b)).toBeCloseTo(LABEL_GAP);
      previous = next;
    }
  });
  it('puts d on the opposite side of line d from the A and B names', () => {
    const { a, b } = rotate(30), { d, points } = containedLabels(a, b, { x: 0, y: 0 }, [a, b]);
    const side = (p: { x: number; y: number }) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    expect(side(d)).toBe(-side(points[0]!));
    expect(side(points[0]!)).toBe(side(points[1]!));
  });
});
