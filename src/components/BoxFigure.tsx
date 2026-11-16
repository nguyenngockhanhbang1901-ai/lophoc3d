import { focusName, PRACTICE_SOLID, type BoxVertex, type PracticeFocus } from '@/lib/practice-questions';

// Standard oblique drawing: ABCD is the base, D sits at the back-left so AD, DC and DD' are hidden (dashed).
const POINTS: Record<BoxVertex, [number, number]> = {
  A: [44, 248], B: [284, 248], C: [356, 182], D: [116, 182],
  "A'": [44, 112], "B'": [284, 112], "C'": [356, 46], "D'": [116, 46],
};
const LABELS: Record<BoxVertex, [number, number, 'start' | 'middle' | 'end']> = {
  A: [32, 256, 'end'], B: [284, 270, 'middle'], C: [368, 188, 'start'], D: [124, 168, 'start'],
  "A'": [32, 108, 'end'], "B'": [294, 128, 'start'], "C'": [368, 42, 'start'], "D'": [116, 30, 'middle'],
};
const HIDDEN = new Set(['AD', 'DC', "DD'"]);
const EDGES: [BoxVertex, BoxVertex][] = [
  ['A', 'B'], ['B', 'C'], ['D', 'C'], ['A', 'D'],
  ["A'", "B'"], ["B'", "C'"], ["C'", "D'"], ["A'", "D'"],
  ['A', "A'"], ['B', "B'"], ['C', "C'"], ['D', "D'"],
];
const key = (a: BoxVertex, b: BoxVertex) => `${a}${b}`;

function glows(focus: PracticeFocus | null, a: BoxVertex, b: BoxVertex) {
  if (!focus) return false;
  if (focus.kind === 'edge') return (focus.from === a && focus.to === b) || (focus.from === b && focus.to === a);
  if (focus.kind === 'edges') return focus.list.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  const v = focus.vertices;
  return v.some((p, i) => { const q = v[(i + 1) % v.length]!; return (p === a && q === b) || (p === b && q === a); });
}

/** 2D drawing of the rectangular box ABCD.A'B'C'D'; the line or face a question asks about glows. */
/** Extra segments between vertices (e.g. face diagonals): drawn solid unless they lie on the hidden base. */
export type BoxSegment = readonly [BoxVertex, BoxVertex];
const BASE = new Set<BoxVertex>(['A', 'B', 'C', 'D']);

export function BoxFigure({ highlight = null, compact = false, segments = [] }: { highlight?: PracticeFocus | null; compact?: boolean; segments?: readonly BoxSegment[] | undefined }) {
  const edges = EDGES.map(([a, b]) => ({ a, b, hidden: HIDDEN.has(key(a, b)), lit: glows(highlight, a, b) }))
    .sort((x, y) => Number(x.lit) - Number(y.lit));
  return <figure className={`box-figure ${compact ? 'box-figure-compact' : ''}`} data-highlight={focusName(highlight)}>
    <svg viewBox="0 0 400 280" role="img" aria-label={`Hình vẽ ${PRACTICE_SOLID}`}>
      {highlight?.kind === 'face' && <polygon className="box-face highlight" points={highlight.vertices.map(v => POINTS[v].join(',')).join(' ')} />}
      {edges.filter(e => e.lit).map(({ a, b }) => <line key={`halo-${key(a, b)}`} className="box-halo" x1={POINTS[a][0]} y1={POINTS[a][1]} x2={POINTS[b][0]} y2={POINTS[b][1]} />)}
      {edges.map(({ a, b, hidden, lit }) => <line key={key(a, b)} data-edge={key(a, b)} className={`box-edge ${hidden ? 'hidden-edge' : ''} ${lit ? 'highlight' : ''}`} x1={POINTS[a][0]} y1={POINTS[a][1]} x2={POINTS[b][0]} y2={POINTS[b][1]} />)}
      {segments.map(([a, b]) => <line key={`seg-${key(a, b)}`} data-edge={key(a, b)} className={`box-edge box-segment ${BASE.has(a) && BASE.has(b) ? 'hidden-edge' : ''}`} x1={POINTS[a][0]} y1={POINTS[a][1]} x2={POINTS[b][0]} y2={POINTS[b][1]} />)}
      {(Object.keys(POINTS) as BoxVertex[]).map(v => <g key={v}>
        <circle className="box-point" cx={POINTS[v][0]} cy={POINTS[v][1]} r={3.4} />
        <text className="box-label" x={LABELS[v][0]} y={LABELS[v][1]} textAnchor={LABELS[v][2]} dominantBaseline="middle">{v}</text>
      </g>)}
    </svg>
    <figcaption>Hình hộp chữ nhật ABCD.A'B'C'D'</figcaption>
  </figure>;
}
