import { describe, it, expect } from 'vitest';
import { containedLinePoints, pointOnLine, lineGeometry, validateTeamCount, canEdit, mayReadOtherAnswers, animatedLine, motionIsValid, advanceMotion } from './geometry';
describe('Classroom invariants', () => {
  it('intersection is exactly one point for all line motion', () => { for (const offset of [-1, 0, 1]) { expect(pointOnLine(0, 0, offset)[1]).toBe(0); expect(lineGeometry(0, offset).direction[1]).not.toBe(0); } });
  it('parallel line never meets the plane', () => { for (const offset of [-1, 0, 1]) for (const t of [-100, 0, 100]) expect(pointOnLine(1, t, offset)[1]).toBeGreaterThan(0); });
  it('contained line has every point on the plane', () => { for (const offset of [-1, 0, 1]) for (const t of [-100, 0, 100]) expect(pointOnLine(2, t, offset)[1]).toBe(0); });
  it('permits at most 10 teams', () => { expect(validateTeamCount(10)).toBe(true); expect(validateTeamCount(11)).toBe(false); expect(validateTeamCount(0)).toBe(false); });
  it('submitted answers cannot be edited', () => { expect(canEdit('2026-11-12')).toBe(false); expect(canEdit(null)).toBe(true); });
  it('other answers require teacher release', () => { expect(mayReadOtherAnswers(false)).toBe(false); expect(mayReadOtherAnswers(true)).toBe(true); });
  it('moving intersection A is exact and direction never becomes parallel', () => { for(let t=0;t<200;t+=0.07) { const {origin,direction}=animatedLine(0,t); expect(origin[1]).toBe(0); expect(direction[1]).toBeGreaterThanOrEqual(0.65); expect(motionIsValid(0,origin,direction)).toBe(true); } expect(animatedLine(0,2).origin).not.toEqual(animatedLine(0,0).origin); expect(animatedLine(0,2).direction).not.toEqual(animatedLine(0,0).direction); });
  it('parallel line keeps the same distance to the plane and never tilts', () => { for(let t=0;t<200;t+=0.07) { const {origin,direction}=animatedLine(1,t); expect(origin[1]).toBe(1.15); expect(direction[1]).toBe(0); for (const k of [-50, 50]) expect(origin[1] + k * direction[1]).toBe(1.15); } });
  it('parallel line still slides sideways and turns about a vertical axis', () => { const a = animatedLine(1, 0), b = animatedLine(1, 2); expect([b.origin[0], b.origin[2]]).not.toEqual([a.origin[0], a.origin[2]]); expect(b.direction).not.toEqual(a.direction); });
  it('a parallel line raised or lowered is rejected', () => { expect(motionIsValid(1, [0, 1.3, 0], [1, 0, 0])).toBe(false); expect(motionIsValid(1, [0, 1.15, 0], [1, 0.1, 0])).toBe(false); });
  it('every point of animated contained line stays on plane', () => { for(let t=0;t<200;t+=0.07) { const {origin,direction}=animatedLine(2,t); for(const parameter of [-100,0,100]) expect(origin[1]+parameter*direction[1]).toBe(0); } });
  it('pause freezes phase and speed changes only phase rate', () => { expect(advanceMotion(3,0.02,false,'fast')).toBe(3); expect(advanceMotion(0,0.02,true,'slow')).toBe(0.01); expect(advanceMotion(0,0.02,true,'normal')).toBe(0.02); expect(advanceMotion(0,0.02,true,'fast')).toBe(0.04); });
});import { lineSegment, segmentInsidePlane, splitByVisibility, CAMERA_VIEWS, isHidden } from './geometry';
describe('segments and hidden lines', () => {
  it('question 3 line is short and stays fully inside the illustrated plane', () => { let prev = animatedLine(2, 0); for (let t = 0.05; t < 200; t += 0.05) { const cur = animatedLine(2, t); const seg = lineSegment(2, cur.origin, cur.direction); expect(segmentInsidePlane(seg)).toBe(true); expect(Math.hypot(seg[1][0]-seg[0][0], seg[1][2]-seg[0][2])).toBeCloseTo(3.2); expect(Math.hypot(cur.origin[0]-prev.origin[0], cur.origin[2]-prev.origin[2])).toBeLessThan(0.1); prev = cur; } });
  it('question 3 never shows hidden dashes from any camera', () => { for (const cam of [[5,7,6],[0,-6,1],[8,0.3,-4]] as [number,number,number][]) for (let t = 0; t < 50; t += 0.5) { const { origin, direction } = animatedLine(2, t); const [a,b] = lineSegment(2, origin, direction); expect(splitByVisibility(a,b,cam).hidden).toHaveLength(0); } });
  it('question 1: part below plane is dashed from above, part above is dashed from below', () => { const [a,b] = lineSegment(0, [0,0,0], [0,1,0]); const above = splitByVisibility(a,b,CAMERA_VIEWS[0]); expect(above.hidden).toHaveLength(1); expect(above.hidden[0]![0][1]).toBeLessThan(0); const below = splitByVisibility(a,b,[3,-5,3]); expect(below.hidden[0]![1][1]).toBeGreaterThan(0); });
  it('question 2: dashed only when viewed from below the plane', () => { const [a,b] = lineSegment(1, [0,1.2,0], [1,0,0.3]); expect(splitByVisibility(a,b,CAMERA_VIEWS[1]).hidden).toHaveLength(0); expect(splitByVisibility(a,b,[0,-6,0.5]).visible.length + splitByVisibility(a,b,[0,-6,0.5]).hidden.length).toBeGreaterThan(0); expect(isHidden([0,1.2,0],[0,-6,0.5])).toBe(true); });
});

import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA_TARGETS, PLANE_HALF } from './geometry';
describe('question 3 initial view', () => {
  it('shows all four corners of plane (P) inside the Activity 2 model box, clear of the zoom buttons', () => {
    // Activity 2 boxes are about 1.15–2.2 wide per unit height and magnify the 40° view by 1.2.
    for (const aspect of [1.15, 1.6, 2.2]) {
      const camera = new PerspectiveCamera(2 * Math.atan(Math.tan(20 * Math.PI / 180) / 1.2) * 180 / Math.PI, aspect, 0.1, 100);
      camera.position.set(...CAMERA_VIEWS[2]); camera.lookAt(...CAMERA_TARGETS[2]); camera.updateMatrixWorld();
      for (const x of [-PLANE_HALF.x, PLANE_HALF.x]) for (const z of [-PLANE_HALF.z, PLANE_HALF.z]) {
        const p = new Vector3(x, 0, z).project(camera);
        expect(Math.abs(p.x)).toBeLessThan(0.95); expect(Math.abs(p.y)).toBeLessThan(0.95);
        // The zoom buttons sit in the lower right of the box; no corner of (P) may fall behind them.
        if (p.x > 0) expect(p.y).toBeGreaterThan(-0.42);
      }
    }
  });
  it('points A and B on the contained line stay distinct, on d and in the plane during motion', () => {
    for (const time of [0, 1.3, 4.7, 12]) {
      const { origin, direction } = animatedLine(2, time);
      const [a, b] = containedLinePoints(origin, direction);
      expect(a[1]).toBeCloseTo(0); expect(b[1]).toBeCloseTo(0);
      expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeCloseTo(2.4);
      for (const p of [a, b]) { expect(Math.abs(p[0])).toBeLessThan(3); expect(Math.abs(p[2])).toBeLessThan(2.25); }
    }
  });
});
