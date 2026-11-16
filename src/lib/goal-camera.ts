import { GOAL_DIMENSIONS, getGoalSteelMembers, GOAL_DISPLAY_SCALE, type Point3 } from './goal-model';

/**
 * Default wide-screen view: a 3/4 angle from the front-right, seen from a low eye height so the goal rises slightly
 * upward and the horizon crosses the goal at `WIDE_VIEW_HORIZON_SHARE` of its height.
 */
export const WIDE_VIEW_AZIMUTH_DEG = 36;
/** Eye height as a share of the goal height: a pinhole camera puts every point at eye height on the horizon line. */
export const WIDE_VIEW_HORIZON_SHARE = 1 / 3;
/** Earlier oblique-from-above direction, kept for callers that pass an explicit direction. */
export const WIDE_VIEW_DIRECTION: Point3 = [0.74, 0.5, 1];
/** Share of the canvas (each axis) the whole goal may occupy on wide screens, leaving a margin around it. */
export const WIDE_VIEW_FILL = 0.66;

export type GoalView = { position: Point3; target: Point3 };

type Vec = [number, number, number];
const sub = (a: Point3, b: Point3): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Point3, b: Point3): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Point3, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point3, b: Point3): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Point3): Vec => scale(a, 1 / Math.hypot(...a));

/** Displayed steel endpoints; the net always lies inside this outline. */
export function goalDisplayPoints(): Point3[] {
  return getGoalSteelMembers().flatMap(({ start, end }) => [scale(start, GOAL_DISPLAY_SCALE), scale(end, GOAL_DISPLAY_SCALE)]);
}

/** Camera basis for a view direction (target → camera). */
function basis(direction: Point3) {
  const back = normalize(direction);
  const right = normalize(cross([0, 1, 0], back));
  const up = cross(back, right);
  return { back, right, up };
}

/** Projects a world point to normalised screen coordinates (-1..1 is the canvas edge). */
export function projectToScreen(point: Point3, view: GoalView, fovDeg: number, aspect: number): [number, number] {
  const { back, right, up } = basis(sub(view.position, view.target));
  const rel = sub(point, view.position);
  const depth = -dot(rel, back);
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  return [dot(rel, right) / depth / (tanV * aspect), dot(rel, up) / depth / tanV];
}

/**
 * Wide-screen framing: keeps the view direction, then picks the target and distance so the whole goal
 * fits inside `fill` of the canvas and its projected outline is centred horizontally and vertically.
 */
export function frameGoalView(aspect: number, fovDeg: number, direction: Point3 = WIDE_VIEW_DIRECTION, fill = WIDE_VIEW_FILL): GoalView {
  const points = goalDisplayPoints();
  const { back, right, up } = basis(direction);
  const tanV = Math.tan((fovDeg * Math.PI) / 360) * fill;
  const tanH = tanV * aspect;
  const ys = points.map((p) => p[1]);
  let target: Vec = [0, (Math.min(...ys) + Math.max(...ys)) / 2, 0];
  let distance = 0;
  for (let i = 0; i < 8; i += 1) {
    // Smallest distance at which every point lies within the allowed frustum.
    distance = Math.max(...points.map((p) => {
      const rel = sub(p, target);
      const toward = dot(rel, back);
      return Math.max(Math.abs(dot(rel, right)) / tanH, Math.abs(dot(rel, up)) / tanV) + toward;
    }));
    const camera = add(target, scale(back, distance));
    const projected = points.map((p) => {
      const rel = sub(p, camera);
      const depth = -dot(rel, back);
      return [dot(rel, right) / depth, dot(rel, up) / depth] as const;
    });
    const xs = projected.map(([x]) => x);
    const vs = projected.map(([, y]) => y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...vs) + Math.max(...vs)) / 2;
    target = add(target, add(scale(right, cx * distance), scale(up, cy * distance)));
  }
  return { position: add(target, scale(back, distance)), target };
}

const directionFor = (azimuthDeg: number, elevationDeg: number): Point3 => {
  const a = (azimuthDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
};

/**
 * Default wide-screen view: whole goal centred within `fill`, from the 3/4 azimuth, with the camera's eye height
 * fixed at the horizon share of the goal height. Eye height rises with elevation, so bisection finds the angle.
 */
export function fitWideGoalView(aspect: number, fovDeg: number, fill = WIDE_VIEW_FILL): GoalView {
  const eye = GOAL_DIMENSIONS.height * GOAL_DISPLAY_SCALE * WIDE_VIEW_HORIZON_SHARE;
  let low = -40;
  let high = 40;
  let view = frameGoalView(aspect, fovDeg, directionFor(WIDE_VIEW_AZIMUTH_DEG, 0), fill);
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    view = frameGoalView(aspect, fovDeg, directionFor(WIDE_VIEW_AZIMUTH_DEG, mid), fill);
    if (view.position[1] > eye) high = mid; else low = mid;
  }
  return view;
}

/** Share of the canvas the goal may fill on portrait phones, where the narrow width limits the size. */
export const PORTRAIT_VIEW_FILL = 0.84;

/**
 * Default view for any screen: the same low 3/4 view with the horizon through one third of the goal height,
 * so the camera looks slightly upward on phones too; portrait screens only allow a larger fill.
 */
export function fitGoalView(aspect: number, fovDeg: number): GoalView {
  return fitWideGoalView(aspect, fovDeg, aspect >= 1 ? WIDE_VIEW_FILL : PORTRAIT_VIEW_FILL);
}
