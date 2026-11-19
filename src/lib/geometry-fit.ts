import { animatedLine, lineSegment, nameAnchors, PLANE_HALF, CAMERA_VIEWS, CAMERA_TARGETS, type CaseIndex, type Vec3 } from './geometry';

/**
 * Framing for the Hoạt động 2 models: the camera (never the world geometry) is re-aimed and its field of view narrowed,
 * so the model grows inside an unchanged frame while every pose of the moving line, the plane and the labels stays inside.
 */
export type FitConfig = { baseMagnification: number; growth: number; fill: number };
/** Hoạt động 2: up to 30% larger than the earlier 1.2× view, as far as the frame allows with the whole motion inside. */
export const ACTIVITY2_FIT: FitConfig = { baseMagnification: 1.2, growth: 1.3, fill: 0.96 };
export const BASE_FOV_DEG = 40;
export type FittedView = { position: Vec3; target: Vec3; fov: number; magnification: number };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a));

/** Every point the model can occupy: plane corners, both ends of d and its label box over a long motion run, and the A/B/M markers. */
export function modelPoints(index: CaseIndex, seconds = 120, step = 0.05): Vec3[] {
  const points: Vec3[] = [[-PLANE_HALF.x, 0, -PLANE_HALF.z], [PLANE_HALF.x, 0, -PLANE_HALF.z], [PLANE_HALF.x, 0, PLANE_HALF.z], [-PLANE_HALF.x, 0, PLANE_HALF.z]];
  for (let t = 0; t <= seconds; t += step) {
    const { origin, direction } = animatedLine(index, t);
    const [a, b] = lineSegment(index, origin, direction);
    const names = nameAnchors(index, origin, direction);
    points.push(a, b, add(names.d, [0.45, 0.25, 0]), add(names.d, [-0.45, -0.25, 0]));
    if (names.M) points.push(add(names.M, [0.45, 0.25, 0]), add(names.M, [-0.2, -0.25, 0]));
    for (const p of [names.A, names.B]) if (p) points.push(add(p, [0, 0.33, 0]));
  }
  return points;
}

function basis(position: Vec3, target: Vec3) {
  const forward = unit(sub(target, position));
  const right = unit(cross(forward, [0, 1, 0]));
  return { forward, right, up: cross(right, forward) };
}
/** Projected extent of the points in normalised screen units (−1…1 is the frame edge). */
export function projectedBounds(points: readonly Vec3[], position: Vec3, target: Vec3, fovDeg: number, aspect: number) {
  const { forward, right, up } = basis(position, target);
  const t = Math.tan(fovDeg * Math.PI / 360);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    const d = sub(p, position), z = dot(d, forward);
    const x = dot(d, right) / z / (t * aspect), y = dot(d, up) / z / t;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1 };
}
const fovFor = (magnification: number) => 2 * Math.atan(Math.tan(BASE_FOV_DEG * Math.PI / 360) / magnification) * 180 / Math.PI;

/**
 * Centres the whole model in the frame (camera and target slide together, so the viewing direction is kept) and picks the
 * largest magnification up to baseMagnification × growth for which everything stays within `fill` of the frame.
 */
export function fitCaseView(index: CaseIndex, aspect: number, config: FitConfig = ACTIVITY2_FIT, points = modelPoints(index)): FittedView {
  let position = CAMERA_VIEWS[index], target = CAMERA_TARGETS[index];
  const cap = config.baseMagnification * config.growth;
  let magnification = config.baseMagnification;
  for (let k = 0; k < 40; k++) {
    const fov = fovFor(magnification);
    const b = projectedBounds(points, position, target, fov, aspect);
    const { right, up } = basis(position, target);
    const distance = Math.hypot(...sub(target, position)), t = Math.tan(fov * Math.PI / 360);
    const shift = add(scale(right, (b.x0 + b.x1) / 2 * t * aspect * distance), scale(up, (b.y0 + b.y1) / 2 * t * distance));
    position = add(position, shift); target = add(target, shift);
    const half = Math.max((b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2);
    magnification = Math.min(cap, magnification * config.fill / half);
  }
  return { position, target, fov: fovFor(magnification), magnification };
}
