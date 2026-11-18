export function assignmentStarted(startedAt: string | null | undefined, now: number) {
  return Boolean(startedAt && Date.parse(startedAt) <= now);
}
/** Stored part numbers: 1 = Hoạt động 1, 2 = Hoạt động 2, 3 = Luyện tập 2 (box), 4 = Luyện tập 1 (photo), 5 = Hoạt động 3, 6 = Luyện tập 3 (AI NHANH HƠN). */
export type ActivityNumber = 1 | 2 | 3 | 4 | 5 | 6;
/** Lesson order shown to everyone. */
export const LESSON_ORDER: readonly ActivityNumber[] = [1, 2, 4, 3, 5, 6];
type ReleaseRoom = { started_at: string | null; activity2_started_at: string | null; practice1_started_at: string | null; photo_started_at?: string | null; activity3_started_at?: string | null; quiz_started_at?: string | null };
type VisibilityRoom = { answers_visible: boolean; activity1_answers_visible: boolean; practice1_answers_visible: boolean; photo_answers_visible?: boolean; activity3_answers_visible?: boolean; quiz_answers_visible?: boolean };

export function toActivity(value: number | null | undefined): ActivityNumber {
  return value === 2 || value === 3 || value === 4 || value === 5 || value === 6 ? value : 1;
}
const NAMES: Record<ActivityNumber, string> = { 1: 'Hoạt động 1', 2: 'Hoạt động 2', 3: 'Luyện tập 2', 4: 'Luyện tập 1', 5: 'Hoạt động 3', 6: 'Luyện tập 3' };
export function activityName(activity: ActivityNumber) {
  return NAMES[activity];
}

/** Each part is released by its own "Bắt đầu giao bài" press; switching parts never releases one. */
export function activityReleaseAt(room: ReleaseRoom, activity: ActivityNumber) {
  switch (activity) {
    case 1: return room.started_at;
    case 2: return room.activity2_started_at;
    case 3: return room.practice1_started_at;
    case 4: return room.photo_started_at ?? null;
    case 5: return room.activity3_started_at ?? null;
    case 6: return room.quiz_started_at ?? null;
  }
}
export function releasePatch(activity: ActivityNumber, startedAt: string): Partial<ReleaseRoom> {
  switch (activity) {
    case 1: return { started_at: startedAt };
    case 2: return { activity2_started_at: startedAt };
    case 3: return { practice1_started_at: startedAt };
    case 4: return { photo_started_at: startedAt };
    case 5: return { activity3_started_at: startedAt };
    case 6: return { quiz_started_at: startedAt };
  }
}

/** SHOW ANSWER is stored per part, so publishing one part never publishes another. */
export function activityAnswersVisible(room: VisibilityRoom, activity: ActivityNumber) {
  switch (activity) {
    case 1: return room.activity1_answers_visible;
    case 2: return room.answers_visible;
    case 3: return room.practice1_answers_visible;
    case 4: return Boolean(room.photo_answers_visible);
    case 5: return Boolean(room.activity3_answers_visible);
    case 6: return Boolean(room.quiz_answers_visible);
  }
}

export function answersVisibilityPatch(activity: ActivityNumber, visible: boolean): Partial<VisibilityRoom> {
  switch (activity) {
    case 1: return { activity1_answers_visible: visible };
    case 2: return { answers_visible: visible };
    case 3: return { practice1_answers_visible: visible };
    case 4: return { photo_answers_visible: visible };
    case 5: return { activity3_answers_visible: visible };
    case 6: return { quiz_answers_visible: visible };
  }
}

/** Parts the teacher presents like slides: nothing is assigned, so there is no release or SHOW ANSWER. */
export function isPresentationPart(activity: ActivityNumber): boolean {
  return activity === 2 || activity === 4 || activity === 5;
}

/** Lesson section shown under the full screen title: Hoạt động 2 → Luyện tập 2 belong to section 1, Hoạt động 3 to section 2. */
export const LESSON_SECTIONS = {
  1: '1. Đường thẳng song song với mặt phẳng',
  2: '2. Điều kiện và tính chất của đường thẳng song song với mặt phẳng',
} as const;
export function lessonSection(activity: ActivityNumber): string | null {
  if (activity === 5 || activity === 6) return LESSON_SECTIONS[2];
  if (activity === 2 || activity === 3 || activity === 4) return LESSON_SECTIONS[1];
  return null;
}

type CompletionTeam = { goal_completed_at?: string | null; practice_completed_at?: string | null; quiz_completed_at?: string | null };
/** Hoạt động 1, Luyện tập 2 and Luyện tập 3 publish SHOW ANSWER on their own once every team has submitted. */
export function allTeamsSubmitted(teams: readonly CompletionTeam[], activity: ActivityNumber): boolean {
  if (teams.length === 0 || (activity !== 1 && activity !== 3 && activity !== 6)) return false;
  return teams.every(team => Boolean(activity === 1 ? team.goal_completed_at : activity === 3 ? team.practice_completed_at : team.quiz_completed_at));
}
