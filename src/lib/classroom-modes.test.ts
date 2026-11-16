import { describe, expect, it } from 'vitest';
import { canReadLecture, lessonModeSchema, needsAssignmentStart, presentationStateSchema } from './classroom-modes';
describe('Classroom lesson modes', () => {
  it('allows code-only reading only for open lecture classrooms', () => {
    expect(canReadLecture('lecture', false)).toBe(true);
    expect(canReadLecture('lecture', true)).toBe(false);
    expect(canReadLecture('default', false)).toBe(false);
    expect(canReadLecture('presentation', false)).toBe(false);
  });
  it('does not require assignment start for photo practice', () => {
    expect(needsAssignmentStart(4)).toBe(false);
    expect(needsAssignmentStart(1)).toBe(true);
    expect(needsAssignmentStart(3)).toBe(true);
  });
  it('supports the two modes and unchanged default', () => {
    expect(['default', 'lecture', 'presentation'].map(mode => lessonModeSchema.parse(mode))).toEqual(['default', 'lecture', 'presentation']);
    expect(lessonModeSchema.safeParse('other').success).toBe(false);
  });
  it('validates synchronized steps', () => {
    const state = { roomId: '00000000-0000-4000-8000-000000000001', activity: 5, step: 14, review: true };
    expect(presentationStateSchema.parse(state)).toEqual(state);
    expect(presentationStateSchema.safeParse({ ...state, step: -1 }).success).toBe(false);
  });
});