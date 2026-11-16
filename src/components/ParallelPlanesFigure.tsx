// A faithful redraw of the teacher's picture: plane (P) lies flat, plane (Q) stands on it and meets it along b;
// a lies in (Q). Only the part of (P)'s back edge behind (Q) is dashed. Nothing is added to the original drawing.
const P = { fl: [38, 207], fr: [410, 207], br: [488, 73], bl: [117, 73] } as const;
const Q = { tl: [147, 20], tr: [358, 20], br: [380, 153], bl: [168, 153] } as const;
const BACK = P.bl[1];
/** x where a side of (Q) crosses height y. */
const sideX = (top: readonly number[], bottom: readonly number[], y: number) => top[0]! + (bottom[0]! - top[0]!) * (y - top[1]!) / (bottom[1]! - top[1]!);
const HIDE_FROM = sideX(Q.tl, Q.bl, BACK);
const HIDE_TO = sideX(Q.tr, Q.br, BACK);
const pts = (list: readonly (readonly number[])[]) => list.map(p => p.join(',')).join(' ');

/** Angle mark at a plane's corner: an arc of radius r from the direction of `to1` round to the direction of `to2`. */
function cornerArc(corner: readonly number[], to1: readonly number[], to2: readonly number[], r: number, sweep: 0 | 1) {
  const at = (to: readonly number[]) => { const dx = to[0]! - corner[0]!, dy = to[1]! - corner[1]!, len = Math.hypot(dx, dy); return [corner[0]! + dx / len * r, corner[1]! + dy / len * r]; };
  const [x1, y1] = at(to1), [x2, y2] = at(to2);
  return `M${x1} ${y1} A${r} ${r} 0 0 ${sweep} ${x2} ${y2}`;
}

/** Textbook drawing for the proof: (Q) is the plane through the parallel lines a and b, and (P) ∩ (Q) = b. */
export function ParallelPlanesFigure() {
  return <svg className="pq-figure" viewBox="0 0 520 237" role="img" aria-label="Mặt phẳng (Q) chứa hai đường thẳng song song a và b, cắt mặt phẳng (P) theo đường thẳng b">
    <polyline className="pq-edge" points={pts([[HIDE_FROM, BACK], P.bl, P.fl, P.fr, P.br, [HIDE_TO, BACK]])} />
    <line className="pq-edge pq-hidden" x1={HIDE_FROM} y1={BACK} x2={HIDE_TO} y2={BACK} />
    <polyline className="pq-edge" points={pts([Q.bl, Q.tl, Q.tr, Q.br])} />
    <line className="pq-line" x1={205} y1={47} x2={330} y2={47} />
    <line className="pq-line" x1={117} y1={Q.bl[1]} x2={408} y2={Q.bl[1]} />
    <path className="pq-arc" d={cornerArc(P.fl, P.fr, P.bl, 50, 0)} />
    <path className="pq-arc" d={cornerArc(Q.tl, Q.tr, Q.bl, 42, 1)} />
    <text className="pq-label" x={56} y={201}>P</text>
    <text className="pq-label" x={154} y={47}>Q</text>
    <text className="pq-label" x={314} y={40}>a</text>
    <text className="pq-label" x={343} y={142}>b</text>
  </svg>;
}
