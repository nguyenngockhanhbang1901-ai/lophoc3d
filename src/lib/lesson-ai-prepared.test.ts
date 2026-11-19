import { describe, expect, it } from 'vitest';
import { fallbackAnswer } from './lesson-ai';

describe('Đáp án chuẩn bị sẵn', () => {
  it('is shown instead of the class’s last Gemini solution', () => {
    expect(fallbackAnswer('Đáp án chuẩn bị', 'Lời giải cũ')).toBe('Đáp án chuẩn bị');
  });
  it('falls back to the saved Gemini solution when nothing is prepared', () => {
    expect(fallbackAnswer('   ', 'Lời giải cũ')).toBe('Lời giải cũ');
    expect(fallbackAnswer(null, 'Lời giải cũ')).toBe('Lời giải cũ');
  });
  it('is empty when neither exists, so the usual error appears', () => {
    expect(fallbackAnswer(undefined, '')).toBe('');
  });
});
