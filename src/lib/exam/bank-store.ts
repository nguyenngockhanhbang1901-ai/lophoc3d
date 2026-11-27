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
    .select("id,title,topic,description,topic_id,position,created_at,updated_at")
    .eq("purpose", "bank")
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
  /** the bài to put a new dạng toán in */
  topicId?: string | null;
  position?: number;
}): Promise<string> {
  const values = {
    title: bank.title.trim(),
    topic: bank.topic.trim(),
    description: bank.description.trim(),
    updated_at: new Date().toISOString(),
    ...(bank.topicId !== undefined ? { topic_id: bank.topicId } : {}),
    ...(bank.position !== undefined ? { position: bank.position } : {}),
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

/** Put a dạng toán (bank) into a bài, or back to "Chưa phân loại"; position orders it there. */
export async function placeBank(id: string, topicId: string | null, position: number) {
  const { error } = await db()
    .from("exam_banks")
    .update({ topic_id: topicId, position })
    .eq("id", id);
  if (error) fail("Không chuyển được dạng toán", error);
}

export async function deleteBank(id: string): Promise<void> {
  const { error } = await db().from("exam_banks").delete().eq("id", id);
  if (error) fail("Không xóa được ngân hàng", error);
}

// Pictures are stored inside the question (data URLs) and can be large. Lists load the text
// first and fetch each picture once, keyed by the question's updated_at, so hiding, moving or
// saving one question never downloads every picture of the bank again.
const mediaCache = new Map<string, { updatedAt: string; media: QuestionBody["media"] }>();

const LIGHT_COLUMNS =
  "id,bank_id,position,kind,level,topic,hidden,created_at,updated_at,stem:body->>stem,explanation:body->>explanation,data:body->data,media_kind:body->media->>kind";

interface LightRow extends Omit<QuestionRow, "body"> {
  stem: string | null;
  explanation: string | null;
  data: unknown;
  media_kind: string | null;
}

export async function listQuestions(bankId: string): Promise<QuestionRow[]> {
  const { data, error } = await db()
    .from("exam_questions")
    .select(LIGHT_COLUMNS)
    .eq("bank_id", bankId)
    .order("position")
    .order("created_at");
  if (error) fail("Không tải được câu hỏi", error);
  const rows = (data ?? []) as unknown as LightRow[];
  const missing = rows
    .filter((r) => r.media_kind && mediaCache.get(r.id)?.updatedAt !== r.updated_at)
    .map((r) => r.id);
  if (missing.length) {
    const { data: media } = await db()
      .from("exam_questions")
      .select("id,updated_at,media:body->media")
      .in("id", missing);
    for (const m of (media ?? []) as { id: string; updated_at: string; media: unknown }[]) {
      const parsed = questionBodySchema.shape.media.safeParse(m.media ?? null);
      mediaCache.set(m.id, { updatedAt: m.updated_at, media: parsed.success ? parsed.data : null });
    }
  }
  return rows.map((r) => {
    const raw = {
      stem: r.stem ?? "",
      explanation: r.explanation ?? "",
      data: r.data,
      media: r.media_kind ? (mediaCache.get(r.id)?.media ?? null) : null,
    };
    const parsed = questionBodySchema.safeParse(raw);
    const { stem: _s, explanation: _e, data: _d, media_kind: _m, ...rest } = r;
    return { ...rest, body: parsed.success ? parsed.data : (raw as QuestionBody) };
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

/** Many new questions in one request (Word import), positions start, start+1, … */
export async function saveQuestions(drafts: QuestionDraft[], start: number): Promise<void> {
  if (!drafts.length) return;
  const now = new Date().toISOString();
  const rows = drafts.map((d, i) => {
    const body = questionBodySchema.parse(d.body);
    return {
      bank_id: d.bankId,
      kind: body.data.kind,
      level: d.level,
      topic: d.topic.trim().slice(0, 150),
      body,
      position: start + i,
      updated_at: now,
    };
  });
  // a few pictures can make one request large: send in groups of 20
  for (let i = 0; i < rows.length; i += 20) {
    const { error } = await db()
      .from("exam_questions")
      .insert(rows.slice(i, i + 20));
    if (error) fail("Không lưu được câu hỏi", error);
  }
}

export async function setQuestionHidden(id: string, hidden: boolean): Promise<void> {
  const { error } = await db().from("exam_questions").update({ hidden }).eq("id", id);
  if (error) fail("Không cập nhật được câu hỏi", error);
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await db().from("exam_questions").delete().eq("id", id);
  if (error) fail("Không xóa được câu hỏi", error);
}

/** Swap the stored positions of two questions (two small updates). */
export async function swapPositions(
  a: { id: string; position: number },
  b: { id: string; position: number },
): Promise<void> {
  const results = await Promise.all([
    db().from("exam_questions").update({ position: b.position }).eq("id", a.id),
    db().from("exam_questions").update({ position: a.position }).eq("id", b.id),
  ]);
  const failed = results.find((r) => r.error);
  if (failed) fail("Không sắp xếp được câu hỏi", failed.error);
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
