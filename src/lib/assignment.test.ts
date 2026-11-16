import { describe, expect, it } from 'vitest';
import { allTeamsSubmitted, activityAnswersVisible, activityReleaseAt, answersVisibilityPatch, assignmentStarted, lessonSection } from './assignment';
import { normalizeTimings, remainingMs } from './timer';

describe('teacher assignment release', () => {
  const sharedStart = '2026-11-12T23:45:02.000Z';
  const now = Date.parse(sharedStart);
  it('students cannot start before the teacher releases the assignment', () => {
    expect(assignmentStarted(null, now)).toBe(false);
    expect(assignmentStarted(sharedStart, now - 1)).toBe(false);
    expect(assignmentStarted(sharedStart, now)).toBe(true);
  });
  it('all teams use the same first-question clock, including late joiners', () => {
    const teams = [1, 2, 3, 4].map(() => normalizeTimings([{ started_at: sharedStart, ended_at: null }]));
    expect(teams.map(t => remainingMs(t[0]?.started_at ?? null, now))).toEqual([30000, 30000, 30000, 30000]);
    expect(remainingMs(teams[3]?.[0]?.started_at ?? null, now + 10000)).toBe(20000);
  });
});
describe('per-activity assign and SHOW ANSWER', () => {
  const room = { started_at: '2026-11-13T07:00:00.000Z', activity2_started_at: null, practice1_started_at: null, answers_visible: false, activity1_answers_visible: true, practice1_answers_visible: false };
  it('assigning Activity 1 does not release Activity 2', () => {
    expect(activityReleaseAt(room, 1)).toBe('2026-11-13T07:00:00.000Z');
    expect(activityReleaseAt(room, 2)).toBeNull();
  });
  it('SHOW ANSWER in Activity 1 does not publish Activity 2 answers', () => {
    expect(activityAnswersVisible(room, 1)).toBe(true);
    expect(activityAnswersVisible(room, 2)).toBe(false);
  });
  it('toggling SHOW ANSWER only changes the current activity', () => {
    expect(answersVisibilityPatch(1, false)).toEqual({ activity1_answers_visible: false });
    expect(answersVisibilityPatch(2, true)).toEqual({ answers_visible: true });
  });
});
describe('Luyện tập 1 assign and SHOW ANSWER', () => {
  const room = { started_at: '2026-11-13T07:00:00.000Z', activity2_started_at: '2026-11-13T07:10:00.000Z', practice1_started_at: null, answers_visible: true, activity1_answers_visible: true, practice1_answers_visible: false };
  it('releasing earlier activities does not release Luyện tập 1', () => {
    expect(activityReleaseAt(room, 3)).toBeNull();
    expect(activityReleaseAt({ ...room, practice1_started_at: '2026-11-13T07:20:00.000Z' }, 3)).toBe('2026-11-13T07:20:00.000Z');
  });
  it('SHOW ANSWER of earlier activities does not publish Luyện tập 1', () => {
    expect(activityAnswersVisible(room, 3)).toBe(false);
    expect(answersVisibilityPatch(3, true)).toEqual({ practice1_answers_visible: true });
  });
});
describe('Luyện tập 1 (photo), Luyện tập 2 (box) and Hoạt động 3', () => {
  it('names and orders the five parts', async () => {
    const { activityName, LESSON_ORDER } = await import('./assignment');
    expect(LESSON_ORDER.map(activityName)).toEqual(['Hoạt động 1', 'Hoạt động 2', 'Luyện tập 1', 'Luyện tập 2', 'Hoạt động 3']);
  });
  it('each new part has its own release and SHOW ANSWER', () => {
    const room = { started_at: null, activity2_started_at: null, practice1_started_at: '2026-11-14T01:00:00.000Z', photo_started_at: null, activity3_started_at: '2026-11-14T01:10:00.000Z', answers_visible: false, activity1_answers_visible: false, practice1_answers_visible: true, photo_answers_visible: false, activity3_answers_visible: false };
    expect(activityReleaseAt(room, 4)).toBeNull();
    expect(activityReleaseAt(room, 5)).toBe('2026-11-14T01:10:00.000Z');
    expect(activityAnswersVisible(room, 4)).toBe(false);
    expect(answersVisibilityPatch(4, true)).toEqual({ photo_answers_visible: true });
    expect(answersVisibilityPatch(5, true)).toEqual({ activity3_answers_visible: true });
  });
});

import { isPresentationPart as presentationPart } from './assignment';
describe('Luyện tập 1 is presented, not assigned', () => {
  it('photo practice (part 4) is a presentation part; box practice (part 3) is not', () => {
    expect(presentationPart(4)).toBe(true);
    expect(presentationPart(3)).toBe(false);
  });
});

describe('full screen section line', () => {
  it('Hoạt động 1 shows no section line', () => { expect(lessonSection(1)).toBeNull(); });
  it('Hoạt động 2, Luyện tập 1 and Luyện tập 2 show section 1', () => {
    for (const part of [2, 4, 3] as const) expect(lessonSection(part)).toBe('1. Đường thẳng song song với mặt phẳng');
  });
  it('Hoạt động 3 shows section 2', () => {
    expect(lessonSection(5)).toBe('2. Điều kiện và tính chất của đường thẳng song song với mặt phẳng');
  });
});

describe('automatic SHOW ANSWER', () => {
  const done = '2026-11-16T14:00:00.000Z';
  it('Hoạt động 1 shows answers only when every team has submitted', () => {
    expect(allTeamsSubmitted([{ goal_completed_at: done }, { goal_completed_at: null }], 1)).toBe(false);
    expect(allTeamsSubmitted([{ goal_completed_at: done }, { goal_completed_at: done }], 1)).toBe(true);
  });
  it('Luyện tập 2 uses its own submissions, not Hoạt động 1', () => {
    expect(allTeamsSubmitted([{ goal_completed_at: done, practice_completed_at: null }], 3)).toBe(false);
    expect(allTeamsSubmitted([{ practice_completed_at: done }, { practice_completed_at: done }], 3)).toBe(true);
  });
  it('never fires for presentation parts or a class without teams', () => {
    expect(allTeamsSubmitted([{ goal_completed_at: done, practice_completed_at: done }], 2)).toBe(false);
    expect(allTeamsSubmitted([], 1)).toBe(false);
  });
});
