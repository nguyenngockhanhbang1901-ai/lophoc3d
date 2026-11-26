import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { SLIDE_KEY_PREFIX, isSlideLessonKey, parseSlideContent, type SlideContent } from "./model";

/** Slide lessons live in the existing `lessons` table (content = JSON), one row per lesson per owner. */
export type SlideLessonRow = { lesson_key: string; title: string; content: SlideContent };
export type SlideStore = Pick<typeof supabase, "from">;

export async function listSlideLessons(
  client: SlideStore,
  ownerId: string,
): Promise<{ lessons: SlideLessonRow[]; unreadable: number }> {
  const { data, error } = await client
    .from("lessons")
    .select("lesson_key,title,content")
    .eq("owner_id", ownerId)
    .like("lesson_key", `${SLIDE_KEY_PREFIX}%`)
    .order("created_at");
  if (error) throw new Error("Không tải được danh sách bài học");
  const lessons: SlideLessonRow[] = [];
  let unreadable = 0;
  for (const row of data ?? []) {
    const content = parseSlideContent(row.content);
    if (content) lessons.push({ lesson_key: row.lesson_key, title: row.title, content });
    else unreadable += 1;
  }
  return { lessons, unreadable };
}

export async function saveSlideLesson(
  client: SlideStore,
  ownerId: string,
  row: SlideLessonRow,
): Promise<void> {
  if (!isSlideLessonKey(row.lesson_key)) throw new Error("Khóa bài học không hợp lệ");
  const { error } = await client.from("lessons").upsert(
    {
      owner_id: ownerId,
      lesson_key: row.lesson_key,
      title: row.title.trim() || "Bài học mới",
      content: row.content as unknown as Json,
    },
    { onConflict: "owner_id,lesson_key" },
  );
  if (error) throw new Error("Không lưu được bài học");
}

/** Only ever deletes slide lessons, so Bài 11, 11.1, 12 and old text lessons cannot be removed from here. */
export async function deleteSlideLesson(
  client: SlideStore,
  ownerId: string,
  key: string,
): Promise<void> {
  if (!isSlideLessonKey(key)) throw new Error("Chỉ xóa được bài học dạng slide");
  const { error } = await client
    .from("lessons")
    .delete()
    .eq("owner_id", ownerId)
    .eq("lesson_key", key);
  if (error) throw new Error("Không xóa được bài học");
}

export async function loadSlideLesson(
  client: SlideStore,
  ownerId: string,
  key: string,
): Promise<SlideLessonRow | null> {
  if (!isSlideLessonKey(key)) return null;
  const { data, error } = await client
    .from("lessons")
    .select("lesson_key,title,content")
    .eq("owner_id", ownerId)
    .eq("lesson_key", key)
    .maybeSingle();
  if (error) throw new Error("Không tải được bài học");
  const content = data ? parseSlideContent(data.content) : null;
  return data && content ? { lesson_key: data.lesson_key, title: data.title, content } : null;
}
