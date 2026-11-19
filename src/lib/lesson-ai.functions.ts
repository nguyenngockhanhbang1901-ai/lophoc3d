import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { geminiAnswer, geminiErrorMessage, lessonAiInput, LESSON_AI_MODEL } from './lesson-ai';

/** The teacher key is used for this request only: never persisted, returned or logged. */
export const solveLessonQuestion = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lessonAiInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${LESSON_AI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': data.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Bạn là giáo viên toán THPT. Giải bằng tiếng Việt, đúng hình học, nêu rõ từng điều kiện của định lý và kết luận. Dùng văn bản thuần, không tiêu đề Markdown. Các công thức TeX đặt giữa một cặp dấu $. Dùng \\ss cho ký hiệu song song. Không bỏ qua điều kiện đường thẳng không nằm trong mặt phẳng. Không dùng $$ hoặc \\( \\).' }] },
          contents: [{ role: 'user', parts: [{ text: data.prompt }] }],
        }),
      });
      if (!response.ok) return { answer: '', error: geminiErrorMessage(response.status, await response.json().catch(() => null)) };
      const answer = geminiAnswer(await response.json());
      return answer ? { answer, error: '' } : { answer: '', error: 'Gemini không trả về bài giải. Hãy kiểm tra lệnh và thử lại.' };
    } catch {
      return { answer: '', error: 'Không nhận được phản hồi Gemini. Yêu cầu có thể đã được tính phí; hãy kiểm tra trước khi gửi lại.' };
    }
  });