import type { Vec3 } from './geometry';
import type { StepConfig } from './goal-progress';
export type PairKind = 'parallel' | 'intersecting' | 'coincident' | 'skew';
export const PAIR_QUESTIONS = [
  'Có bao nhiêu điểm chung giữa hai đường thẳng $d$ và $d^{\\prime}$?',
  'Có bao nhiêu điểm chung giữa hai đường thẳng $d$ và $d^{\\prime}$?',
  'Có bao nhiêu điểm chung giữa hai đường thẳng $d$ và $d^{\\prime}$?',
  'Em hãy nêu mối quan hệ giữa đường thẳng $d$, $d^{\\prime}$ và mặt phẳng $(P)$ trong ba mô hình trên.',
  'Có bao nhiêu điểm chung giữa hai đường thẳng $d$ và $d^{\\prime}$?',
  'Em hãy nêu mối quan hệ giữa đường thẳng $d$, $d^{\\prime}$ và mặt phẳng $(P)$?',
] as const;
export const PAIR_ANSWERS = ['Không có điểm chung.', 'Có một điểm chung.', 'Có vô số điểm chung.', 'Hai đường thẳng $d$ và $d^{\\prime}$ cùng nằm trong mặt phẳng $(P)$.', 'Không có điểm chung.', '$d$ nằm trong $(P)$, $d^{\\prime}$ không nằm trong $(P)$; không có mặt phẳng nào chứa cả hai đường thẳng.'];
export const PAIR_STEPS: StepConfig = { count: 6, limitMs: 90_000, accepts: () => true };
export function pairSegments(kind: PairKind): [Vec3, Vec3][] {
  const first: [Vec3, Vec3] = [[-2.2, 0, -0.6], [2.2, 0, -0.6]];
  if (kind === 'parallel') return [first, [[-2.2, 0, 0.8], [2.2, 0, 0.8]]];
  if (kind === 'coincident') return [first, first];
  if (kind === 'skew') return [first, [[0.4, 1.25, -1.7], [0.4, 1.25, 1.7]]];
  return [first, [[-1.2, 0, -1.8], [1.2, 0, 0.6]]];
}