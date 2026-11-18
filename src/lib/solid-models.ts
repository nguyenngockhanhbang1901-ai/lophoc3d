/** Fixed coordinates of the Luyện tập 3 solids; the R3F scene only draws them. */
export type P3 = [number, number, number];
export type Solid = { vertices: Record<string, P3>; faces: readonly (readonly string[])[]; labels: Record<string, P3>; segments: readonly { from: string; to: string; face: readonly string[]; highlight?: boolean }[]; points: Record<string, P3> };

const mid = (a: P3, b: P3): P3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
/** Vertex names sit just outside the solid: pushed away from its centre so no edge runs through them. */
function labelsFor(vertices: Record<string, P3>, extra: Record<string, P3>, push = 0.38): Record<string, P3> {
  const all = Object.values(vertices);
  const c = [0, 1, 2].map(i => all.reduce((s, v) => s + v[i]!, 0) / all.length) as P3;
  const out: Record<string, P3> = {};
  for (const [name, v] of Object.entries({ ...vertices, ...extra })) {
    // Base corners are pushed sideways (and a little down), so a back corner's name never lands on its own dot.
    const flat = Math.hypot(v[0] - c[0], v[2] - c[2]);
    const d: P3 = flat < 0.3 ? [v[0] - c[0], v[1] - c[1], v[2] - c[2]] : [(v[0] - c[0]) / flat, -0.3, (v[2] - c[2]) / flat];
    const len = Math.hypot(...d) || 1;
    out[name] = [v[0] + d[0] / len * push, v[1] + d[1] / len * push, v[2] + d[2] / len * push];
  }
  return out;
}
const T = { A: [0, 2.1, 0] as P3, B: [-1.7, -0.6, 0.1] as P3, C: [0.1, -0.6, 1.5] as P3, D: [1.7, -0.6, -0.5] as P3 };
const TP = { M: mid(T.A, T.B), N: mid(T.A, T.C) };
/** Tứ diện ABCD with M, N the midpoints of AB and AC; MN lies on face ABC and is highlighted. */
export const TETRAHEDRON: Solid = {
  vertices: T,
  faces: [['A', 'B', 'C'], ['A', 'B', 'D'], ['A', 'C', 'D'], ['B', 'C', 'D']],
  points: TP,
  segments: [{ from: 'M', to: 'N', face: ['A', 'B', 'C'], highlight: true }],
  labels: labelsFor(T, TP),
};
const S = { S: [0, 2.1, 0] as P3, A: [-1.5, -0.6, 1.0] as P3, B: [1.0, -0.6, 1.0] as P3, C: [1.6, -0.6, -1.0] as P3, D: [-0.9, -0.6, -1.0] as P3 };
/** Hình chóp S.ABCD whose base ABCD is a parallelogram (AB = DC, AB // DC); edge AB is highlighted. */
export const PYRAMID: Solid = {
  vertices: S,
  faces: [['S', 'A', 'B'], ['S', 'B', 'C'], ['S', 'C', 'D'], ['S', 'D', 'A'], ['A', 'B', 'C', 'D']],
  points: {},
  segments: [],
  labels: labelsFor(S, {}),
};
export const SOLID_HIGHLIGHT: Record<'tetrahedron' | 'pyramid', [string, string]> = { tetrahedron: ['M', 'N'], pyramid: ['A', 'B'] };

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Outward normal of a face of a convex solid (oriented away from the centroid). */
function outwardNormal(solid: Solid, face: readonly string[]): [P3, P3] {
  const [a, b, c] = face.map(n => solid.vertices[n]!) as [P3, P3, P3];
  let n = cross(sub(b, a), sub(c, a));
  const all = Object.values(solid.vertices);
  const centroid: P3 = [0, 1, 2].map(i => all.reduce((s, v) => s + v[i]!, 0) / all.length) as P3;
  if (dot(n, sub(a, centroid)) < 0) n = [-n[0], -n[1], -n[2]];
  return [n, a];
}
export function faceFacesCamera(solid: Solid, face: readonly string[], camera: P3) {
  const [n, a] = outwardNormal(solid, face);
  return dot(n, sub(camera, a)) > 1e-9;
}
/** Edges of the solid, each with the faces that contain it. */
export function solidEdges(solid: Solid): { from: string; to: string; faces: (readonly string[])[] }[] {
  const map = new Map<string, { from: string; to: string; faces: (readonly string[])[] }>();
  for (const face of solid.faces) face.forEach((v, i) => {
    const w = face[(i + 1) % face.length]!;
    const key = [v, w].sort().join('-');
    const edge = map.get(key) ?? { from: v, to: w, faces: [] };
    edge.faces.push(face); map.set(key, edge);
  });
  return [...map.values()];
}
/** A convex solid's edge is hidden (dashed) exactly when every face containing it turns away from the camera. */
export function edgeHidden(solid: Solid, faces: readonly (readonly string[])[], camera: P3) {
  return faces.every(face => !faceFacesCamera(solid, face, camera));
}
export function solidPoint(solid: Solid, name: string): P3 | undefined {
  return solid.vertices[name] ?? solid.points[name];
}
