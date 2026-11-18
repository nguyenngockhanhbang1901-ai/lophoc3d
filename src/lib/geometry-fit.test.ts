import { describe, expect, it } from 'vitest';
import { ACTIVITY2_FIT, fitCaseView, modelPoints, projectedBounds } from './geometry-fit';
import type { CaseIndex } from './geometry';

const ASPECTS = [389 / 260, 480 / 260, 360 / 260];
describe('Hoạt động 2 model framing', () => {
  for (const index of [0, 1, 2] as CaseIndex[]) for (const aspect of ASPECTS) {
    it(`case ${index} at aspect ${aspect.toFixed(2)}: the whole moving model stays inside the frame`, () => {
      const v = fitCaseView(index, aspect);
      const b = projectedBounds(modelPoints(index), v.position, v.target, v.fov, aspect);
      for (const edge of [b.x0, b.y0]) expect(edge).toBeGreaterThanOrEqual(-0.97);
      for (const edge of [b.x1, b.y1]) expect(edge).toBeLessThanOrEqual(0.97);
    });
  }
  it('never grows beyond 30% over the earlier 1.2× view', () => {
    for (const index of [0, 1, 2] as CaseIndex[]) expect(fitCaseView(index, 2).magnification).toBeLessThanOrEqual(1.2 * 1.3 + 1e-9);
  });
  it('the contained model reaches the full 30% at the laptop frame', () => {
    expect(fitCaseView(2, 389 / 260).magnification).toBeCloseTo(1.2 * ACTIVITY2_FIT.growth);
  });
  it('the parallel and intersecting models still grow by more than 10% (their moving line limits them)', () => {
    for (const index of [0, 1] as CaseIndex[]) expect(fitCaseView(index, 389 / 260).magnification).toBeGreaterThan(1.2 * 1.1);
  });
});
