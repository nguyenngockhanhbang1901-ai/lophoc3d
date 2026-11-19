/** Screen-pixel placement of the d/A/B names around a projected line (Hoạt động 2 framed views). */
export type ScreenPoint = { x: number; y: number };
export const LABEL_GAP = 20;
export const END_OFFSET = 12;

/** Unit direction a→b and its fixed left-hand normal. The normal is never flipped, so it turns smoothly with the line and names never jump sides. */
export function lineFrame(a: ScreenPoint, b: ScreenPoint) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  return { ux, uy, nx: uy, ny: -ux };
}
/** d sits just past the end b, on the normal side. */
export function endLabel(a: ScreenPoint, b: ScreenPoint, gap = LABEL_GAP): ScreenPoint {
  const f = lineFrame(a, b);
  return { x: b.x + f.ux * END_OFFSET + f.nx * gap, y: b.y + f.uy * END_OFFSET + f.ny * gap };
}
/** Line lying in the plane: A and B on the normal side of their points, d at the middle on the other side, so all names stay inside the plane and never touch each other or d. */
export function containedLabels(a: ScreenPoint, b: ScreenPoint, middle: ScreenPoint, points: ScreenPoint[], gap = LABEL_GAP) {
  const f = lineFrame(a, b);
  return {
    d: { x: middle.x - f.nx * gap, y: middle.y - f.ny * gap },
    points: points.map(p => ({ x: p.x + f.nx * gap, y: p.y + f.ny * gap })),
  };
}
