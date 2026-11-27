// Teacher reads/writes of the classification tree (khối, chương, bài) through owner RLS.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Topic, TopicLevel } from "./topics";

function db(): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

function fail(what: string, error: { message?: string; code?: string } | null): never {
  if (error?.message?.includes("exam_topics"))
    throw new Error(`${what}. Bảng dữ liệu cây phân loại đã được tạo chưa?`);
  throw new Error(what);
}

export async function listTopics(): Promise<Topic[]> {
  const { data, error } = await db()
    .from("exam_topics")
    .select("id,parent_id,level,title,position")
    .order("position");
  if (error) fail("Không tải được cây phân loại", error);
  return (data ?? []) as Topic[];
}

export async function addTopic(
  level: TopicLevel,
  title: string,
  parentId: string | null,
  position: number,
): Promise<string> {
  const clean = title.trim().slice(0, 150);
  if (!clean) throw new Error("Hãy nhập tên");
  const { data, error } = await db()
    .from("exam_topics")
    .insert({ level, title: clean, parent_id: parentId, position })
    .select("id")
    .single();
  if (error || !data) fail("Không thêm được", error);
  return (data as { id: string }).id;
}

export async function renameTopic(id: string, title: string): Promise<void> {
  const clean = title.trim().slice(0, 150);
  if (!clean) throw new Error("Hãy nhập tên");
  const { error } = await db()
    .from("exam_topics")
    .update({ title: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail("Không đổi được tên", error);
}

export async function setTopicPosition(id: string, position: number): Promise<void> {
  const { error } = await db().from("exam_topics").update({ position }).eq("id", id);
  if (error) fail("Không sắp xếp được", error);
}

export async function deleteTopic(id: string): Promise<void> {
  const { error } = await db().from("exam_topics").delete().eq("id", id);
  if (error)
    fail(
      error.code === "23503"
        ? "Nhánh này vẫn còn mục con, hãy xóa hoặc chuyển chúng trước"
        : "Không xóa được",
      error,
    );
}
