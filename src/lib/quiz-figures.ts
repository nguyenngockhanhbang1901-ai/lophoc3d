/**
 * Luyện tập 3 static textbook figures: parallel projections drawn in 2D.
 * Parallel projection keeps midpoints, centroids and parallel lines, so derived points are computed here
 * instead of being placed by eye, and the figures stay mathematically faithful.
 */
export type P2 = readonly [number, number];
export type FigureSegment = { from: string; to: string; hidden?: boolean };
export type QuizFigure = { title: string; points: Record<string, P2>; labels: Record<string, P2>; segments: readonly FigureSegment[]; dots: readonly string[] };
export type QuizFigureKey = 'tetra-midpoints' | 'pyramid' | 'tetra-centroids' | 'pyramid-center';
export const FIGURE_VIEWBOX = { width: 400, height: 330 } as const;

export const mid = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const centroid = (a: P2, b: P2, c: P2): P2 => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];

const TETRA = { A: [190, 30], B: [50, 250], C: [230, 295], D: [350, 220] } as const satisfies Record<string, P2>;
const TETRA_EDGES: FigureSegment[] = [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'A', to: 'D' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' }, { from: 'B', to: 'D', hidden: true }];
const TETRA_LABELS: Record<string, P2> = { A: [0, -14], B: [-16, 6], C: [0, 24], D: [16, 6] };

/** Base ABCD is a parallelogram (B − A = C − D); back edges AD, DC and SD are hidden. */
const PYRAMID = { S: [170, 30], A: [50, 230], B: [140, 300], C: [360, 300], D: [270, 230] } as const satisfies Record<string, P2>;
const PYRAMID_EDGES: FigureSegment[] = [{ from: 'S', to: 'A' }, { from: 'S', to: 'B' }, { from: 'S', to: 'C' }, { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'S', to: 'D', hidden: true }, { from: 'A', to: 'D', hidden: true }, { from: 'D', to: 'C', hidden: true }];
const PYRAMID_LABELS: Record<string, P2> = { S: [0, -14], A: [-16, 6], B: [-4, 24], C: [16, 16], D: [16, -6] };

function tetraMidpoints(): QuizFigure {
  const M = mid(TETRA.A, TETRA.B), N = mid(TETRA.A, TETRA.C);
  return { title: 'Tứ diện ABCD, M và N lần lượt là trung điểm của AB và AC', points: { ...TETRA, M, N }, labels: { ...TETRA_LABELS, M: [-16, 0], N: [15, 4] }, segments: [...TETRA_EDGES, { from: 'M', to: 'N' }], dots: ['M', 'N'] };
}
function tetraCentroids(): QuizFigure {
  const I = centroid(TETRA.A, TETRA.B, TETRA.C), J = centroid(TETRA.A, TETRA.B, TETRA.D);
  return { title: 'Tứ diện ABCD, I và J lần lượt là trọng tâm của tam giác ABC và ABD', points: { ...TETRA, I, J }, labels: { ...TETRA_LABELS, I: [-14, 14], J: [-6, -18] }, segments: [...TETRA_EDGES, { from: 'I', to: 'J', hidden: true }], dots: ['I', 'J'] };
}
function pyramidCenter(): QuizFigure {
  const O = mid(PYRAMID.A, PYRAMID.C), M = mid(PYRAMID.S, PYRAMID.A);
  return { title: 'Hình chóp S.ABCD đáy hình bình hành tâm O, M là trung điểm của SA', points: { ...PYRAMID, O, M }, labels: { ...PYRAMID_LABELS, O: [4, 20], M: [-16, 0] }, segments: [...PYRAMID_EDGES, { from: 'A', to: 'C', hidden: true }, { from: 'B', to: 'D', hidden: true }, { from: 'O', to: 'M', hidden: true }], dots: ['O', 'M'] };
}

export const QUIZ_FIGURES: Record<QuizFigureKey, QuizFigure> = {
  'tetra-midpoints': tetraMidpoints(),
  pyramid: { title: 'Hình chóp S.ABCD có đáy ABCD là hình bình hành', points: { ...PYRAMID }, labels: PYRAMID_LABELS, segments: PYRAMID_EDGES, dots: [] },
  'tetra-centroids': tetraCentroids(),
  'pyramid-center': pyramidCenter(),
};
