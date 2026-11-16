import { describe, expect, it } from 'vitest';
import { fitGoalView, fitWideGoalView, goalDisplayPoints, PORTRAIT_VIEW_FILL, projectToScreen, WIDE_VIEW_FILL } from './goal-camera';
import { GOAL_DIMENSIONS, getGoalSteelMembers, GOAL_DISPLAY_SCALE, type Point3 } from './goal-model';

const FOV = 44;
const ASPECT = 16 / 9;

const edges = getGoalSteelMembers().map(({ name, start, end }) => ({
  name,
  start: [start[0] * GOAL_DISPLAY_SCALE, start[1] * GOAL_DISPLAY_SCALE, start[2] * GOAL_DISPLAY_SCALE] as Point3,
  end: [end[0] * GOAL_DISPLAY_SCALE, end[1] * GOAL_DISPLAY_SCALE, end[2] * GOAL_DISPLAY_SCALE] as Point3,
}));

type Screen = [[number, number], [number, number]];

function distanceToSegment(p: [number, number], a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** Share of an edge's projection lying on top of another edge's projection; joints are skipped since neighbours meet there. */
function hiddenShare(index: number, screen: Screen[]) {
  const self = screen[index];
  if (!self) return 0;
  const [a, b] = self;
  let hits = 0;
  let total = 0;
  for (let s = 0; s <= 60; s += 1) {
    const t = s / 60;
    if (t < 0.12 || t > 0.88) continue;
    total += 1;
    const p: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let j = 0; j < screen.length; j += 1) {
      if (j === index) continue;
      const other = screen[j];
      if (!other) continue;
      const [c, d] = other;
      if (Math.hypot(d[0] - c[0], d[1] - c[1]) < 0.02) continue;
      if (distanceToSegment(p, c, d) < 0.012) {
        hits += 1;
        break;
      }
    }
  }
  return total ? hits / total : 0;
}

describe('wide-screen goal framing', () => {
  for (const aspect of [982 / 432, 16 / 9, 1.2]) {
    it(`shows the whole goal with a margin and centred at aspect ${aspect.toFixed(2)}`, () => {
      const view = fitWideGoalView(aspect, FOV);
      const screen = goalDisplayPoints().map((p) => projectToScreen(p, view, FOV, aspect));
      const xs = screen.map(([x]) => x);
      const ys = screen.map(([, y]) => y);
      expect(Math.max(...xs.map(Math.abs), ...ys.map(Math.abs))).toBeLessThanOrEqual(WIDE_VIEW_FILL + 1e-6);
      expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2)).toBeLessThan(0.01);
      expect(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2)).toBeLessThan(0.01);
    });
  }

  it('looks at the goal from a 3/4 angle, slightly upward', () => {
    const { position, target } = fitWideGoalView(ASPECT, FOV);
    const d = [position[0] - target[0], position[1] - target[1], position[2] - target[2]] as const;
    const azimuth = Math.atan2(d[0], d[2]) * 180 / Math.PI;
    const elevation = Math.atan2(d[1], Math.hypot(d[0], d[2])) * 180 / Math.PI;
    expect(d[2]).toBeGreaterThan(0);
    expect(azimuth).toBeGreaterThan(33);
    expect(azimuth).toBeLessThan(40);
    // The camera sits below the goal's middle and tilts up a little.
    expect(elevation).toBeLessThan(0);
    expect(elevation).toBeGreaterThan(-10);
  });

  it('puts the horizon through one third of the goal height', () => {
    for (const aspect of [1068 / 432, ASPECT, 1.2]) {
      const view = fitWideGoalView(aspect, FOV);
      const height = GOAL_DIMENSIONS.height * GOAL_DISPLAY_SCALE;
      // A far-away point straight ahead at ground level marks the horizon.
      const far: Point3 = [view.position[0] * -400, 0, view.position[2] * -400];
      const horizonY = projectToScreen(far, view, FOV, aspect)[1];
      const postThird = projectToScreen([-GOAL_DIMENSIONS.width * GOAL_DISPLAY_SCALE / 2, height / 3, 0], view, FOV, aspect)[1];
      const groundY = projectToScreen([-GOAL_DIMENSIONS.width * GOAL_DISPLAY_SCALE / 2, 0, 0], view, FOV, aspect)[1];
      const topY = projectToScreen([-GOAL_DIMENSIONS.width * GOAL_DISPLAY_SCALE / 2, height, 0], view, FOV, aspect)[1];
      expect(view.position[1]).toBeCloseTo(height / 3, 3);
      expect(Math.abs(postThird - horizonY)).toBeLessThan(0.01);
      expect(horizonY).toBeGreaterThan(groundY);
      expect(horizonY).toBeLessThan(topY);
    }
  });

  it('keeps every steel edge separately visible', () => {
    const view = fitWideGoalView(ASPECT, FOV);
    const screen: Screen[] = edges.map((e) => [
      projectToScreen(e.start, view, FOV, ASPECT),
      projectToScreen(e.end, view, FOV, ASPECT),
    ]);
    const worst = Math.max(...edges.map((_, i) => hiddenShare(i, screen)));
    // No steel edge may be more than a tenth of its length hidden behind another one.
    expect(worst).toBeLessThanOrEqual(0.1);
  });
});

describe('portrait phone goal framing', () => {
  const height = GOAL_DIMENSIONS.height * GOAL_DISPLAY_SCALE;
  for (const aspect of [358 / 340, 390 / 560, 0.6]) {
    it(`looks slightly up with the horizon through one third of the goal at aspect ${aspect.toFixed(2)}`, () => {
      const view = fitGoalView(aspect, FOV);
      const d = [view.position[0] - view.target[0], view.position[1] - view.target[1], view.position[2] - view.target[2]] as const;
      const elevation = Math.atan2(d[1], Math.hypot(d[0], d[2])) * 180 / Math.PI;
      expect(view.position[1]).toBeCloseTo(height / 3, 3);
      expect(elevation).toBeLessThan(0);
      const far: Point3 = [view.position[0] * -400, 0, view.position[2] * -400];
      const horizonY = projectToScreen(far, view, FOV, aspect)[1];
      const postThird = projectToScreen([-GOAL_DIMENSIONS.width * GOAL_DISPLAY_SCALE / 2, height / 3, 0], view, FOV, aspect)[1];
      expect(Math.abs(postThird - horizonY)).toBeLessThan(0.01);
    });
    it(`keeps the whole goal on screen at aspect ${aspect.toFixed(2)}`, () => {
      const view = fitGoalView(aspect, FOV);
      const screen = goalDisplayPoints().map((p) => projectToScreen(p, view, FOV, aspect));
      const limit = aspect >= 1 ? WIDE_VIEW_FILL : PORTRAIT_VIEW_FILL;
      expect(Math.max(...screen.flat().map(Math.abs))).toBeLessThanOrEqual(limit + 1e-6);
    });
  }
});
