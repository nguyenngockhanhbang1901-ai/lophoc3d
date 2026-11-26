import type { Box } from "./types";

/** Box maths in percent of the 16:9 slide. All pure: the stage only feeds pointer deltas in. */
export const MIN_SIZE = 3;
export const SNAP_THRESHOLD = 0.8;
/** One percent of width is 16/9 times wider than one percent of height. */
export const SLIDE_ASPECT = 16 / 9;

export const round = (n: number) => Math.round(n * 100) / 100;

export function clampBox(box: Box, min = MIN_SIZE): Box {
  const w = Math.min(100, Math.max(min, box.w));
  const h = Math.min(100, Math.max(min, box.h));
  return {
    x: round(Math.min(100 - w, Math.max(0, box.x))),
    y: round(Math.min(100 - h, Math.max(0, box.y))),
    w: round(w),
    h: round(h),
  };
}
export function moveBox(box: Box, dx: number, dy: number): Box {
  return clampBox({ ...box, x: box.x + dx, y: box.y + dy });
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Drags one handle by (dx, dy). `keepRatio` keeps the on-screen proportions (corners only). */
export function resizeBox(
  box: Box,
  handle: Handle,
  dx: number,
  dy: number,
  keepRatio = false,
  min = MIN_SIZE,
): Box {
  let { x, y, w, h } = box;
  const right = x + w;
  const bottom = y + h;
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  if (west) {
    x = Math.min(x + dx, right - min);
    w = right - x;
  }
  if (east) w = Math.max(min, w + dx);
  if (north) {
    y = Math.min(y + dy, bottom - min);
    h = bottom - y;
  }
  if (south) h = Math.max(min, h + dy);
  if (keepRatio && handle.length === 2) {
    const ratio = (box.w * SLIDE_ASPECT) / box.h; // on-screen width / height
    const wide = (w * SLIDE_ASPECT) / h > ratio;
    if (wide) {
      w = (h * ratio) / SLIDE_ASPECT;
    } else {
      h = (w * SLIDE_ASPECT) / ratio;
    }
    if (west) x = right - w;
    if (north) y = bottom - h;
  }
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (x + w > 100) w = 100 - x;
  if (y + h > 100) h = 100 - y;
  return { x: round(x), y: round(y), w: round(Math.max(min, w)), h: round(Math.max(min, h)) };
}

export const nudge = (box: Box, dx: number, dy: number): Box => moveBox(box, dx, dy);

export type Guides = { vertical: number[]; horizontal: number[] };
const NO_GUIDES: Guides = { vertical: [], horizontal: [] };

function lines(b: Box) {
  return { v: [b.x, b.x + b.w / 2, b.x + b.w], h: [b.y, b.y + b.h / 2, b.y + b.h] };
}

/** Nearest offset that lines `mine` up with one of `targets`, within the threshold. */
function nearest(
  mine: number[],
  targets: number[],
  threshold: number,
): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const m of mine)
    for (const t of targets) {
      const delta = t - m;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta)))
        best = { delta, at: t };
    }
  return best;
}

/** Snaps a box being moved to other boxes and the slide's centre lines; returns the guides to draw. */
export function snapMove(
  box: Box,
  others: readonly Box[],
  threshold = SNAP_THRESHOLD,
): { box: Box; guides: Guides } {
  const targetsV = [50, ...others.flatMap((o) => lines(o).v)];
  const targetsH = [50, ...others.flatMap((o) => lines(o).h)];
  const mine = lines(box);
  const sx = nearest(mine.v, targetsV, threshold);
  const sy = nearest(mine.h, targetsH, threshold);
  if (!sx && !sy) return { box, guides: NO_GUIDES };
  const snapped = clampBox({ ...box, x: box.x + (sx?.delta ?? 0), y: box.y + (sy?.delta ?? 0) });
  return { box: snapped, guides: { vertical: sx ? [sx.at] : [], horizontal: sy ? [sy.at] : [] } };
}

/** Snaps the edges a resize is dragging (a handle's own edges only). */
export function snapResize(
  box: Box,
  handle: Handle,
  others: readonly Box[],
  threshold = SNAP_THRESHOLD,
): { box: Box; guides: Guides } {
  const targetsV = [50, ...others.flatMap((o) => lines(o).v)];
  const targetsH = [50, ...others.flatMap((o) => lines(o).h)];
  let { x, y, w, h } = box;
  const guides: Guides = { vertical: [], horizontal: [] };
  if (handle.includes("w")) {
    const s = nearest([x], targetsV, threshold);
    if (s) {
      w -= s.delta;
      x += s.delta;
      guides.vertical.push(s.at);
    }
  }
  if (handle.includes("e")) {
    const s = nearest([x + w], targetsV, threshold);
    if (s) {
      w += s.delta;
      guides.vertical.push(s.at);
    }
  }
  if (handle.includes("n")) {
    const s = nearest([y], targetsH, threshold);
    if (s) {
      h -= s.delta;
      y += s.delta;
      guides.horizontal.push(s.at);
    }
  }
  if (handle.includes("s")) {
    const s = nearest([y + h], targetsH, threshold);
    if (s) {
      h += s.delta;
      guides.horizontal.push(s.at);
    }
  }
  return {
    box: guides.vertical.length || guides.horizontal.length ? clampBox({ x, y, w, h }) : box,
    guides,
  };
}
