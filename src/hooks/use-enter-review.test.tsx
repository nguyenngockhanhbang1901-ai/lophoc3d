import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PresentationNavigation, adjacentLessonPart } from '@/lib/presentation-navigation';
import { useEnterReview } from './use-enter-review';
import { SlideArrows } from '@/components/SlideArrows';

function Slides() {
  const { selected } = useEnterReview(3);
  return <output aria-label="step">{selected}</output>;
}
describe('Adjacent lesson presentation navigation', () => {
  it('uses Activity 1 → Activity 2 → Practice 1 → Practice 2 → Activity 3 → Practice 3 order', () => {
    expect([1, 2, 4, 3, 5, 6].map(part => adjacentLessonPart(part as 1 | 2 | 4 | 3 | 5 | 6, 1))).toEqual([2, 4, 3, 5, 6, undefined]);
    expect([1, 2, 4, 3, 5, 6].map(part => adjacentLessonPart(part as 1 | 2 | 4 | 3 | 5 | 6, -1))).toEqual([undefined, 1, 2, 4, 3, 5]);
  });
  it('one Enter at the final step advances to the adjacent part', () => {
    const onFinish = vi.fn();
    render(<PresentationNavigation.Provider value={{ onFinish, initialLast: true }}><Slides /></PresentationNavigation.Provider>);
    expect(screen.getByLabelText('step')).toHaveTextContent('2');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
  it('Backspace at the first step returns to the previous part', () => {
    const onBack = vi.fn();
    render(<PresentationNavigation.Provider value={{ onBack }}><Slides /></PresentationNavigation.Provider>);
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it('typing in an input does not change slides', () => {
    const onBack = vi.fn();
    render(<PresentationNavigation.Provider value={{ onBack }}><Slides /><input aria-label="prompt" /></PresentationNavigation.Provider>);
    fireEvent.keyDown(screen.getByLabelText('prompt'), { key: 'Backspace' });
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText('step')).toHaveTextContent('0');
  });
  it('follows a teacher-controlled step without allowing viewer navigation', () => {
    const onStep = vi.fn();
    const { rerender } = render(<PresentationNavigation.Provider value={{ controlledStep: 1, readOnly: true, onStep }}><Slides /></PresentationNavigation.Provider>);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByLabelText('step')).toHaveTextContent('1');
    expect(onStep).not.toHaveBeenCalled();
    rerender(<PresentationNavigation.Provider value={{ controlledStep: 2, readOnly: true }}><Slides /></PresentationNavigation.Provider>);
    expect(screen.getByLabelText('step')).toHaveTextContent('2');
  });
});
describe('Arrow keys and on-screen arrows', () => {
  it('→ advances exactly like Enter and ← goes back exactly like Backspace', () => {
    render(<Slides />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByLabelText('step')).toHaveTextContent('1');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByLabelText('step')).toHaveTextContent('2');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByLabelText('step')).toHaveTextContent('1');
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByLabelText('step')).toHaveTextContent('0');
  });
  it('→ at the final step finishes the part, like Enter', () => {
    const onFinish = vi.fn();
    render(<PresentationNavigation.Provider value={{ onFinish, initialLast: true }}><Slides /></PresentationNavigation.Provider>);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
  it('← at the first step returns to the previous part, like Backspace', () => {
    const onBack = vi.fn();
    render(<PresentationNavigation.Provider value={{ onBack }}><Slides /></PresentationNavigation.Provider>);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it('the on-screen arrow buttons step forward and back', () => {
    render(<><SlideArrows /><Slides /></>);
    fireEvent.click(screen.getByLabelText('Bước tiếp theo'));
    expect(screen.getByLabelText('step')).toHaveTextContent('1');
    fireEvent.click(screen.getByLabelText('Bước trước'));
    expect(screen.getByLabelText('step')).toHaveTextContent('0');
  });
});
