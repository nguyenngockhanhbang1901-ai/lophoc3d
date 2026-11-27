// The questions a matrix (or an assignment's copy of it) can draw from, read with the service
// role for one teacher: the banks its slots name plus every dạng toán under a khối, chương or
// bài a slot names, each question tagged with the branch it sits in.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatrixSlot, PoolQuestion } from "./matrix";
import { POOL_COLUMNS, toPool, type PoolRow } from "./pool";
import { bankPaths, type Topic } from "./topics";

export async function loadSlotPool(
  db: SupabaseClient,
  ownerId: string,
  slots: MatrixSlot[],
): Promise<{ pool: PoolQuestion[]; titles: { id: string; title: string }[] }> {
  const topicIds = new Set(slots.flatMap((s) => (s.topicId ? [s.topicId] : [])));
  const [{ data: topicRows }, { data: bankRows }] = await Promise.all([
    topicIds.size
      ? db.from("exam_topics").select("id,parent_id,level,title,position").eq("owner_id", ownerId)
      : Promise.resolve({ data: [] as unknown[] }),
    db.from("exam_banks").select("id,title,topic_id").eq("owner_id", ownerId),
  ]);
  const topics = (topicRows ?? []) as Topic[];
  const banks = (bankRows ?? []) as { id: string; title: string; topic_id: string | null }[];
  const paths = bankPaths(topics, banks);
  const wanted = new Set(slots.filter((s) => !s.topicId).map((s) => s.bankId));
  for (const b of banks) if ((paths.get(b.id) ?? []).some((t) => topicIds.has(t))) wanted.add(b.id);
  const ids = [...wanted];
  const rows: PoolRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db
      .from("exam_questions")
      .select(POOL_COLUMNS)
      .eq("owner_id", ownerId)
      .in("bank_id", ids.slice(i, i + 100));
    if (error) throw new Error("Không đọc được ngân hàng đề");
    rows.push(...((data ?? []) as unknown as PoolRow[]));
  }
  return {
    pool: toPool(rows, paths),
    titles: [
      ...banks.map((b) => ({ id: b.id, title: b.title })),
      ...topics.map((t) => ({ id: t.id, title: t.title })),
    ],
  };
}
