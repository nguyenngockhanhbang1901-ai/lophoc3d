// AI drafts for the homeroom teacher (đợt 3): term comments, a student's progress analysis, the
// class's monthly summary and the homeroom work report. Requests use the teacher's own Gemini key
// (the same key as the lesson AI, kept only in this browser when the teacher saves it). Prompts
// never carry names, ethnicity, care or private notes: students are "em" or a code (HS01…), and
// codes are mapped back to names only in the teacher's browser. AI output is always a draft the
// teacher edits; nothing is saved automatically.
import { z } from "zod";
import {
  geminiAnswer,
  geminiErrorMessage,
  isLocationBlocked,
  LESSON_AI_MODEL,
} from "@/lib/lesson-ai";

export type AiTask = "comment" | "progress" | "month" | "term";

const RULES =
  "Viết tiếng Việt chuẩn, giọng giáo viên chủ nhiệm THPT, khách quan, tôn trọng học sinh. " +
  "Chỉ dựa vào dữ liệu được cung cấp, không bịa thêm sự việc hay con số. " +
  "Văn bản thuần, không dùng Markdown (không **, không #). ";

export const AI_SYSTEM: Record<AiTask, string> = {
  comment:
    RULES +
    "Nhiệm vụ: viết nhận xét học bạ cho một học sinh theo Thông tư 22 (phẩm chất, năng lực, sự tiến bộ, ưu điểm nổi bật, hạn chế cần khắc phục). " +
    "Gọi học sinh là 'Em'. Viết 2–4 câu liền mạch, tối đa 450 ký tự, không gạch đầu dòng, không nêu điểm số cụ thể.",
  progress:
    RULES +
    "Nhiệm vụ: phân tích sự tiến bộ của một học sinh giữa hai kỳ. Gọi học sinh là 'em'. " +
    "Trả lời đúng 3 phần, mỗi phần bắt đầu bằng tiêu đề trên một dòng riêng: 'Tiến bộ:', 'Cần lưu ý:', 'Gợi ý hỗ trợ:'; " +
    "mỗi phần 1–3 ý ngắn bắt đầu bằng '- '. Nếu kết quả giảm sút rõ (điểm giảm, vắng tăng, vi phạm tăng) thì nói thẳng ở phần Cần lưu ý.",
  month:
    RULES +
    "Nhiệm vụ: tổng hợp tình hình lớp trong tháng để giáo viên chủ nhiệm báo cáo. Học sinh được gọi bằng mã HSxx, giữ nguyên mã. " +
    "Các phần, mỗi phần một tiêu đề trên dòng riêng: 'Chuyên cần:', 'Học tập:', 'Nề nếp:', 'Nổi bật:', 'Cần quan tâm:', 'Đề xuất tháng tới:'; " +
    "mỗi phần 1–3 câu hoặc ý '- '. Tối đa khoảng 250 từ.",
  term:
    RULES +
    "Nhiệm vụ: soạn bản nháp báo cáo tổng kết công tác chủ nhiệm. Học sinh được gọi bằng mã HSxx nếu cần nêu. " +
    "Các mục đánh số: '1. Tình hình chung', '2. Kết quả học tập', '3. Kết quả rèn luyện', '4. Chuyên cần, nề nếp', " +
    "'5. Phối hợp với phụ huynh', '6. Ưu điểm', '7. Tồn tại, hạn chế', '8. Phương hướng'. Mỗi mục 2–4 câu, dùng số liệu được cho. Tối đa khoảng 500 từ.",
};

export const aiInput = z.object({
  apiKey: z.string().trim().min(1, "Hãy nhập API key Gemini.").max(256),
  task: z.enum(["comment", "progress", "month", "term"]),
  prompt: z.string().trim().min(1).max(12000),
});

export type AiResult = { text: string; error: string; locationBlocked?: boolean };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** One Gemini call; used by the server relay and, if Google refuses the server's location, by the browser. */
export async function requestHomeroomAi(
  apiKey: string,
  task: AiTask,
  prompt: string,
  fetcher: Fetcher = (url, init) => fetch(url, init),
): Promise<AiResult> {
  try {
    const response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${LESSON_AI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: AI_SYSTEM[task] }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: task === "comment" ? 0.8 : 0.5 },
        }),
      },
    );
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      return {
        text: "",
        error: geminiErrorMessage(response.status, body),
        locationBlocked: isLocationBlocked(body),
      };
    }
    const text = cleanAi(geminiAnswer(await response.json()));
    return text
      ? { text, error: "" }
      : { text: "", error: "Gemini không trả về nội dung. Hãy thử lại." };
  } catch {
    return {
      text: "",
      error: "Không nhận được phản hồi Gemini. Hãy kiểm tra kết nối rồi thử lại.",
    };
  }
}

/** Strip Markdown the model may still add. */
export function cleanAi(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- anonymous codes ----------

/** HS01, HS02… in class-list order; the map back to names stays in the browser. */
export function codesFor(ids: string[]): Map<string, string> {
  return new Map(ids.map((id, i) => [id, `HS${String(i + 1).padStart(2, "0")}`]));
}

/** Put names back where the AI wrote codes (HS07 → "HS07 Nguyễn Văn An" style: just the name). */
export function restoreNames(
  text: string,
  codes: Map<string, string>,
  names: Map<string, string>,
): string {
  const byCode = new Map([...codes].map(([id, code]) => [code, names.get(id) ?? code]));
  return text.replace(/\bHS\d{2}\b/g, (c) => byCode.get(c) ?? c);
}

// ---------- prompt builders (data only, no personal identifiers) ----------

export interface StudentFacts {
  period: string;
  subjects: { subject: string; value: string }[];
  studyLevel: string | null;
  conductLevel: string | null;
  attendance: { coPhep: number; khongPhep: number; diMuon: number };
  speak: number;
  good: Record<string, number>;
  bad: Record<string, number>;
  khen: string[];
  viPham: string[];
  weeks: string;
}

function factLines(f: StudentFacts): string[] {
  const kv = (o: Record<string, number>) =>
    Object.entries(o)
      .map(([k, n]) => `${k} ${n} lần`)
      .join(", ") || "không có";
  return [
    `Thời gian: ${f.period}`,
    `Điểm trung bình các môn: ${f.subjects.length ? f.subjects.map((s) => `${s.subject} ${s.value}`).join("; ") : "chưa có"}`,
    `Mức học tập: ${f.studyLevel ?? "chưa xếp"}; mức rèn luyện: ${f.conductLevel ?? "chưa xếp"}`,
    `Chuyên cần: nghỉ có phép ${f.attendance.coPhep}, nghỉ không phép ${f.attendance.khongPhep}, đi muộn ${f.attendance.diMuon} buổi`,
    `Phát biểu xây dựng bài: ${f.speak} lần`,
    `Ghi nhận tích cực: ${kv(f.good)}`,
    `Ghi nhận chưa tốt: ${kv(f.bad)}`,
    `Khen thưởng: ${f.khen.length ? f.khen.join("; ") : "không có"}`,
    `Vi phạm: ${f.viPham.length ? f.viPham.join("; ") : "không có"}`,
    `Thi đua tuần: ${f.weeks || "chưa có"}`,
  ];
}

export function commentPrompt(
  f: StudentFacts,
  tone: "dong_vien" | "trung_tinh",
  hint: string,
): string {
  return [
    "Dữ liệu của học sinh:",
    ...factLines(f),
    `Giọng văn: ${tone === "dong_vien" ? "động viên, khích lệ" : "trung tính, ngắn gọn"}.`,
    hint.trim() ? `Giáo viên lưu ý thêm: ${hint.trim().slice(0, 300)}` : "",
    "Hãy viết nhận xét.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function progressPrompt(now: StudentFacts, before: StudentFacts | null): string {
  return [
    "Kỳ này:",
    ...factLines(now),
    "",
    before ? "Kỳ trước:" : "Không có dữ liệu kỳ trước.",
    ...(before ? factLines(before) : []),
    "",
    "Hãy phân tích sự tiến bộ của em.",
  ].join("\n");
}

export interface ClassRow {
  code: string;
  coPhep: number;
  khongPhep: number;
  diMuon: number;
  speak: number;
  good: number;
  bad: number;
  khen: number;
  viPham: number;
  lowSubjects: string[];
}

export interface ClassFacts {
  className: string;
  period: string;
  size: number;
  sessions: number;
  rows: ClassRow[];
  previous: {
    absent: number;
    khongPhep: number;
    diMuon: number;
    viPham: number;
    khen: number;
    speak: number;
  } | null;
  extra: string[];
}

export function classPrompt(f: ClassFacts): string {
  const total = f.rows.reduce(
    (a, r) => ({
      absent: a.absent + r.coPhep + r.khongPhep,
      khongPhep: a.khongPhep + r.khongPhep,
      diMuon: a.diMuon + r.diMuon,
      viPham: a.viPham + r.viPham,
      khen: a.khen + r.khen,
      speak: a.speak + r.speak,
    }),
    { absent: 0, khongPhep: 0, diMuon: 0, viPham: 0, khen: 0, speak: 0 },
  );
  const notable = f.rows.filter(
    (r) =>
      r.coPhep + r.khongPhep + r.diMuon + r.good + r.bad + r.khen + r.viPham + r.speak > 0 ||
      r.lowSubjects.length,
  );
  return [
    `Lớp ${f.className}, sĩ số ${f.size}, ${f.period}, số buổi đã điểm danh ${f.sessions}.`,
    `Tổng: vắng ${total.absent} lượt (không phép ${total.khongPhep}), đi muộn ${total.diMuon}, phát biểu ${total.speak}, khen ${total.khen}, vi phạm ${total.viPham}.`,
    f.previous
      ? `Kỳ trước: vắng ${f.previous.absent} (không phép ${f.previous.khongPhep}), đi muộn ${f.previous.diMuon}, phát biểu ${f.previous.speak}, khen ${f.previous.khen}, vi phạm ${f.previous.viPham}.`
      : "",
    ...f.extra,
    "Chi tiết từng học sinh có ghi nhận (mã; vắng P/K; muộn; phát biểu; tích cực; chưa tốt; khen; vi phạm; môn dưới 5):",
    ...notable.map(
      (r) =>
        `${r.code}; ${r.coPhep}/${r.khongPhep}; ${r.diMuon}; ${r.speak}; ${r.good}; ${r.bad}; ${r.khen}; ${r.viPham}; ${r.lowSubjects.join(", ") || "-"}`,
    ),
    notable.length < f.rows.length ? `Các học sinh còn lại không có ghi nhận nào.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
