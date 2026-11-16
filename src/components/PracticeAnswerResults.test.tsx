import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRACTICE_SETS } from '@/lib/practice-questions';
import { PracticeAnswerResults } from './PracticeAnswerResults';

const teams = [
  { number: 2, answers: ["(ADD'A'), (BCC'B')", '', ''], timings: [{ started_at: 'x', ended_at: 'y' }, { started_at: 'y', ended_at: 'z' }] },
  { number: 1, answers: ["mặt (ADD'A')", "(ABCD) và (ABB'A')", "Có, A'B'"] },
];
const highlighted = (container: HTMLElement) => container.querySelector('[data-highlight]')?.getAttribute('data-highlight');

describe('Luyện tập 2 answer review', () => {
  it('opens on question a (AB cắt) with AB highlighted and every team answer', () => {
    const { container } = render(<PracticeAnswerResults teams={teams} />);
    expect(screen.getByRole('heading', { name: 'Câu a)' })).toBeInTheDocument();
    expect(screen.getByText('Đường thẳng AB cắt những mặt phẳng nào?')).toBeInTheDocument();
    expect(highlighted(container)).toBe('AB');
    expect(screen.getByText("(ADD'A'), (BCC'B')")).toBeInTheDocument();
    expect(screen.getByText("mặt (ADD'A')")).toBeInTheDocument();
  });
  it('Enter moves a → b (AB nằm trong) and marks timed-out teams', () => {
    render(<PracticeAnswerResults teams={teams} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Câu b)' })).toBeInTheDocument();
    expect(screen.getByText('Đường thẳng AB nằm trong những mặt phẳng nào?')).toBeInTheDocument();
    expect(screen.getByText('Hết giờ · Chưa trả lời')).toBeInTheDocument();
  });
  it('question c highlights the face (ABCD)', () => {
    const { container } = render(<PracticeAnswerResults teams={teams} />);
    fireEvent.click(screen.getByRole('button', { name: /Câu c/ }));
    expect(screen.getByText('Kể tên những đường thẳng song song với mặt phẳng (ABCD)')).toBeInTheDocument();
    expect(highlighted(container)).toBe('(ABCD)');
  });
  it('the concise symbolic correct answer stays hidden until the teacher reveals it', () => {
    const { container } = render(<PracticeAnswerResults teams={teams} />);
    expect([...container.querySelectorAll('[data-source]')].map(node => node.getAttribute('data-source'))).not.toContain("$AB \\cap (ADD'A') = A,\\ AB \\cap (BCC'B') = B$");
    fireEvent.click(screen.getByRole('button', { name: /Hiện đáp án đúng/ }));
    expect([...container.querySelectorAll('[data-source]')].map(node => node.getAttribute('data-source'))).toContain("$AB \\cap (ADD'A') = A,\\ AB \\cap (BCC'B') = B$");
  });
  it('hides the revealed answer when moving to another question', () => {
    const { container } = render(<PracticeAnswerResults teams={teams} />);
    fireEvent.click(screen.getByRole('button', { name: /Hiện đáp án đúng/ }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Câu b)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hiện đáp án đúng/ })).toBeInTheDocument();
    expect([...container.querySelectorAll('[data-source]')].map(node => node.getAttribute('data-source'))).not.toContain("$AB \\cap (ADD'A') = A,\\ AB \\cap (BCC'B') = B$");
  });
});

describe('Hoạt động 3 and Luyện tập 1 review', () => {
  it('Hoạt động 3 shows the parallel-to-AB question beside Luyện tập 2 symbols; untimed teams are never "hết giờ"', () => {
    render(<PracticeAnswerResults set={PRACTICE_SETS[5]} teams={[{ number: 1, answers: [''] }]} />);
    expect(screen.getByText('Hãy kể tên các đường thẳng song song với đường thẳng AB?')).toBeInTheDocument();
    expect([...document.querySelectorAll('[data-source]')].map(el => el.getAttribute('data-source'))).toContain("$AB \\cap (ADD'A') = A$");
    expect(screen.getByText('Chưa có câu trả lời')).toBeInTheDocument();
  });
  it('Luyện tập 1 shows the photo above its single question', () => {
    render(<PracticeAnswerResults set={PRACTICE_SETS[4]} teams={[{ number: 1, answers: ['Mép biển tên trường'] }]} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByText('Xem mặt sân khấu (phần nền lát gạch) trong bức ảnh là một phần của mặt phẳng (P). Hãy chỉ ra một đường thẳng trong bức ảnh song song với mặt phẳng (P).')).toBeInTheDocument();
    expect(screen.getByText('Mép biển tên trường')).toBeInTheDocument();
  });
});
