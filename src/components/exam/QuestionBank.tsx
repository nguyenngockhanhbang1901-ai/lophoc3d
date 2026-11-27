import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  copyQuestion,
  deleteBank,
  deleteQuestion,
  listBanks,
  listQuestions,
  reorderQuestions,
  saveBank,
  saveQuestion,
  saveQuestions,
  swapPositions,
  setQuestionHidden,
  type BankSummary,
} from "@/lib/exam/bank-store";
import {
  KIND_LABEL,
  LEVEL_LABEL,
  emptyBody,
  questionGaps,
  type QuestionKind,
  type QuestionRow,
} from "@/lib/exam/questions";
import { QuestionView } from "./ExamMath";
import { QuestionEditor, type Editing } from "./QuestionEditor";
import { ImportWord } from "./ImportWord";

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

const PART_TITLE: Record<QuestionKind, string> = {
  mcq: "Phần I. Trắc nghiệm nhiều phương án",
  tf: "Phần II. Trắc nghiệm đúng/sai",
  short: "Phần III. Trả lời ngắn",
};

export function QuestionBank({ userId }: { userId: string }) {
  const [banks, setBanks] = useState<BankSummary[] | null>(null);
  const [bankId, setBankId] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [bankDialog, setBankDialog] = useState<{ edit?: BankSummary } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<"bank" | QuestionRow | null>(null);
  const [copying, setCopying] = useState<QuestionRow | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [showAnswers, setShowAnswers] = useState(true);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<"all" | QuestionKind>("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const bank = banks?.find((b) => b.id === bankId) ?? null;

  const loadBanks = useCallback(async () => {
    try {
      const list = await listBanks();
      setBanks(list);
      setBankId((id) => (list.some((b) => b.id === id) ? id : (list[0]?.id ?? "")));
    } catch (e) {
      setBanks([]);
      setError(message(e));
    }
  }, []);
  const loadQuestions = useCallback(async (id: string) => {
    if (!id) return setQuestions([]);
    try {
      setQuestions(await listQuestions(id));
    } catch (e) {
      setError(message(e));
    }
  }, []);
  useEffect(() => {
    void loadBanks();
  }, [loadBanks]);
  useEffect(() => {
    void loadQuestions(bankId);
  }, [bankId, loadQuestions]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => Promise.all([loadBanks(), loadQuestions(bankId)]);

  /** Move a question up or down among the questions of its own kind (the order students see). */
  async function move(id: string, delta: number) {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    const sameKind = questions.filter((x) => x.kind === q.kind);
    const k = sameKind.findIndex((x) => x.id === id);
    const other = sameKind[k + delta];
    if (!other) return;
    const ids = questions.map((x) => x.id);
    const a = ids.indexOf(id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    if (q.position !== other.position) {
      // two small updates instead of renumbering the whole bank
      setQuestions(
        ids
          .map((x) => questions.find((y) => y.id === x)!)
          .map((y) =>
            y.id === q.id
              ? { ...y, position: other.position }
              : y.id === other.id
                ? { ...y, position: q.position }
                : y,
          ),
      );
      await swapPositions(q, other);
    } else {
      setQuestions(ids.map((x, i) => ({ ...questions.find((y) => y.id === x)!, position: i + 1 })));
      await reorderQuestions(ids);
    }
  }

  /** Next free position at the end of the bank. */
  const nextPosition = () => questions.reduce((m, q) => Math.max(m, q.position), 0) + 1;

  /** Keep the side list's counts right without reloading everything. */
  function adjustCounts(delta: number, hiddenDelta: number) {
    setBanks(
      (list) =>
        list?.map((b) =>
          b.id === bankId
            ? {
                ...b,
                questionCount: b.questionCount + delta,
                hiddenCount: b.hiddenCount + hiddenDelta,
              }
            : b,
        ) ?? null,
    );
  }

  const ready = useMemo(
    () => questions.filter((q) => !q.hidden && questionGaps(q.body).length === 0).length,
    [questions],
  );

  if (banks === null) return <p className="text-muted-foreground">Đang tải…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Ngân hàng câu hỏi</h2>
          <Button size="sm" onClick={() => setBankDialog({})}>
            <Plus />
            Tạo
          </Button>
        </div>
        {banks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Chưa có ngân hàng nào. Mỗi ngân hàng là một nhóm câu tương đương nhau, ví dụ “Đường
            thẳng song song – nhận biết”.
          </p>
        )}
        <ul className="grid gap-1">
          {banks.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setBankId(b.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${b.id === bankId ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <div className="font-medium">{b.title}</div>
                <div className="text-xs opacity-80">
                  {b.topic ? `${b.topic} · ` : ""}
                  {b.questionCount} câu{b.hiddenCount ? ` (${b.hiddenCount} ẩn)` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 rounded-lg border bg-card p-4">
        {error && (
          <p className="error-note mb-3" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-3 text-sm text-green-700" role="status">
            {notice}
          </p>
        )}
        {!bank ? (
          <p className="text-muted-foreground">Chọn hoặc tạo một ngân hàng để soạn câu hỏi.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">{bank.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {bank.topic ? `${bank.topic} · ` : ""}
                  {questions.length} câu · {ready} câu sẵn sàng dùng trong đề
                </p>
                {bank.description && <p className="mt-1 text-sm">{bank.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setBankDialog({ edit: bank })}>
                  <Pencil />
                  Sửa
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete("bank")}>
                  <Trash2 />
                  Xóa
                </Button>
              </div>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Thêm câu:</span>
              {(["mcq", "tf", "short"] as QuestionKind[]).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing({ level: "nb", topic: bank.topic, body: emptyBody(k) })}
                >
                  <Plus />
                  {KIND_LABEL[k]}
                </Button>
              ))}
              <Button size="sm" onClick={() => setImporting(true)}>
                <FileUp />
                Nhập từ Word
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAnswers((v) => !v)}>
                {showAnswers ? <EyeOff /> : <Eye />}
                {showAnswers ? "Ẩn đáp án" : "Hiện đáp án"}
              </Button>
            </div>
            <div
              role="tablist"
              aria-label="Lọc theo dạng câu"
              className="mb-3 flex flex-wrap gap-1 border-b"
            >
              {(["all", "mcq", "tf", "short"] as const).map((k) => {
                const count =
                  k === "all" ? questions.length : questions.filter((q) => q.kind === k).length;
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === k ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    {k === "all" ? "Tất cả" : KIND_LABEL[k]} ({count})
                  </button>
                );
              })}
            </div>
            {questions.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Ngân hàng chưa có câu nào. Nên có ít nhất 3 câu tương đương để mỗi học sinh nhận câu
                khác nhau.
              </p>
            ) : (
              <div className="grid gap-5">
                {(["mcq", "tf", "short"] as QuestionKind[])
                  .filter((k) => tab === "all" || tab === k)
                  .map((kind) => {
                    const group = questions.filter((q) => q.kind === kind);
                    if (!group.length)
                      return tab === kind ? (
                        <p
                          key={kind}
                          className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
                        >
                          Chưa có câu {KIND_LABEL[kind].toLowerCase()} trong ngân hàng này.
                        </p>
                      ) : null;
                    return (
                      <section key={kind}>
                        <h3 className="mb-2 font-semibold">
                          {PART_TITLE[kind]} · {group.length} câu
                        </h3>
                        <ol className="grid gap-3">
                          {group.map((q, i) => {
                            const gaps = questionGaps(q.body);
                            return (
                              <li
                                key={q.id}
                                className={`rounded-lg border p-3 ${q.hidden ? "opacity-60" : ""}`}
                              >
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-semibold">Câu {i + 1}</span>
                                  <span className="rounded bg-muted px-1.5 py-0.5">
                                    {KIND_LABEL[q.kind]}
                                  </span>
                                  <span className="rounded bg-muted px-1.5 py-0.5">
                                    {LEVEL_LABEL[q.level]}
                                  </span>
                                  {q.topic && (
                                    <span className="rounded bg-muted px-1.5 py-0.5">
                                      {q.topic}
                                    </span>
                                  )}
                                  {q.hidden && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                                      Đang ẩn
                                    </span>
                                  )}
                                  {gaps.length > 0 && (
                                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-900">
                                      {gaps[0]}
                                    </span>
                                  )}
                                  <span className="ml-auto flex gap-0.5">
                                    <IconButton
                                      title="Lên"
                                      disabled={busy || i === 0}
                                      onClick={() => run(() => move(q.id, -1))}
                                      icon={<ArrowUp />}
                                    />
                                    <IconButton
                                      title="Xuống"
                                      disabled={busy || i === group.length - 1}
                                      onClick={() => run(() => move(q.id, 1))}
                                      icon={<ArrowDown />}
                                    />
                                    <IconButton
                                      title="Sửa"
                                      onClick={() =>
                                        setEditing({
                                          id: q.id,
                                          level: q.level,
                                          topic: q.topic,
                                          body: q.body,
                                        })
                                      }
                                      icon={<Pencil />}
                                    />
                                    <IconButton
                                      title="Nhân bản / chép sang ngân hàng khác"
                                      disabled={busy}
                                      onClick={() => setCopying(q)}
                                      icon={<Copy />}
                                    />
                                    <IconButton
                                      title={
                                        q.hidden
                                          ? "Hiện lại (dùng trong đề)"
                                          : "Ẩn (không dùng trong đề)"
                                      }
                                      disabled={busy}
                                      onClick={() =>
                                        run(async () => {
                                          await setQuestionHidden(q.id, !q.hidden);
                                          setQuestions((list) =>
                                            list.map((x) =>
                                              x.id === q.id ? { ...x, hidden: !q.hidden } : x,
                                            ),
                                          );
                                          adjustCounts(0, q.hidden ? -1 : 1);
                                        })
                                      }
                                      icon={q.hidden ? <Eye /> : <EyeOff />}
                                    />
                                    <IconButton
                                      title="Xóa"
                                      disabled={busy}
                                      onClick={() => setConfirmDelete(q)}
                                      icon={<Trash2 />}
                                    />
                                  </span>
                                </div>
                                <QuestionView body={q.body} showAnswer={showAnswers} />
                              </li>
                            );
                          })}
                        </ol>
                      </section>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </section>

      <Dialog open={bankDialog !== null} onOpenChange={(o) => !o && !busy && setBankDialog(null)}>
        <DialogContent>
          {bankDialog && (
            <BankForm
              initial={bankDialog.edit}
              busy={busy}
              onSubmit={(v) =>
                run(async () => {
                  const id = await saveBank({
                    ...v,
                    ...(bankDialog.edit ? { id: bankDialog.edit.id } : {}),
                  });
                  await loadBanks();
                  setBankId(id);
                  setBankDialog(null);
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && !busy && setConfirmDelete(null)}
      >
        <DialogContent>
          {confirmDelete === "bank" && bank ? (
            <>
              <DialogTitle>Xóa ngân hàng “{bank.title}”?</DialogTitle>
              <DialogDescription>
                {bank.questionCount} câu hỏi trong ngân hàng sẽ bị xóa và không khôi phục được.
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>Xóa câu hỏi này?</DialogTitle>
              <DialogDescription>
                Không khôi phục được. Nếu chỉ muốn không dùng câu này trong đề, hãy bấm Ẩn.
              </DialogDescription>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (confirmDelete === "bank" && bank) {
                    await deleteBank(bank.id);
                    setBankId("");
                    setConfirmDelete(null);
                    await refresh();
                  } else if (confirmDelete && confirmDelete !== "bank") {
                    const gone = confirmDelete;
                    await deleteQuestion(gone.id);
                    setQuestions((list) => list.filter((x) => x.id !== gone.id));
                    adjustCounts(-1, gone.hidden ? -1 : 0);
                    setConfirmDelete(null);
                  }
                })
              }
            >
              Xóa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={copying !== null} onOpenChange={(o) => !o && !busy && setCopying(null)}>
        <DialogContent>
          {copying && (
            <CopyForm
              banks={banks}
              currentId={bankId}
              busy={busy}
              onSubmit={(toId) =>
                run(async () => {
                  const count =
                    toId === bankId
                      ? questions.length
                      : (banks.find((b) => b.id === toId)?.questionCount ?? 0);
                  await copyQuestion(copying, toId, count + 1);
                  setCopying(null);
                  await refresh();
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={importing} onOpenChange={(o) => !o && !busy && setImporting(false)}>
        <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
          {importing && bank && (
            <ImportWord
              userId={userId}
              bankTitle={bank.title}
              defaultTopic={bank.topic}
              busy={busy}
              onClose={() => setImporting(false)}
              onSave={(list) =>
                run(async () => {
                  // one request for the whole file, positions keep the order of the file
                  await saveQuestions(
                    list.map((q) => ({
                      bankId: bank.id,
                      level: q.level,
                      topic: q.topic,
                      body: q.body,
                    })),
                    nextPosition(),
                  );
                  setImporting(false);
                  await refresh();
                  setNotice(`Đã thêm ${list.length} câu từ file Word vào “${bank.title}”.`);
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && !busy && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          {editing && bank && (
            <QuestionEditor
              userId={userId}
              initial={editing}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={(e) =>
                run(async () => {
                  await saveQuestion(
                    {
                      ...(e.id ? { id: e.id } : {}),
                      bankId: bank.id,
                      level: e.level,
                      topic: e.topic,
                      body: e.body,
                    },
                    nextPosition(),
                  );
                  setEditing(null);
                  // an edit only changes this bank's list; a new question also changes the count
                  if (e.id) await loadQuestions(bankId);
                  else await refresh();
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconButton({
  title,
  icon,
  onClick,
  disabled,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 w-7 p-0"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}

function BankForm({
  initial,
  busy,
  onSubmit,
}: {
  initial?: BankSummary | undefined;
  busy: boolean;
  onSubmit: (v: { title: string; topic: string; description: string }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  return (
    <>
      <DialogTitle>{initial ? "Sửa ngân hàng" : "Tạo ngân hàng câu hỏi"}</DialogTitle>
      <DialogDescription>
        Các câu trong cùng một ngân hàng nên tương đương nhau về dạng, mức độ và điểm, vì mỗi học
        sinh sẽ được rút ngẫu nhiên một câu.
      </DialogDescription>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ title, topic, description });
        }}
      >
        <label>
          Tên ngân hàng
          <Input
            required
            maxLength={150}
            placeholder="Ví dụ: Hai đường thẳng song song – nhận biết"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Chủ đề (gắn mặc định cho câu mới)
          <Input
            maxLength={150}
            placeholder="Ví dụ: Bài 11 – Hai đường thẳng song song"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <label>
          Ghi chú
          <Textarea
            maxLength={1000}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <Button disabled={busy}>{busy ? "Đang lưu…" : initial ? "Lưu" : "Tạo"}</Button>
      </form>
    </>
  );
}

function CopyForm({
  banks,
  currentId,
  busy,
  onSubmit,
}: {
  banks: BankSummary[];
  currentId: string;
  busy: boolean;
  onSubmit: (bankId: string) => void;
}) {
  const [target, setTarget] = useState(currentId);
  return (
    <>
      <DialogTitle>Nhân bản câu hỏi</DialogTitle>
      <DialogDescription>
        Bản sao được thêm vào cuối ngân hàng bạn chọn; sửa bản sao không ảnh hưởng câu gốc.
      </DialogDescription>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(target);
        }}
      >
        <label>
          Chép vào
          <select
            className="entry-select"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
                {b.id === currentId ? " (ngân hàng này)" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={busy}>Nhân bản</Button>
      </form>
    </>
  );
}
