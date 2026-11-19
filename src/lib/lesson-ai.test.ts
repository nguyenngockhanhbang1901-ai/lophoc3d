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
  it('sends the short Grade 11 prompt for the box question', () => {
    expect(LESSON_AI_PROMPT).toBe('Là một học sinh lớp 11, bạn hãy giải cho tôi bài tập sau: Cho hình hộp chữ nhật ABCD.A’B’C’D’. Hỏi A’C’ có song song với (ABCD) không?');
  });
  it('names the real cause of a rejected key instead of one generic message', () => {
    const body = (reason: string, status: string, message = '') => ({ error: { code: 400, status, message, details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] } });
    expect(geminiErrorMessage(400, body('API_KEY_INVALID', 'INVALID_ARGUMENT'))).toContain('không đúng (Google: API_KEY_INVALID)');
    expect(geminiErrorMessage(403, body('API_KEY_HTTP_REFERRER_BLOCKED', 'PERMISSION_DENIED'))).toContain('bỏ giới hạn trang web');
    expect(geminiErrorMessage(403, body('SERVICE_DISABLED', 'PERMISSION_DENIED'))).toContain('chưa bật Gemini API');
    expect(geminiErrorMessage(400, { error: { status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' } })).toContain('vị trí của máy chủ');
    expect(geminiErrorMessage(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad key AIzaSyABCDEFGHIJKLMNOP' } })).not.toContain('AIzaSyABCDEFGHIJKLMNOP');
  });
});
