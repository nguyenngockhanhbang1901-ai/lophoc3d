// The question library as a tree the teacher builds: Khối → Chương → Bài → Dạng toán.
// Every dạng toán is a bank; selecting one shows its questions. Old banks wait in
// "Chưa phân loại" until moved into a bài.
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FolderInput,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { BankSummary } from "@/lib/exam/bank-store";
import { placeBank, saveBank } from "@/lib/exam/bank-store";
import { addTopic, deleteTopic, renameTopic, setTopicPosition } from "@/lib/exam/topic-store";
import {
  CHILD_OF,
  LEVEL_NAME,
  buildTree,
  isEmptyTopic,
  pathLabels,
  unclassified,
  type Topic,
  type TopicLevel,
  type TreeNode,
} from "@/lib/exam/topics";

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

const PLACEHOLDER: Record<TopicLevel | "form", string> = {
  grade: "Ví dụ: Khối 11",
  chapter: "Ví dụ: Chương IV. Quan hệ song song trong không gian",
  lesson: "Ví dụ: Bài 11. Hai đường thẳng song song",
  form: "Ví dụ: Dạng 1. Chứng minh hai đường thẳng song song",
};

type Adding = { parentId: string | null; level: TopicLevel | "form" } | null;

export function TopicTree({
  topics,
  banks,
  selected,
  onSelect,
  onChanged,
}: {
  topics: Topic[];
  banks: BankSummary[];
  selected: string;
  onSelect: (bankId: string) => void;
  onChanged: (select?: string) => Promise<void>;
}) {
  const tree = useMemo(() => buildTree(topics, banks), [topics, banks]);
  const loose = useMemo(() => unclassified(topics, banks), [topics, banks]);
  const labels = useMemo(() => pathLabels(topics, banks), [topics, banks]);
  const lessons = topics.filter((t) => t.level === "lesson");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Adding>(null);
  const [renaming, setRenaming] = useState<Topic | null>(null);
  const [moving, setMoving] = useState<BankSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const count = useMemo(() => {
    const byBank = new Map(banks.map((b) => [b.id, b.questionCount]));
    const total = (n: TreeNode): number =>
      n.children.reduce((s, c) => s + total(c), 0) +
      n.forms.reduce((s, f) => s + (byBank.get(f.id) ?? 0), 0);
    const out = new Map<string, number>();
    const walk = (n: TreeNode) => {
      out.set(n.topic.id, total(n));
      n.children.forEach(walk);
    };
    tree.forEach(walk);
    return out;
  }, [tree, banks]);

  async function run(task: () => Promise<unknown>, select?: string) {
    setBusy(true);
    setError("");
    try {
      await task();
      await onChanged(select);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const nextPosition = (items: { position: number }[]) =>
    items.reduce((m, x) => Math.max(m, x.position), 0) + 1;

  /** Swap with the neighbour (topics among siblings, dạng among the bài's dạng). */
  function moveTopic(t: Topic, delta: number) {
    const siblings = topics
      .filter((x) => x.parent_id === t.parent_id)
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, "vi"));
    const i = siblings.findIndex((x) => x.id === t.id);
    const other = siblings[i + delta];
    if (!other) return;
    void run(async () => {
      const a = other.position === t.position ? i + 1 + delta : other.position;
      const b = other.position === t.position ? i + 1 : t.position;
      await Promise.all([setTopicPosition(t.id, a), setTopicPosition(other.id, b)]);
    });
  }
  function moveForm(f: BankSummary, siblings: { id: string; position: number }[], delta: number) {
    const i = siblings.findIndex((x) => x.id === f.id);
    const other = siblings[i + delta];
    if (!other) return;
    void run(async () => {
      const a = other.position === f.position ? i + 1 + delta : other.position;
      const b = other.position === f.position ? i + 1 : f.position;
      await Promise.all([placeBank(f.id, f.topic_id, a), placeBank(other.id, f.topic_id, b)]);
    });
  }

  const node = (n: TreeNode, depth: number) => {
    const t = n.topic;
    const open = !closed.has(t.id);
    const child = CHILD_OF[t.level];
    const empty = isEmptyTopic(topics, banks, t.id);
    return (
      <li key={t.id}>
        <div
          className="group flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-muted"
          style={{ paddingLeft: depth * 12 }}
        >
          <button
            type="button"
            className="shrink-0 rounded p-0.5"
            aria-label={open ? `Thu gọn ${t.title}` : `Mở ${t.title}`}
            onClick={() =>
              setClosed((s) => {
                const x = new Set(s);
                if (x.has(t.id)) x.delete(t.id);
                else x.add(t.id);
                return x;
              })
            }
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <span
            className={`min-w-0 flex-1 truncate text-sm ${t.level === "grade" ? "font-semibold" : t.level === "chapter" ? "font-medium" : ""}`}
            title={t.title}
          >
            {t.title}
          </span>
          <span className="text-xs text-muted-foreground">{count.get(t.id) ?? 0}</span>
          <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <Tiny
              label={`Thêm ${LEVEL_NAME[child].toLowerCase()} vào ${t.title}`}
              onClick={() => {
                setClosed((s) => {
                  const x = new Set(s);
                  x.delete(t.id);
                  return x;
                });
                setAdding({ parentId: t.id, level: child });
              }}
            >
              <Plus size={13} />
            </Tiny>
            <Tiny label={`Đổi tên ${t.title}`} onClick={() => setRenaming(t)}>
              <Pencil size={13} />
            </Tiny>
            <Tiny label={`Lên ${t.title}`} onClick={() => moveTopic(t, -1)}>
              <ArrowUp size={13} />
            </Tiny>
            <Tiny label={`Xuống ${t.title}`} onClick={() => moveTopic(t, 1)}>
              <ArrowDown size={13} />
            </Tiny>
            <Tiny
              label={empty ? `Xóa ${t.title}` : "Chỉ xóa được nhánh trống"}
              disabled={!empty}
              onClick={() =>
                window.confirm(`Xóa ${LEVEL_NAME[t.level].toLowerCase()} “${t.title}”?`) &&
                void run(() => deleteTopic(t.id))
              }
            >
              <Trash2 size={13} />
            </Tiny>
          </span>
        </div>
        {open && (
          <ul>
            {n.children.map((c) => node(c, depth + 1))}
            {n.forms.map((f) => {
              const bank = banks.find((b) => b.id === f.id)!;
              return form(bank, n.forms, depth + 1);
            })}
            {adding?.parentId === t.id && addRow(depth + 1)}
          </ul>
        )}
      </li>
    );
  };

  const form = (b: BankSummary, siblings: { id: string; position: number }[], depth: number) => (
    <li key={b.id}>
      <div
        className={`group flex items-center gap-1 rounded-md py-1 pr-1 ${b.id === selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        style={{ paddingLeft: depth * 12 + 18 }}
      >
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm"
          title={b.title}
          onClick={() => onSelect(b.id)}
        >
          {b.title}
        </button>
        <span className="text-xs opacity-80">
          {b.questionCount}
          {b.hiddenCount ? ` (${b.hiddenCount} ẩn)` : ""}
        </span>
        <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          {b.topic_id && (
            <>
              <Tiny label={`Lên ${b.title}`} onClick={() => moveForm(b, siblings, -1)}>
                <ArrowUp size={13} />
              </Tiny>
              <Tiny label={`Xuống ${b.title}`} onClick={() => moveForm(b, siblings, 1)}>
                <ArrowDown size={13} />
              </Tiny>
            </>
          )}
          <Tiny label={`Chuyển ${b.title} sang bài khác`} onClick={() => setMoving(b)}>
            <FolderInput size={13} />
          </Tiny>
        </span>
      </div>
    </li>
  );

  const addRow = (depth: number) => (
    <li style={{ paddingLeft: depth * 12 + 4 }}>
      <AddForm
        level={adding!.level}
        busy={busy}
        onCancel={() => setAdding(null)}
        onAdd={(title) => {
          const a = adding!;
          if (a.level === "form") {
            const siblings = banks.filter((b) => b.topic_id === a.parentId);
            let created = "";
            void run(async () => {
              created = await saveBank({
                title,
                topic: "",
                description: "",
                topicId: a.parentId,
                position: nextPosition(siblings),
              });
              setAdding(null);
              onSelect(created);
            }, undefined);
          } else {
            const siblings = topics.filter((x) => x.parent_id === a.parentId);
            void run(async () => {
              await addTopic(a.level as TopicLevel, title, a.parentId, nextPosition(siblings));
              setAdding(null);
            });
          }
        }}
      />
    </li>
  );

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Cây câu hỏi</h2>
        <Button size="sm" onClick={() => setAdding({ parentId: null, level: "grade" })}>
          <Plus />
          Thêm khối
        </Button>
      </div>
      {error && <p className="error-note text-xs">{error}</p>}
      {!tree.length && !loose.length && adding?.parentId !== null && (
        <p className="text-sm text-muted-foreground">
          Chưa có gì. Bấm “Thêm khối”, rồi rê chuột vào khối và bấm + để thêm chương, bài, dạng
          toán.
        </p>
      )}
      <ul className="grid">
        {tree.map((n) => node(n, 0))}
        {adding?.parentId === null && addRow(0)}
      </ul>
      {loose.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Chưa phân loại — bấm <FolderInput size={12} className="inline" /> để chuyển vào một bài
          </p>
          <ul>
            {loose.map((f) =>
              form(
                banks.find((b) => b.id === f.id)!,
                loose,
                0,
              ),
            )}
          </ul>
        </div>
      )}

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          {renaming && (
            <>
              <DialogTitle>Đổi tên {LEVEL_NAME[renaming.level].toLowerCase()}</DialogTitle>
              <AddForm
                level={renaming.level}
                initial={renaming.title}
                busy={busy}
                onCancel={() => setRenaming(null)}
                onAdd={(title) =>
                  void run(async () => {
                    await renameTopic(renaming.id, title);
                    setRenaming(null);
                  })
                }
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent>
          {moving && (
            <MoveForm
              bank={moving}
              lessons={lessons.map((l) => ({ id: l.id, label: labels.get(l.id) ?? l.title }))}
              busy={busy}
              onMove={(topicId) =>
                void run(async () => {
                  await placeBank(
                    moving.id,
                    topicId,
                    nextPosition(banks.filter((b) => b.topic_id === topicId)),
                  );
                  setMoving(null);
                }, moving.id)
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tiny({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 hover:bg-background disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function AddForm({
  level,
  initial = "",
  busy,
  onAdd,
  onCancel,
}: {
  level: TopicLevel | "form";
  initial?: string;
  busy: boolean;
  onAdd: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial);
  return (
    <form
      className="flex items-center gap-1 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onAdd(title);
      }}
    >
      <Input
        autoFocus
        aria-label={`Tên ${LEVEL_NAME[level].toLowerCase()}`}
        className="h-8 text-sm"
        maxLength={150}
        placeholder={PLACEHOLDER[level]}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <Button size="sm" className="h-8" disabled={busy || !title.trim()}>
        {initial ? "Lưu" : `Thêm`}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onCancel}>
        Hủy
      </Button>
    </form>
  );
}

function MoveForm({
  bank,
  lessons,
  busy,
  onMove,
}: {
  bank: BankSummary;
  lessons: { id: string; label: string }[];
  busy: boolean;
  onMove: (topicId: string | null) => void;
}) {
  const [to, setTo] = useState(bank.topic_id ?? lessons[0]?.id ?? "");
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onMove(to || null);
      }}
    >
      <DialogTitle>Chuyển “{bank.title}”</DialogTitle>
      <DialogDescription>
        Dạng toán và toàn bộ câu hỏi của nó chuyển sang bài được chọn; ma trận đang dùng nó vẫn dùng
        được.
      </DialogDescription>
      {lessons.length ? (
        <select className="entry-select" value={to} onChange={(e) => setTo(e.target.value)}>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
          <option value="">(Chưa phân loại)</option>
        </select>
      ) : (
        <p className="text-sm text-muted-foreground">
          Chưa có bài nào. Hãy thêm khối → chương → bài trước.
        </p>
      )}
      <Button disabled={busy || !lessons.length}>{busy ? "Đang chuyển…" : "Chuyển"}</Button>
    </form>
  );
}
