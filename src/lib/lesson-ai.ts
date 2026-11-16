import { z } from 'zod';

export const LESSON_AI_MODEL = 'gemini-3.5-flash-lite';
export const LESSON_AI_PROMPT = 'Cho hình hộp chữ nhật ABCD.A’B’C’D’. Áp dụng định lý: nếu đường thẳng a không nằm trong mặt phẳng (P) và song song với một đường thẳng b nằm trong (P) thì a song song với (P). Hỏi A’C’ có song song với (ABCD) không? Trình bày lời giải đủ các điều kiện của định lý.';
export const lessonAiInput = z.object({
  apiKey: z.string().trim().min(1, 'Hãy nhập API key Gemini.').max(256),
  prompt: z.string().trim().min(1, 'Hãy nhập lệnh gửi AI.').max(6000, 'Lệnh quá dài (tối đa 6000 ký tự).'),
});

export function geminiErrorMessage(status: number) {
  if (status === 400 || status === 401 || status === 403) return 'Khóa Gemini chưa hợp lệ hoặc chưa được cấp quyền. Hãy kiểm tra khóa của bạn.';
  if (status === 404) return 'Gemini 3.5 Flash-Lite chưa khả dụng với khóa này. Không tự động đổi sang phiên bản khác.';
  if (status === 429) return 'Gemini đã hết hạn mức hoặc đang giới hạn lượt gửi. Hãy thử lại sau.';
  return 'Gemini chưa trả lời được. Hãy thử lại sau; yêu cầu trước có thể đã được tính phí.';
}

export function geminiAnswer(payload: unknown): string {
  const parsed = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional() })).optional() }).safeParse(payload);
  if (!parsed.success) return '';
  return parsed.data.candidates?.[0]?.content?.parts.filter(part => !part.thought).map(part => part.text ?? '').join('\n').trim() ?? '';
}