// The teacher's own classification tree, like OLM's: Khối → Chương → Bài → Dạng toán.
// Khối, chương and bài are exam_topics rows; every dạng toán is a question bank (exam_banks)
// attached to a bài. Banks with no bài are "Chưa phân loại". Pure, shared by the bank page,
// the matrix editor and the server's draw.

export type TopicLevel = "grade" | "chapter" | "lesson";

export interface Topic {
  id: string;
  parent_id: string | null;
  level: TopicLevel;
  title: string;
  position: number;
}

export interface BankRef {
  id: string;
  title: string;
  topic_id: string | null;
  position: number;
}

export const LEVEL_NAME: Record<TopicLevel | "form", string> = {
  grade: "Khối",
  chapter: "Chương",
  lesson: "Bài",
  form: "Dạng toán",
};

/** What can be added inside a node: a chương in a khối, a bài in a chương, a dạng in a bài. */
export const CHILD_OF: Record<TopicLevel, TopicLevel | "form"> = {
  grade: "chapter",
  chapter: "lesson",
  lesson: "form",
};

export interface TreeNode {
  topic: Topic;
  children: TreeNode[];
  /** dạng toán (banks), only on a bài */
  forms: BankRef[];
}

const byPosition = <T extends { position: number; title: string }>(a: T, b: T) =>
  a.position - b.position || a.title.localeCompare(b.title, "vi");

export function buildTree(topics: Topic[], banks: BankRef[]): TreeNode[] {
  const make = (t: Topic): TreeNode => ({
    topic: t,
    children: topics
      .filter((c) => c.parent_id === t.id)
      .sort(byPosition)
      .map(make),
    forms: banks.filter((b) => b.topic_id === t.id).sort(byPosition),
  });
  return topics
    .filter((t) => t.parent_id === null)
    .sort(byPosition)
    .map(make);
}

/** Banks that belong to no bài (made before the tree, or whose bài is gone). */
export function unclassified(topics: Topic[], banks: BankRef[]): BankRef[] {
  const lessons = new Set(topics.filter((t) => t.level === "lesson").map((t) => t.id));
  return banks.filter((b) => !b.topic_id || !lessons.has(b.topic_id)).sort(byPosition);
}

/** The topics above a topic, nearest first (itself included). */
export function ancestors(topics: Topic[], id: string | null): string[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const out: string[] = [];
  let at = id ? byId.get(id) : undefined;
  while (at && !out.includes(at.id)) {
    out.push(at.id);
    at = at.parent_id ? byId.get(at.parent_id) : undefined;
  }
  return out;
}

/** For every bank, the bài, chương and khối it sits under (empty when unclassified). */
export function bankPaths(topics: Topic[], banks: Pick<BankRef, "id" | "topic_id">[]) {
  return new Map(banks.map((b) => [b.id, ancestors(topics, b.topic_id)]));
}

/** "Khối 11 › Chương II › Bài 11" for a topic, "… › Dạng 1" for a bank. */
export function pathLabels(topics: Topic[], banks: BankRef[]): Map<string, string> {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const label = (ids: string[]) =>
    [...ids]
      .reverse()
      .map((i) => byId.get(i)?.title ?? "")
      .join(" › ");
  const out = new Map<string, string>();
  for (const t of topics) out.set(t.id, label(ancestors(topics, t.id)));
  for (const b of banks) {
    const above = ancestors(topics, b.topic_id);
    out.set(b.id, above.length ? `${label(above)} › ${b.title}` : b.title);
  }
  return out;
}

/** Everything in display order, with depth, for an indented picker. */
export function flatten(
  tree: TreeNode[],
  extra: BankRef[] = [],
): { id: string; kind: TopicLevel | "form"; title: string; depth: number }[] {
  const out: { id: string; kind: TopicLevel | "form"; title: string; depth: number }[] = [];
  const walk = (n: TreeNode, depth: number) => {
    out.push({ id: n.topic.id, kind: n.topic.level, title: n.topic.title, depth });
    for (const c of n.children) walk(c, depth + 1);
    for (const f of n.forms) out.push({ id: f.id, kind: "form", title: f.title, depth: depth + 1 });
  };
  for (const n of tree) walk(n, 0);
  for (const b of extra) out.push({ id: b.id, kind: "form", title: b.title, depth: 0 });
  return out;
}

/** A node can be deleted only when nothing is inside it. */
export function isEmptyTopic(topics: Topic[], banks: BankRef[], id: string): boolean {
  return !topics.some((t) => t.parent_id === id) && !banks.some((b) => b.topic_id === id);
}
