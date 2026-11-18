import { describe, expect, it } from 'vitest';
import { getGoalSteelMembers } from './goal-model';
import { canAdvanceGoal, GOAL_QUESTIONS } from './goal-questions';

describe('Activity 1 guided questions', () => {
  it('keeps both crossbar prompts as separate steps and follows the requested member sequence', () => {
    expect(GOAL_QUESTIONS).toHaveLength(6);
    expect(GOAL_QUESTIONS.map(({ member }) => member)).toEqual([
      'Xà ngang',
      'Xà ngang',
      'Cột phải',
      'Thanh chéo phải',
      'Thanh đáy phải',
      'Thanh đáy phải',
    ]);
  });

  it('only highlights steel members that exist in the model', () => {
    const names = new Set(getGoalSteelMembers().map(({ name }) => name));
    expect(GOAL_QUESTIONS.every(({ member }) => names.has(member))).toBe(true);
  });

  it('offers exactly Nằm trong and Không nằm trong for questions 1 and 5 only', () => {
    expect(GOAL_QUESTIONS[0]?.options).toEqual(['Nằm trong', 'Không nằm trong']);
    expect(GOAL_QUESTIONS[4]?.options).toEqual(['Nằm trong', 'Không nằm trong']);
    expect(GOAL_QUESTIONS.filter(question => question.options)).toHaveLength(2);
  });

  it('requires a non-empty answer before moving on', () => {
    expect(canAdvanceGoal('   ')).toBe(false);
    expect(canAdvanceGoal('Không có điểm chung')).toBe(true);
  });
});
