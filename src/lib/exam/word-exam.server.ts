// Exams made straight from a Word file: the questions go into a hidden bank (purpose
// word_exam, never listed in Ngân hàng đề) and the exam is a hidden matrix whose every slot is
// pinned to one of them, so drawing, timing, anti-cheat and grading are the matrix ones.
import { examDb } from "./db.server";
import { KIND_ORDER, matrixSlotsSchema, type MatrixSlot } from "./matrix";
import {
  questionBodySchema,
  questionGaps,
  type QuestionBody,
  type QuestionKind,
  type QuestionLevel,
} from "./questions";

export interface WordExamInput {
  title: string;
  sourceFile: string;
  questions: { level: QuestionLevel; body: QuestionBody }[];
  points: Record<QuestionKind, number>;
  shuffleOptions: boolean;
  shuffleOrder: boolean;
  shuffleStatements: boolean;
}

/** Every question must be complete before an exam can be made from it. */
export function wordExamProblems(questions: { body: unknown }[]): string[] {
  const problems: string[] = [];
  questions.forEach((q, i) => {
    const parsed = questionBodySchema.safeParse(q.body);
    if (!parsed.success) problems.push(`Câu ${i + 1}: nội dung không hợp lệ`);
    else for (const gap of questionGaps(parsed.data)) problems.push(`Câu ${i + 1}: ${gap}`);
  });
  if (!questions.length) problems.push("Đề chưa có câu nào");
  return problems;
}

/** Slots in exam order (Phần I, II, III; file order inside a part), each pinned to one question. */
export function pinnedSlots(
  bankId: string,
  questions: { id: string; kind: QuestionKind; level: QuestionLevel; position: number }[],
  points: Record<QuestionKind, number>,
): MatrixSlot[] {
  return KIND_ORDER.flatMap((kind) =>
    questions
      .filter((q) => q.kind === kind)
      .sort((a, b) => a.position - b.position)
      .map((q) => ({ bankId, kind, level: q.level, points: points[kind], questionId: q.id })),
  );
}

export async function createWordExam(ownerId: string, input: WordExamInput): Promise<string> {
  const problems = wordExamProblems(input.questions);
  if (problems.length)
    throw new Error(`Đề còn câu chưa hoàn chỉnh: ${problems.slice(0, 3).join("; ")}`);
  const db = examDb();
  const title = input.title.trim().slice(0, 150) || "Đề từ file Word";
  const now = new Date().toISOString();
  const { data: bank, error: bankError } = await db
    .from("exam_banks")
    .insert({
      owner_id: ownerId,
      title: title.slice(0, 150),
      topic: "",
      description: `Đề tạo từ file ${input.sourceFile}`.slice(0, 1000),
      purpose: "word_exam",
    })
    .select("id")
    .single();
  if (bankError || !bank) throw new Error("Không tạo được đề");
  const bankId = (bank as { id: string }).id;
  try {
    const rows = input.questions.map((q, i) => {
      const body = questionBodySchema.parse(q.body);
      return {
        owner_id: ownerId,
        bank_id: bankId,
        kind: body.data.kind,
        level: q.level,
        topic: "",
        body,
        position: i,
        updated_at: now,
      };
    });
    const saved: { id: string; kind: QuestionKind; level: QuestionLevel; position: number }[] = [];
    // pictures can make a request large: send in groups of 20
    for (let i = 0; i < rows.length; i += 20) {
      const { data, error } = await db
        .from("exam_questions")
        .insert(rows.slice(i, i + 20))
        .select("id,kind,level,position");
      if (error || !data) throw new Error("Không lưu được câu hỏi của đề");
      saved.push(...(data as typeof saved));
    }
    const slots = matrixSlotsSchema.parse(pinnedSlots(bankId, saved, input.points));
    const { data: matrix, error } = await db
      .from("exam_matrices")
      .insert({
        owner_id: ownerId,
        title,
        description: "",
        slots,
        shuffle_options: input.shuffleOptions,
        shuffle_order: input.shuffleOrder,
        shuffle_statements: input.shuffleStatements,
        purpose: "word_exam",
        source_file: input.sourceFile.slice(0, 200),
        source_bank_id: bankId,
      })
      .select("id")
      .single();
    if (error || !matrix) throw new Error("Không tạo được đề");
    return (matrix as { id: string }).id;
  } catch (e) {
    await db.from("exam_banks").delete().eq("id", bankId);
    throw e;
  }
}

interface WordExamRow {
  id: string;
  slots: unknown;
  source_bank_id: string | null;
  purpose: string;
}

async function ownWordExam(ownerId: string, id: string): Promise<WordExamRow> {
  const { data } = await examDb()
    .from("exam_matrices")
    .select("id,slots,source_bank_id,purpose")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data || (data as WordExamRow).purpose !== "word_exam")
    throw new Error("Không tìm thấy đề từ file Word");
  return data as WordExamRow;
}

/** Assignments using this exam, and whether any student has started one. */
async function usage(matrixId: string) {
  const db = examDb();
  const { data } = await db.from("exam_assignments").select("id").eq("matrix_id", matrixId);
  const ids = ((data ?? []) as { id: string }[]).map((a) => a.id);
  if (!ids.length) return { assignments: ids, started: false };
  const { count } = await db
    .from("exam_attempts")
    .select("id", { count: "exact", head: true })
    .in("assignment_id", ids);
  return { assignments: ids, started: (count ?? 0) > 0 };
}

export async function deleteWordExam(ownerId: string, id: string) {
  const exam = await ownWordExam(ownerId, id);
  const { assignments } = await usage(id);
  if (assignments.length)
    throw new Error("Đề đang được dùng ở bài giao; hãy xóa các bài giao đó trước");
  const db = examDb();
  await db.from("exam_matrices").delete().eq("id", id);
  if (exam.source_bank_id) await db.from("exam_banks").delete().eq("id", exam.source_bank_id);
  return { ok: true };
}

/** The exam's questions in exam order, for viewing and fixing. */
export async function wordExamQuestions(ownerId: string, id: string) {
  const exam = await ownWordExam(ownerId, id);
  const slots = matrixSlotsSchema.parse(exam.slots);
  const ids = slots.map((s) => s.questionId).filter((x): x is string => !!x);
  const { data } = ids.length
    ? await examDb()
        .from("exam_questions")
        .select("id,level,body")
        .eq("owner_id", ownerId)
        .in("id", ids)
    : { data: [] };
  const byId = new Map(
    ((data ?? []) as { id: string; level: QuestionLevel; body: QuestionBody }[]).map((q) => [
      q.id,
      q,
    ]),
  );
  const { started } = await usage(id);
  return {
    locked: started,
    questions: slots.map((s) => ({
      id: s.questionId ?? "",
      points: s.points,
      level: byId.get(s.questionId ?? "")?.level ?? s.level ?? "nb",
      body: byId.get(s.questionId ?? "")?.body ?? null,
    })),
  };
}

/**
 * Fix one question before anyone has taken the exam. A change of kind moves it to its part
 * and gives it that part's points; assignments not yet started follow the new slots.
 */
export async function updateWordExamQuestion(
  ownerId: string,
  id: string,
  questionId: string,
  level: QuestionLevel,
  rawBody: unknown,
) {
  const exam = await ownWordExam(ownerId, id);
  const body = questionBodySchema.parse(rawBody);
  const gaps = questionGaps(body);
  if (gaps.length) throw new Error(`Câu hỏi chưa hoàn chỉnh: ${gaps.join("; ")}`);
  const { assignments, started } = await usage(id);
  if (started) throw new Error("Đã có học sinh làm đề này nên không sửa câu hỏi được nữa");
  const db = examDb();
  const slots = matrixSlotsSchema.parse(exam.slots);
  const slot = slots.find((s) => s.questionId === questionId);
  if (!slot) throw new Error("Câu hỏi không thuộc đề này");
  const { error } = await db
    .from("exam_questions")
    .update({ body, kind: body.data.kind, level, updated_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("owner_id", ownerId);
  if (error) throw new Error("Không lưu được câu hỏi");
  const kind = body.data.kind;
  const partPoints = (k: QuestionKind, fallback: number) =>
    slots.find((s) => s.kind === k && s.questionId !== questionId)?.points ?? fallback;
  const next = slots.map((s) =>
    s.questionId === questionId
      ? { ...s, kind, level, points: kind === s.kind ? s.points : partPoints(kind, s.points) }
      : s,
  );
  const ordered = KIND_ORDER.flatMap((k) => next.filter((s) => s.kind === k));
  await db.from("exam_matrices").update({ slots: ordered }).eq("id", id);
  if (assignments.length)
    await db.from("exam_assignments").update({ slots: ordered }).in("id", assignments);
  return { ok: true };
}
