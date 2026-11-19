import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_TIMEOUT_ERROR, revealChunks, solveWithSaved, type LessonAiResult } from './lesson-ai';

const later = (ms: number, result: LessonAiResult, aborted?: { value: boolean }) => (signal: AbortSignal) => new Promise<LessonAiResult>(resolve => {
  const timer = setTimeout(() => resolve(result), ms);
  signal.addEventListener('abort', () => { if (aborted) aborted.value = true; clearTimeout(timer); });
});
const ok = { answer: 'Lời giải mới', error: '' };
const failed = { answer: '', error: 'Google báo lỗi' };

describe('Gửi AI with a saved solution', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  async function run(ask: (s: AbortSignal) => Promise<LessonAiResult>, saved: string, ms: number) {
    let done: Awaited<ReturnType<typeof solveWithSaved>> | null = null;
    void solveWithSaved(ask, async () => saved).then(r => { done = r; });
    await vi.advanceTimersByTimeAsync(ms);
    return done as Awaited<ReturnType<typeof solveWithSaved>> | null;
  }
  it('shows a fresh Gemini answer even when one is saved', async () => {
    expect(await run(later(3000, ok), 'Lời giải cũ', 3000)).toEqual({ answer: 'Lời giải mới', error: '', source: 'ai' });
  });
  it('shows the saved solution without an error when Gemini fails', async () => {
    expect(await run(later(500, failed), 'Lời giải cũ', 500)).toEqual({ answer: 'Lời giải cũ', error: '', source: 'saved' });
  });
  it('cancels Gemini after 6 seconds and shows the saved solution', async () => {
    const aborted = { value: false };
    expect(await run(later(9000, ok, aborted), 'Lời giải cũ', 5999)).toBeNull();
    expect(await run(later(9000, ok, aborted), 'Lời giải cũ', 6000)).toEqual({ answer: 'Lời giải cũ', error: '', source: 'saved' });
    expect(aborted.value).toBe(true);
  });
  it('without a saved solution waits up to 10 seconds for Gemini', async () => {
    expect(await run(later(9000, ok), '', 9000)).toEqual({ answer: 'Lời giải mới', error: '', source: 'ai' });
  });
  it('without a saved solution shows the Gemini error', async () => {
    expect(await run(later(500, failed), '', 500)).toEqual({ answer: '', error: 'Google báo lỗi', source: 'none' });
  });
  it('without a saved solution cancels after 10 seconds with a timeout error', async () => {
    const aborted = { value: false };
    expect(await run(later(20000, ok, aborted), '', 10000)).toEqual({ answer: '', error: AI_TIMEOUT_ERROR, source: 'none' });
    expect(aborted.value).toBe(true);
  });
});

describe('gradual reveal of a solution', () => {
  it('splits into lines but never inside a formula', () => {
    expect(revealChunks('Ta có $A\'C\' \\ss AC$\nVậy $a\nb$ xong')).toEqual(["Ta có $A'C' \\ss AC$", 'Vậy $a\nb$ xong']);
  });
});
