import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LinePairActivity } from './LinePairActivity';
vi.mock('./LinePairView', () => ({ default: () => <div /> }));
const base = { teacher: false, released: true, review: false, step: 0, answers: [], timings: [{ started_at: '2026-11-15T03:00:00Z', ended_at: null }], completed: false, closed: false, now: Date.parse('2026-11-15T03:00:01Z'), teams: [] };
describe('Bài 11 student question answers', () => {
  it.each([0, 1, 2, 3, 4, 5])('submits question %i through its own answer field', async step => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    await act(async () => { render(<LinePairActivity {...base} step={step} timings={Array.from({ length: 6 }, () => ({ started_at: '2026-11-15T03:00:00Z', ended_at: null }))} onSave={onSave} />); });
    const field = screen.getByRole('textbox', { name: `Câu trả lời câu ${step + 1}` });
    fireEvent.change(field, { target: { value: `Đáp án ${step + 1}` } });
    const block = field.parentElement;
    if (!block) throw new Error('Missing question answer block');
    await act(async () => { fireEvent.click(within(block).getByRole('button')); });
    expect(onSave).toHaveBeenCalledWith(step, `Đáp án ${step + 1}`);
  });
  it('keeps earlier submitted answers immutable', () => {
    render(<LinePairActivity {...base} step={1} answers={['Đã gửi']} onSave={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Câu trả lời câu 1' })).toBeDisabled();
  });
});