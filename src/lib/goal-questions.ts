export const GOAL_POSITION_OPTIONS = ['Nằm trong', 'Không nằm trong'] as const;

export type GoalQuestion = {
  prompt: string;
  member: 'Xà ngang' | 'Cột phải' | 'Thanh chéo phải' | 'Thanh đáy phải';
  placeholder: string;
  options?: typeof GOAL_POSITION_OPTIONS;
};

/** The two requests labelled “Câu 1” in the brief are separate steps, giving six questions. */
export const GOAL_QUESTIONS: readonly GoalQuestion[] = [
  {
    prompt: 'Quan sát thanh đang phát sáng, em hãy cho biết thanh này nằm ở đâu so với mặt sân?',
    member: 'Xà ngang',
    placeholder: 'Nêu vị trí của xà ngang so với mặt sân…',
    options: GOAL_POSITION_OPTIONS,
  },
  {
    prompt: 'Có bao nhiêu điểm chung giữa xà ngang phía trên và mặt đất?',
    member: 'Xà ngang',
    placeholder: 'Nhập số điểm chung(bằng số hoặc bằng chữ).',
  },
  {
    prompt: 'Cột dọc thẳng đứng và mặt đất có bao nhiêu điểm chung?',
    member: 'Cột phải',
    placeholder: 'Nhập số điểm chung(bằng số hoặc bằng chữ).',
  },
  {
    prompt: 'Thanh chống nằm xiên và mặt đất có bao nhiêu điểm chung?',
    member: 'Thanh chéo phải',
    placeholder: 'Nhập số điểm chung(bằng số hoặc bằng chữ).',
  },
  {
    prompt: 'Quan sát thanh đang phát sáng, em hãy cho biết thanh này nằm ở đâu so với mặt sân?',
    member: 'Thanh đáy phải',
    placeholder: 'Nêu vị trí của thanh đang phát sáng so với mặt sân…',
    options: GOAL_POSITION_OPTIONS,
  },
  {
    prompt: 'Theo em, giữa thanh đang phát sáng và mặt sân có bao nhiêu điểm chung?',
    member: 'Thanh đáy phải',
    placeholder: 'Nhập số điểm chung(bằng số hoặc bằng chữ).',
  },
];

export function canAdvanceGoal(answer: string) {
  return answer.trim().length > 0;
}
