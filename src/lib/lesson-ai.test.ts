import { describe, expect, it } from 'vitest';
import { geminiAnswer, geminiErrorMessage, lessonAiInput, LESSON_AI_MODEL, LESSON_AI_PROMPT } from './lesson-ai';

describe('Gemini lesson solver', () => {
  it('keeps the requested model without a fallback', () => {
    expect(LESSON_AI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(geminiErrorMessage(404)).toContain('Không tự động đổi');
  });
  it('rejects empty credentials and empty prompts', () => {
    expect(lessonAiInput.safeParse({ apiKey: '', prompt: LESSON_AI_PROMPT }).success).toBe(false);
    expect(lessonAiInput.safeParse({ apiKey: 'test', prompt: ' ' }).success).toBe(false);
  });
  it('returns only the actual answer, not private thinking', () => {
    expect(geminiAnswer({ candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: 'Lời giải' }] } }] })).toBe('Lời giải');
    expect(geminiAnswer({ candidates: [] })).toBe('');
  });
});