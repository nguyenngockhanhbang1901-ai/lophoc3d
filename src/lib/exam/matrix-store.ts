// Teacher reads/writes of exam matrices (owner RLS), plus the light question list the matrix
// screen needs: which questions are usable, without downloading their pictures.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { matrixSlotsSchema, type MatrixSlot, type PoolQuestion } from "./matrix";
import { questionBodySchema, type QuestionBody } from "./questions";
import { POOL_COLUMNS, toPool, type PoolRow } from "./pool";

function db(): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

export interface MatrixRow {
  id: string;
  title: string;
  description: string;
  slots: MatrixSlot[];
  shuffle_options: boolean;
  shuffle_order: boolean;
  /** also shuffle the four statements of đúng/sai questions */
  shuffle_statements: boolean;
  /** "word_exam": an exam made from a Word file (every slot pinned to one question) */
  purpose: "bank" | "word_exam";
  source_file: string;
  updated_at: string;
}

function fail(what: string, error: { message?: string } | null): never {
  if (error?.message?.includes("exam_matrices"))
    throw new Error(`${what}. Bảng dữ liệu ma trận đề đã được tạo chưa?`);
  throw new Error(what);
}

export async function listMatrices(): Promise<MatrixRow[]> {
  const { data, error } = await db()
    .from("exam_matrices")
    .select(
      "id,title,description,slots,shuffle_options,shuffle_order,shuffle_statements,purpose,source_file,updated_at",
    )
    .order("created_at");
  if (error) fail("Không tải được ma trận đề", error);
  return ((data ?? []) as MatrixRow[]).map((m) => {
    const parsed = matrixSlotsSchema.safeParse(m.slots);
    return { ...m, slots: parsed.success ? parsed.data : [] };
  });
}

export async function saveMatrix(
  m: Omit<MatrixRow, "id" | "updated_at" | "purpose" | "source_file"> & { id?: string },
): Promise<string> {
  const values = {
    title: m.title.trim() || "Ma trận chưa đặt tên",
    description: m.description.trim(),
    slots: matrixSlotsSchema.parse(m.slots),
    shuffle_options: m.shuffle_options,
    shuffle_order: m.shuffle_order,
    shuffle_statements: m.shuffle_statements,
    updated_at: new Date().toISOString(),
  };
  if (m.id) {
    const { error } = await db().from("exam_matrices").update(values).eq("id", m.id);
    if (error) fail("Không lưu được ma trận", error);
    return m.id;
  }
  const { data, error } = await db().from("exam_matrices").insert(values).select("id").single();
  if (error || !data) fail("Không tạo được ma trận", error);
  return (data as { id: string }).id;
}

export async function deleteMatrix(id: string): Promise<void> {
  const { error } = await db().from("exam_matrices").delete().eq("id", id);
  if (error) fail("Không xóa được ma trận", error);
}

/** Usable questions (not hidden, nothing missing) of all the teacher's banks, without pictures. */
export async function listPoolQuestions(): Promise<PoolQuestion[]> {
  const { data, error } = await db().from("exam_questions").select(POOL_COLUMNS);
  if (error) throw new Error("Không tải được câu hỏi");
  return toPool((data ?? []) as unknown as PoolRow[]);
}

/** Full bodies of the drawn questions, for the preview. */
export async function getQuestionBodies(ids: string[]): Promise<Map<string, QuestionBody>> {
  if (!ids.length) return new Map();
  const { data, error } = await db().from("exam_questions").select("id,body").in("id", ids);
  if (error) throw new Error("Không tải được câu hỏi");
  const out = new Map<string, QuestionBody>();
  for (const q of (data ?? []) as { id: string; body: unknown }[]) {
    const parsed = questionBodySchema.safeParse(q.body);
    if (parsed.success) out.set(q.id, parsed.data);
  }
  return out;
}
