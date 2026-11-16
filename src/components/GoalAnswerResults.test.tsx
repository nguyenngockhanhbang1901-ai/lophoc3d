import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GoalAnswerResults } from './GoalAnswerResults';

vi.mock('./ActivityOne', () => ({
  GoalModelViewer: ({ highlightedMember, questionNumber }: { highlightedMember: string; questionNumber: number }) => <div data-testid="goal-model" data-member={highlightedMember} data-question={questionNumber} />,
}));

const teams = [
  { number: 2, goal_answers: ['Nằm trên', '', '', 'Một điểm', '', ''] },
  { number: 1, goal_answers: ['Nằm ngoài', 'Không có', '', '', '', ''] },
];

describe('Activity 1 answer review', () => {
  it('opens on question 1 with its model and every team answer without a teacher click', async () => {
    render(<GoalAnswerResults teams={teams} />);
    expect(screen.getByRole('heading', { name: 'Câu 1' })).toBeInTheDocument();
    expect((await screen.findByTestId('goal-model')).dataset['question']).toBe('1');
    expect(screen.getByText('Nằm ngoài')).toBeInTheDocument();
    expect(screen.getByText('Nằm trên')).toBeInTheDocument();
  });

  it('shows the chosen question, its highlighted bar and only that question\'s answers', async () => {
    render(<GoalAnswerResults teams={teams} />);
    expect(screen.getAllByRole('button', { name: /Câu \d/ })).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: /Câu 4/ }));
    const model = await screen.findByTestId('goal-model');
    expect(model.dataset['question']).toBe('4');
    expect(model.dataset['member']).toBe('Thanh chéo phải');
    expect(screen.getByText('Một điểm')).toBeInTheDocument();
    expect(screen.queryByText('Nằm ngoài')).not.toBeInTheDocument();
  });

  it('after question 6, Enter shows the summary question, then its answer, then moves to Activity 2', () => {
    const onFinish = vi.fn();
    render(<GoalAnswerResults teams={teams} onFinish={onFinish} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Câu 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Câu 6/ }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText(/có thể có bao nhiêu điểm chung/)).toBeInTheDocument();
    expect(screen.getByText(/có một, không có hoặc vô số/)).toHaveAttribute('data-reveal', 'hidden');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText(/có một, không có hoặc vô số/)).toHaveAttribute('data-reveal', 'shown');
    expect(onFinish).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
