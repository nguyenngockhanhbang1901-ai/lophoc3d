import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACTIVITY3_FOLLOW_UPS as Q, ACTIVITY3_STAGES, ACTIVITY3_SYMBOL_ANSWERS as A, GENERAL_RULE, PROOF_LINES } from '@/lib/activity3-walkthrough';
import { ActivityThreeReview } from './ActivityThreeReview';

const enter = (times = 1) => { for (let i = 0; i < times; i++) fireEvent.keyDown(window, { key: 'Enter' }); };
const shown = (container: HTMLElement, source: string) => [...container.querySelectorAll('[data-source]')].some(el => el.getAttribute('data-source') === source && !el.closest('[data-reveal="hidden"]'));
const revealedItems = () => screen.queryAllByRole('listitem').filter(el => el.getAttribute('data-reveal') !== 'hidden');
const proofAt = ACTIVITY3_STAGES.findIndex(s => s.kind === 'proof');

describe('Hoạt động 3 teacher walkthrough', () => {
  it('starts with the parallel-to-AB question and Luyện tập 2 symbols, with no team answers', () => {
    const { container } = render(<ActivityThreeReview />);
    expect(shown(container, Q.parallelToAB)).toBe(true);
    expect(screen.queryByText(/Tổ 1/)).not.toBeInTheDocument();
    expect(shown(container, "$AB \\cap (ADD'A') = A$")).toBe(true);
  });
  it('Enter asks the "both parallel" question and adds question 1\'s answer beside a, b, c', () => {
    const { container } = render(<ActivityThreeReview />);
    enter();
    expect(shown(container, Q.bothParallel)).toBe(true);
    expect(shown(container, '$AB \\subset (ABCD)$')).toBe(true);
    expect(shown(container, "$A'B' \\ss AB$, $C'D' \\ss AB$, $CD \\ss AB$")).toBe(true);
  });
  it('the relation answer advances into the general rule without keeping earlier answers', () => {
    const { container } = render(<ActivityThreeReview />);
    enter(3);
    expect(shown(container, Q.relation)).toBe(true);
    expect(shown(container, A.relation)).toBe(true);
    expect(shown(container, '$AB \\subset (ABCD)$')).toBe(false);
  });
  it('the general rule reveals its conclusion with the required exclusion condition', () => {
    const { container } = render(<ActivityThreeReview />);
    enter(4);
    expect(container.querySelector('.activity3-general .activity3-rule')?.getAttribute('data-source')).toBe(GENERAL_RULE);
    expect(GENERAL_RULE).toContain('\\left\\{');
    expect(GENERAL_RULE).toContain('a \\not\\subset (P)');
  });
  it('Backspace goes back one step', () => {
    const { container } = render(<ActivityThreeReview />);
    enter(2);
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(shown(container, Q.bothParallel)).toBe(true);
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(shown(container, Q.parallelToAB)).toBe(true);
  });
  it('then shows the picture with no proof lines, revealing one line per Enter', () => {
    render(<ActivityThreeReview />);
    enter(proofAt);
    expect(screen.getByRole('img', { name: /Mặt phẳng \(Q\)/ })).toBeInTheDocument();
    expect(revealedItems()).toHaveLength(0);
    // Every proof line is already in place (only invisible), so revealing one never moves the slide.
    expect(screen.getAllByRole('listitem', { hidden: true })).toHaveLength(PROOF_LINES.length);
    for (let i = 1; i <= PROOF_LINES.length; i++) { enter(); expect(revealedItems()).toHaveLength(i); }
  });
  it('after the proof and conclusion, two box questions follow, each answered on the next Enter', () => {
    const { container } = render(<ActivityThreeReview />);
    enter(proofAt + PROOF_LINES.length + 1);
    expect(ACTIVITY3_STAGES[proofAt + PROOF_LINES.length + 1]?.kind).toBe('conclusion');
    enter();
    const pairs = [[Q.cdParallel, A.cdParallel], [Q.condition, A.condition]] as const;
    for (const [question, answer] of pairs) {
      expect(shown(container, question)).toBe(true);
      expect(shown(container, answer)).toBe(false);
      expect(screen.getByRole('img', { name: /hình hộp chữ nhật/ })).toBeInTheDocument();
      enter();
      expect(shown(container, question)).toBe(true);
      expect(shown(container, answer)).toBe(true);
      enter();
    }
    expect(ACTIVITY3_STAGES.length).toBe(proofAt + PROOF_LINES.length + 2 + 4 + 2);
    expect(ACTIVITY3_STAGES.at(-1)?.kind).toBe('application');
    expect(container.querySelector('[data-edge="A\'C\'"]')).not.toBeNull();
    expect(container.querySelector('[data-edge="AC"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Bước tiếp theo' })).not.toBeDisabled();
    enter();
    expect(container.querySelector('[data-edge="A\'C\'"]')).not.toBeNull();
    expect(container.querySelector('[data-edge="AC"]')).not.toBeNull();
    expect(shown(container, Q.application)).toBe(true);
    expect(screen.getByRole('img', { name: /hình hộp chữ nhật/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Mặt phẳng \(Q\)/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll('.activity3-conclusion')).toHaveLength(1);
    expect(container.querySelector('.activity3-rule')).toBeNull();
    expect(shown(container, Q.cdParallel)).toBe(false);
    expect(shown(container, Q.condition)).toBe(false);
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(container.querySelector('[data-edge="AC"]')).toBeNull();
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(shown(container, Q.condition)).toBe(true);
    expect(shown(container, A.condition)).toBe(true);
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(shown(container, A.condition)).toBe(false);
  });
  it('writes parallel as "//", never ∥', () => {
    const all = JSON.stringify(ACTIVITY3_STAGES) + PROOF_LINES.flat().join(' ') + JSON.stringify(Q) + JSON.stringify(A);
    expect(all).not.toContain('∥');
    expect(all).not.toContain('\\parallel');
  });
});
