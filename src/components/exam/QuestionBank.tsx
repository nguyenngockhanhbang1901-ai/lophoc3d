import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Box,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  MediaDialog,
  type MediaKind,
  type MediaLibrary,
  type MediaPick,
} from "@/components/slides/MediaDialog";
import {
  deleteMedia,
  listMedia,
  loadMediaSrc,
  renameMedia,
  saveMedia,
} from "@/lib/slides/media-library";
import {
  copyQuestion,
  deleteBank,
  deleteQuestion,
  listBanks,
  listQuestions,
  reorderQuestions,
  saveBank,
  saveQuestion,
  setQuestionHidden,
  type BankSummary,
} from "@/lib/exam/bank-store";
import {
  KIND_LABEL,
  LEVEL_LABEL,
  OPTION_LETTERS,
  STATEMENT_LETTERS,
  changeKind,
  emptyBody,
  questionGaps,
  type QuestionBody,
  type QuestionKind,
  type QuestionLevel,
  type QuestionRow,
} from "@/lib/exam/questions";
import { scoreShare } from "@/lib/exam/grading";
import { MathField, QuestionView } from "./ExamMath";

type Editing = { id?: string; level: QuestionLevel; topic: string; body: QuestionBody };

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

export function QuestionBank({ userId }: { userId: string }) {
  const [banks, setBanks] = useState<BankSummary[] | null>(null);
  const [bankId, setBankId] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [bankDialog, setBankDialog] = useState<{ edit?: BankSummary } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<"bank" | QuestionRow | null>(null);
  const [copying, setCopying] = useState<QuestionRow | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [showAnswers, setShowAnswers] = useState(true);
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
    try {
      await task();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => Promise.all([loadBanks(), loadQuestions(bankId)]);

  async function move(index: number, delta: number) {
    const ids = questions.map((q) => q.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    setQuestions(ids.map((id) => questions.find((q) => q.id === id)!));
    await reorderQuestions(ids);
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
            <div className="mb-3 flex flex-wrap gap-2">
              {(["mcq", "tf", "short"] as QuestionKind[]).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={k === "mcq" ? "default" : "outline"}
                  onClick={() => setEditing({ level: "nb", topic: bank.topic, body: emptyBody(k) })}
                >
                  <Plus />
                  {KIND_LABEL[k]}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setShowAnswers((v) => !v)}>
                {showAnswers ? <EyeOff /> : <Eye />}
                {showAnswers ? "Ẩn đáp án" : "Hiện đáp án"}
              </Button>
            </div>
            {questions.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Ngân hàng chưa có câu nào. Nên có ít nhất 3 câu tương đương để mỗi học sinh nhận câu
                khác nhau.
              </p>
            ) : (
              <ol className="grid gap-3">
                {questions.map((q, i) => {
                  const gaps = questionGaps(q.body);
                  return (
                    <li
                      key={q.id}
                      className={`rounded-lg border p-3 ${q.hidden ? "opacity-60" : ""}`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold">Câu {i + 1}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5">{KIND_LABEL[q.kind]}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5">
                          {LEVEL_LABEL[q.level]}
                        </span>
                        {q.topic && (
                          <span className="rounded bg-muted px-1.5 py-0.5">{q.topic}</span>
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
                            onClick={() => run(() => move(i, -1))}
                            icon={<ArrowUp />}
                          />
                          <IconButton
                            title="Xuống"
                            disabled={busy || i === questions.length - 1}
                            onClick={() => run(() => move(i, 1))}
                            icon={<ArrowDown />}
                          />
                          <IconButton
                            title="Sửa"
                            onClick={() =>
                              setEditing({ id: q.id, level: q.level, topic: q.topic, body: q.body })
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
                              q.hidden ? "Hiện lại (dùng trong đề)" : "Ẩn (không dùng trong đề)"
                            }
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await setQuestionHidden(q.id, !q.hidden);
                                await refresh();
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
                  } else if (confirmDelete && confirmDelete !== "bank")
                    await deleteQuestion(confirmDelete.id);
                  setConfirmDelete(null);
                  await refresh();
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
                    questions.length + 1,
                  );
                  setEditing(null);
                  await refresh();
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

function QuestionEditor({
  userId,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  userId: string;
  initial: Editing;
  busy: boolean;
  onSave: (e: Editing) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Editing>(initial);
  const [media, setMedia] = useState<MediaKind | null>(null);
  const [trial, setTrial] = useState("");
  const body = draft.body;
  const d = body.data;
  const gaps = questionGaps(body);
  const setBody = (b: QuestionBody) => setDraft((x) => ({ ...x, body: b }));
  const setData = (data: QuestionBody["data"]) => setBody({ ...body, data });

  const library = useMemo<MediaLibrary>(
    () => ({
      list: (type) => listMedia(supabase, userId, type),
      load: (key) => loadMediaSrc(supabase, userId, key),
      save: (type, name, src, thumb) => saveMedia(supabase, userId, type, name, src, thumb),
      rename: (key, name) => renameMedia(supabase, userId, key, name),
      remove: (key) => deleteMedia(supabase, userId, key),
    }),
    [userId],
  );

  function pickMedia(pick: MediaPick, kind: MediaKind) {
    setMedia(null);
    if (kind === "image" && pick.src)
      setBody({
        ...body,
        media: { kind: "image", src: pick.src, ...(pick.alt ? { alt: pick.alt } : {}) },
      });
    if (kind === "model3d" && (pick.src || pick.modelId))
      setBody({
        ...body,
        media: {
          kind: "model3d",
          ...(pick.src ? { src: pick.src } : {}),
          ...(pick.modelId ? { modelId: pick.modelId } : {}),
          ...(pick.alt ? { alt: pick.alt } : {}),
        },
      });
  }

  const trialShare =
    d.kind === "short" && trial.trim() ? scoreShare(d, { kind: "short", text: trial }) : null;

  return (
    <>
      <DialogTitle>{initial.id ? "Sửa câu hỏi" : "Câu hỏi mới"}</DialogTitle>
      <DialogDescription>
        Gõ công thức giữa hai dấu $, ví dụ <code>$a \ss (\alpha)$</code>; công thức đứng riêng một
        dòng thì dùng <code>$$…$$</code>. Có thể bấm các nút ký hiệu.
      </DialogDescription>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              Dạng câu
              <select
                className="entry-select"
                value={d.kind}
                onChange={(e) => setBody(changeKind(body, e.target.value as QuestionKind))}
              >
                {(Object.keys(KIND_LABEL) as QuestionKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Mức độ
              <select
                className="entry-select"
                value={draft.level}
                onChange={(e) => setDraft({ ...draft, level: e.target.value as QuestionLevel })}
              >
                {(Object.keys(LEVEL_LABEL) as QuestionLevel[]).map((k) => (
                  <option key={k} value={k}>
                    {LEVEL_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Chủ đề
              <Input
                maxLength={150}
                value={draft.topic}
                onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
              />
            </label>
          </div>

          <MathField
            label="Đề bài"
            rows={4}
            value={body.stem}
            onChange={(stem) => setBody({ ...body, stem })}
          />

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Hình minh họa:</span>
            {body.media ? (
              <>
                <span>{body.media.kind === "image" ? "Ảnh" : "Mô hình 3D"}</span>
                <Button size="sm" variant="ghost" onClick={() => setBody({ ...body, media: null })}>
                  <X />
                  Bỏ
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setMedia("image")}>
                  <ImagePlus />
                  Chèn ảnh
                </Button>
                <Button size="sm" variant="outline" onClick={() => setMedia("model3d")}>
                  <Box />
                  Chèn mô hình 3D
                </Button>
              </>
            )}
          </div>

          {d.kind === "mcq" && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                Các phương án — chọn nút tròn ở phương án đúng
              </legend>
              {d.options.map((o, i) => (
                <div key={i} className="flex items-start gap-2">
                  <label className="mt-7 flex items-center gap-1 text-sm font-semibold">
                    <input
                      type="radio"
                      name="correct"
                      checked={d.correct === i}
                      onChange={() => setData({ ...d, correct: i })}
                    />
                    {OPTION_LETTERS[i]}
                  </label>
                  <div className="flex-1">
                    <MathField
                      label={`Phương án ${OPTION_LETTERS[i]}`}
                      rows={1}
                      toolbar={i === 0}
                      value={o}
                      onChange={(v) => {
                        const options = [...d.options] as typeof d.options;
                        options[i] = v;
                        setData({ ...d, options });
                      }}
                    />
                  </div>
                </div>
              ))}
            </fieldset>
          )}

          {d.kind === "tf" && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                Bốn ý — chọn Đúng hoặc Sai cho từng ý
              </legend>
              {d.statements.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-7 font-semibold">{STATEMENT_LETTERS[i]})</span>
                  <div className="flex-1">
                    <MathField
                      label={`Ý ${STATEMENT_LETTERS[i]}`}
                      rows={1}
                      toolbar={i === 0}
                      value={s}
                      onChange={(v) => {
                        const statements = [...d.statements] as typeof d.statements;
                        statements[i] = v;
                        setData({ ...d, statements });
                      }}
                    />
                  </div>
                  <div className="mt-6 flex flex-col gap-1 text-sm">
                    {[true, false].map((value) => (
                      <label key={String(value)} className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`tf-${i}`}
                          checked={d.correct[i] === value}
                          onChange={() => {
                            const correct = [...d.correct] as typeof d.correct;
                            correct[i] = value;
                            setData({ ...d, correct });
                          }}
                        />
                        {value ? "Đúng" : "Sai"}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Chấm theo số ý đúng như đề thi tốt nghiệp: 1 ý 10%, 2 ý 25%, 3 ý 50%, 4 ý 100% điểm
                của câu.
              </p>
            </fieldset>
          )}

          {d.kind === "short" && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Đáp án</legend>
              <label className="flex items-center gap-2 text-sm">
                Kiểu đáp án
                <select
                  className="entry-select"
                  value={d.mode}
                  onChange={(e) => setData({ ...d, mode: e.target.value as "number" | "text" })}
                >
                  <option value="number">Số (so theo giá trị)</option>
                  <option value="text">Chữ (không phân biệt hoa thường, dấu)</option>
                </select>
              </label>
              {d.answers.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="max-w-xs font-mono"
                    placeholder={d.mode === "number" ? "Ví dụ: 3,5 hoặc 1/2" : "Ví dụ: song song"}
                    value={a}
                    maxLength={100}
                    onChange={(e) => {
                      const answers = [...d.answers];
                      answers[i] = e.target.value;
                      setData({ ...d, answers });
                    }}
                  />
                  {d.answers.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Bỏ đáp án này"
                      onClick={() =>
                        setData({ ...d, answers: d.answers.filter((_, j) => j !== i) })
                      }
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ))}
              {d.answers.length < 10 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  onClick={() => setData({ ...d, answers: [...d.answers, ""] })}
                >
                  <Plus />
                  Thêm đáp án được chấp nhận
                </Button>
              )}
              {d.mode === "number" && (
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  Sai số cho phép ±
                  <Input
                    className="w-28"
                    inputMode="decimal"
                    placeholder="0"
                    value={d.tolerance === null ? "" : String(d.tolerance).replace(".", ",")}
                    onChange={(e) => {
                      const raw = e.target.value.replace(",", ".").trim();
                      const n = Number(raw);
                      setData({
                        ...d,
                        tolerance: raw === "" || !Number.isFinite(n) || n < 0 ? null : n,
                      });
                    }}
                  />
                  <span className="text-muted-foreground">để trống = phải đúng giá trị</span>
                </label>
              )}
              <label className="flex flex-wrap items-center gap-2 text-sm">
                Thử nhập như học sinh
                <Input
                  className="w-40 font-mono"
                  value={trial}
                  onChange={(e) => setTrial(e.target.value)}
                />
                {trialShare !== null && (
                  <span className={trialShare ? "text-green-700" : "text-destructive"}>
                    {trialShare ? "Được chấm đúng" : "Bị chấm sai"}
                  </span>
                )}
              </label>
            </fieldset>
          )}

          <MathField
            label="Lời giải (học sinh chỉ thấy khi giáo viên cho xem lại)"
            rows={3}
            value={body.explanation}
            onChange={(explanation) => setBody({ ...body, explanation })}
          />
        </div>

        <aside className="grid content-start gap-2">
          <div className="text-sm font-medium">Xem trước</div>
          <div className="rounded-lg border p-3">
            <QuestionView body={body} showAnswer />
          </div>
          {gaps.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              Câu này chưa dùng được trong đề:
              <ul className="list-disc pl-4">
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              Vẫn có thể lưu để soạn tiếp.
            </div>
          )}
        </aside>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button disabled={busy} onClick={() => onSave(draft)}>
          {busy ? "Đang lưu…" : "Lưu câu hỏi"}
        </Button>
      </div>
      <MediaDialog
        kind={media}
        library={library}
        onPick={pickMedia}
        onClose={() => setMedia(null)}
      />
    </>
  );
}
