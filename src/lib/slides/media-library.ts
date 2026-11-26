import type { Json } from "@/integrations/supabase/types";
import { randomId, type IdFactory } from "./types";
import type { SlideStore } from "./storage";

/**
 * The teacher's own picture and 3D-model library. Like slide lessons it lives in the existing
 * `lessons` table (no schema change), one row per item, so it is private to the teacher exactly
 * like their lessons: key `img:…` for a picture, `glb:…` for a model; title = the item's name;
 * content = { kind: "media", type, src, thumb }. Slides keep their own copy of the picture, so a
 * class can show it without reading this library.
 */
export type MediaType = "image" | "model3d";
export const MEDIA_PREFIX: Record<MediaType, string> = { image: "img:", model3d: "glb:" };
export const MAX_MEDIA_NAME = 150;
export type MediaItem = { key: string; name: string; type: MediaType; thumb: string };

export function isMediaKey(key: string, type?: MediaType): boolean {
  return type
    ? key.startsWith(MEDIA_PREFIX[type])
    : key.startsWith(MEDIA_PREFIX.image) || key.startsWith(MEDIA_PREFIX.model3d);
}
/** Filter for lesson lists: these rows are library items, not lessons. */
export const MEDIA_KEY_PATTERNS = Object.values(MEDIA_PREFIX).map((p) => `${p}%`);

type Row = { lesson_key: string; title: string; thumb?: string | null; content?: unknown };
function thumbOf(row: Row): string {
  if (typeof row.thumb === "string") return row.thumb;
  const c = row.content as { thumb?: unknown } | null | undefined;
  return typeof c?.thumb === "string" ? c.thumb : "";
}

export async function listMedia(
  client: SlideStore,
  ownerId: string,
  type: MediaType,
): Promise<MediaItem[]> {
  const { data, error } = await client
    .from("lessons")
    // only the small preview, never the full pictures
    .select("lesson_key,title,thumb:content->>thumb")
    .eq("owner_id", ownerId)
    .like("lesson_key", `${MEDIA_PREFIX[type]}%`)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Không tải được thư viện");
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    key: r.lesson_key,
    name: r.title,
    type,
    thumb: thumbOf(r),
  }));
}

export async function loadMediaSrc(
  client: SlideStore,
  ownerId: string,
  key: string,
): Promise<string> {
  if (!isMediaKey(key)) throw new Error("Không phải mục thư viện");
  const { data, error } = await client
    .from("lessons")
    .select("content")
    .eq("owner_id", ownerId)
    .eq("lesson_key", key)
    .maybeSingle();
  const src = (data?.content as { src?: unknown } | null | undefined)?.src;
  if (error || typeof src !== "string" || !src)
    throw new Error("Không mở được mục này trong thư viện");
  return src;
}

export async function saveMedia(
  client: SlideStore,
  ownerId: string,
  type: MediaType,
  name: string,
  src: string,
  thumb = "",
  id: IdFactory = randomId,
): Promise<MediaItem> {
  const item: MediaItem = {
    key: `${MEDIA_PREFIX[type]}${id()}`,
    name: name.trim().slice(0, MAX_MEDIA_NAME) || (type === "image" ? "Ảnh" : "Mô hình"),
    type,
    thumb,
  };
  const { error } = await client.from("lessons").upsert(
    {
      owner_id: ownerId,
      lesson_key: item.key,
      title: item.name,
      content: { kind: "media", type, src, thumb } as unknown as Json,
    },
    { onConflict: "owner_id,lesson_key" },
  );
  if (error) throw new Error("Không lưu được vào thư viện");
  return item;
}

export async function renameMedia(
  client: SlideStore,
  ownerId: string,
  key: string,
  name: string,
): Promise<void> {
  const title = name.trim().slice(0, MAX_MEDIA_NAME);
  if (!isMediaKey(key) || !title) throw new Error("Tên không hợp lệ");
  const { error } = await client
    .from("lessons")
    .update({ title })
    .eq("owner_id", ownerId)
    .eq("lesson_key", key);
  if (error) throw new Error("Không đổi được tên");
}

/** Only ever deletes library items; lessons cannot be removed from here. */
export async function deleteMedia(client: SlideStore, ownerId: string, key: string): Promise<void> {
  if (!isMediaKey(key)) throw new Error("Chỉ xóa được mục trong thư viện");
  const { error } = await client
    .from("lessons")
    .delete()
    .eq("owner_id", ownerId)
    .eq("lesson_key", key);
  if (error) throw new Error("Không xóa được");
}

/** Case- and accent-insensitive name search ("duong thang" finds "Đường thẳng"). */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeSearch(query);
  return !q || q.split(/\s+/).every((w) => normalizeSearch(name).includes(w));
}
