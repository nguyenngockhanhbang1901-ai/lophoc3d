import { z } from 'zod';

export const LESSON_AI_MODEL = 'gemini-3.5-flash-lite';
export const LESSON_AI_PROMPT = 'Là một học sinh lớp 11, bạn hãy giải cho tôi bài tập sau: Cho hình hộp chữ nhật ABCD.A’B’C’D’. Hỏi A’C’ có song song với (ABCD) không?';
export const lessonAiInput = z.object({
  apiKey: z.string().trim().min(1, 'Hãy nhập API key Gemini.').max(256),
  prompt: z.string().trim().min(1, 'Hãy nhập lệnh gửi AI.').max(6000, 'Lệnh quá dài (tối đa 6000 ký tự).'),
});

const geminiError = z.object({ error: z.object({ status: z.string().optional(), message: z.string().optional(), details: z.array(z.object({ reason: z.string().optional() }).passthrough()).optional() }) });

const LOCATION_BLOCKED = /location is not supported/i;
/** True when Google refuses the request because of where it was sent from (not because of the key). */
export function isLocationBlocked(body: unknown) { return LOCATION_BLOCKED.test(geminiErrorReason(body).message); }

/** Google's own error reason (e.g. API_KEY_INVALID), read from the error body; never contains the key. */
export function geminiErrorReason(body: unknown): { reason: string; status: string; message: string } {
  const parsed = geminiError.safeParse(body);
  if (!parsed.success) return { reason: '', status: '', message: '' };
  const { status = '', message = '', details = [] } = parsed.data.error;
  return { reason: details.find(d => d.reason)?.reason ?? '', status, message };
}

/** Teacher-facing Vietnamese message for a failed Gemini call; names Google's reason code so the cause is clear. */
export function geminiErrorMessage(httpStatus: number, body?: unknown) {
  const { reason, status, message } = geminiErrorReason(body);
  const code = reason || status;
  const tag = code ? ` (Google: ${code})` : ` (Google: HTTP ${httpStatus})`;
  if (reason === 'API_KEY_INVALID') return `Google báo khóa Gemini không đúng${tag}. Hãy sao chép lại toàn bộ khóa từ Google AI Studio (bắt đầu bằng AIza), không kèm dấu cách hay dấu ngoặc, rồi gửi lại.`;
  if (/^API_KEY_.*_BLOCKED$/.test(reason)) return `Khóa Gemini đang bị giới hạn chỉ cho một số trang web hoặc địa chỉ${tag}. Yêu cầu được gửi từ máy chủ của trang này, nên hãy bỏ giới hạn trang web của khóa trong Google Cloud, hoặc tạo một khóa mới trong Google AI Studio.`;
  if (reason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(message)) return `Dự án Google của khóa này chưa bật Gemini API${tag}. Hãy tạo khóa trong Google AI Studio hoặc bật "Generative Language API" cho dự án.`;
  if (LOCATION_BLOCKED.test(message)) return `Google chưa cho dùng Gemini API từ nơi gửi yêu cầu${tag}. Khóa của bạn có thể vẫn đúng; hãy thử lại từ mạng khác.`;
  if (httpStatus === 404 || status === 'NOT_FOUND') return `Gemini 3.5 Flash-Lite chưa khả dụng với khóa này${tag}. Không tự động đổi sang phiên bản khác.`;
  if (httpStatus === 429 || status === 'RESOURCE_EXHAUSTED') return `Gemini đã hết hạn mức hoặc đang giới hạn lượt gửi${tag}. Hãy thử lại sau.`;
  if (httpStatus === 401 || httpStatus === 403) return `Google từ chối khóa Gemini này${tag}. Hãy kiểm tra khóa trong Google AI Studio.`;
  if (httpStatus === 400) return `Gemini từ chối yêu cầu${tag}${message ? `: ${message.replace(/AIza[\w-]{10,}/g, '…').slice(0, 200)}` : ''}.`;
  return `Gemini chưa trả lời được${tag}. Hãy thử lại sau; yêu cầu trước có thể đã được tính phí.`;
}

export function geminiAnswer(payload: unknown): string {
  const parsed = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional() })).optional() }).safeParse(payload);
  if (!parsed.success) return '';
  return parsed.data.candidates?.[0]?.content?.parts.filter(part => !part.thought).map(part => part.text ?? '').join('\n').trim() ?? '';
}
export const LESSON_AI_SYSTEM = 'Bạn là giáo viên toán THPT. Giải bằng tiếng Việt, đúng hình học, nêu rõ từng điều kiện của định lý và kết luận. Dùng văn bản thuần, không tiêu đề Markdown. Các công thức TeX đặt giữa một cặp dấu $. Dùng \\ss cho ký hiệu song song. Không bỏ qua điều kiện đường thẳng không nằm trong mặt phẳng. Không dùng $$ hoặc \\( \\).';
export type LessonAiResult = { answer: string; error: string; locationBlocked?: boolean };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** One Gemini call with the teacher's key; shared by the server relay and the browser fallback so both behave identically. */
export async function requestLessonAi(apiKey: string, prompt: string, fetcher: Fetcher = (url, init) => fetch(url, init)): Promise<LessonAiResult> {
  try {
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${LESSON_AI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: LESSON_AI_SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) { const body: unknown = await response.json().catch(() => null); return { answer: '', error: geminiErrorMessage(response.status, body), locationBlocked: isLocationBlocked(body) }; }
    const answer = geminiAnswer(await response.json());
    return answer ? { answer, error: '' } : { answer: '', error: 'Gemini không trả về bài giải. Hãy kiểm tra lệnh và thử lại.' };
  } catch {
    return { answer: '', error: 'Không nhận được phản hồi Gemini. Yêu cầu có thể đã được tính phí; hãy kiểm tra trước khi gửi lại.' };
  }
}

/** Server relay first; only when Google refuses the server's location, the teacher's own browser sends the same request once. */
export async function solveWithFallback(viaServer: () => Promise<LessonAiResult>, direct: () => Promise<LessonAiResult>): Promise<LessonAiResult> {
  const first = await viaServer();
  return first.locationBlocked ? direct() : first;
}
