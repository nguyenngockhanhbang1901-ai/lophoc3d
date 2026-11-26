// Teacher reads and writes of the question library, straight through the signed-in client:
// owner RLS on exam_banks / exam_questions keeps every teacher's library private.
// Bodies are validated before every write so a broken question can never be stored.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  questionBodySchema,
  type BankRow,
  type QuestionBody,
  type QuestionLevel,
  type QuestionRow,
} from "./questions";

function db(): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

export interface BankSummary extends BankRow {
  questionCount: number;
  hiddenCount: number;
}

function fail(what: string, error: { message?: string } | null): never {
  if (error?.message?.includes("exam_banks") || error?.message?.includes("exam_questions"))
    throw new Error(`${what}. Bảng dữ liệu ngân hàng đề đã được tạo chưa?`);
  throw new Error(what);
}

export async function listBanks(): Promise<BankSummary[]> {
  const { data, error } = await db()
    .from("exam_banks")
    .select("id,title,topic,description,created_at,updated_at")
    .order("created_at");
  if (error) fail("Không tải được ngân hàng đề", error);
  const { data: qs } = await db().from("exam_questions").select("bank_id,hidden");
  const count = new Map<string, { all: number; hidden: number }>();
  for (const q of (qs ?? []) as { bank_id: string; hidden: boolean }[]) {
    const c = count.get(q.bank_id) ?? { all: 0, hidden: 0 };
    c.all += 1;
    if (q.hidden) c.hidden += 1;
    count.set(q.bank_id, c);
  }
  return ((data ?? []) as BankRow[]).map((b) => ({
    ...b,
    questionCount: count.get(b.id)?.all ?? 0,
    hiddenCount: count.get(b.id)?.hidden ?? 0,
  }));
}

export async function saveBank(bank: {
  id?: string;
  title: string;
  topic: string;
  description: string;
}): Promise<string> {
  const values = {
    title: bank.title.trim(),
    topic: bank.topic.trim(),
    description: bank.description.trim(),
    updated_at: new Date().toISOString(),
  };
  if (!values.title) throw new Error("Hãy đặt tên ngân hàng");
  if (bank.id) {
    const { error } = await db().from("exam_banks").update(values).eq("id", bank.id);
    if (error) fail("Không lưu được ngân hàng", error);
    return bank.id;
  }
  const { data, error } = await db().from("exam_banks").insert(values).select("id").single();
  if (error || !data) fail("Không tạo được ngân hàng", error);
  return (data as { id: string }).id;
}

export async function deleteBank(id: string): Promise<void> {
  const { error } = await db().from("exam_banks").delete().eq("id", id);
  if (error) fail("Không xóa được ngân hàng", error);
}

export async function listQuestions(bankId: string): Promise<QuestionRow[]> {
  const { data, error } = await db()
    .from("exam_questions")
    .select("*")
    .eq("bank_id", bankId)
    .order("position")
    .order("created_at");
  if (error) fail("Không tải được câu hỏi", error);
  return ((data ?? []) as QuestionRow[]).map((q) => {
    const parsed = questionBodySchema.safeParse(q.body);
    return parsed.success ? { ...q, body: parsed.data } : q;
  });
}

export interface QuestionDraft {
  id?: string;
  bankId: string;
  level: QuestionLevel;
  topic: string;
  body: QuestionBody;
}

export async function saveQuestion(draft: QuestionDraft, position = 0): Promise<string> {
  const body = questionBodySchema.parse(draft.body);
  const values = {
    bank_id: draft.bankId,
    kind: body.data.kind,
    level: draft.level,
    topic: draft.topic.trim().slice(0, 150),
    body,
    updated_at: new Date().toISOString(),
  };
  if (draft.id) {
    const { error } = await db().from("exam_questions").update(values).eq("id", draft.id);
    if (error) fail("Không lưu được câu hỏi", error);
    return draft.id;
  }
  const { data, error } = await db()
    .from("exam_questions")
    .insert({ ...values, position })
    .select("id")
    .single();
  if (error || !data) fail("Không lưu được câu hỏi", error);
  return (data as { id: string }).id;
}

export async function setQuestionHidden(id: string, hidden: boolean): Promise<void> {
  const { error } = await db().from("exam_questions").update({ hidden }).eq("id", id);
  if (error) fail("Không cập nhật được câu hỏi", error);
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await db().from("exam_questions").delete().eq("id", id);
  if (error) fail("Không xóa được câu hỏi", error);
}

/** Store positions 1..n in the given order (used after moving a question up or down). */
export async function reorderQuestions(ids: string[]): Promise<void> {
  const results = await Promise.all(
    ids.map((id, i) =>
      db()
        .from("exam_questions")
        .update({ position: i + 1 })
        .eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed) fail("Không sắp xếp được câu hỏi", failed.error);
}

/** Copy a question to the end of a bank (the same one, or another of the teacher's banks). */
export async function copyQuestion(
  q: QuestionRow,
  toBankId: string,
  position: number,
): Promise<string> {
  return saveQuestion({ bankId: toBankId, level: q.level, topic: q.topic, body: q.body }, position);
}
