// "Đề từ file Word": exams made straight from a teacher's Word file — read, reviewed until every
// question is complete, given points and shuffle options, then assigned like any matrix exam.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, FileText, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  KIND_ORDER,
  THPT_POINTS,
  drawExam,
  formatPoints,
  seededRandom,
  randomSeed,
  withOptionOrder,
  type DrawnExam,
} from "@/lib/exam/matrix";
import type { MatrixRow } from "@/lib/exam/matrix-store";
import {
  KIND_LABEL,
  type QuestionBody,
  type QuestionKind,
  type QuestionLevel,
} from "@/lib/exam/questions";
import {
  createExamFromWord,
  fixWordExamQuestion,
  getWordExamQuestions,
  removeWordExam,
} from "@/lib/exam/word-exam.functions";
import { ImportWord, type ImportedForSave } from "./ImportWord";
import { QuestionView } from "./ExamMath";
import { QuestionEditor, type Editing } from "./QuestionEditor";

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

const PART: Record<QuestionKind, string> = {
  mcq: "Phần I – trắc nghiệm",
  tf: "Phần II – đúng/sai",
  short: "Phần III – trả lời ngắn",
};

export function WordExams({
  userId,
  exams,
  onChanged,
  onAssign,
}: {
  userId: string;
  /** matrices with purpose word_exam */
  exams: MatrixRow[];
  onChanged: () => Promise<void> | void;
  onAssign: (matrixId: string) => void;
}) {
  const [step, setStep] = useState<"closed" | "file" | "settings">("closed");
  const [picked, setPicked] = useState<{ questions: ImportedForSave[]; fileName: string } | null>(
    null,
  );
  const [viewing, setViewing] = useState<MatrixRow | null>(null);
  const [deleting, setDeleting] = useState<MatrixRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remove = useServerFn(removeWordExam);
  const create = useServerFn(createExamFromWord);

  return (
    <section id="de-thi-word" className="grid scroll-mt-20 gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileText size={18} />
          Đề từ file Word
        </h2>
        <span className="text-sm text-muted-foreground">
          Gửi file Word là có ngay đề để giao, không cần ngân hàng và ma trận. Mỗi học sinh nhận các
          câu, phương án và ý đúng/sai theo thứ tự đảo riêng.
        </span>
        <Button className="ml-auto" size="sm" onClick={() => setStep("file")}>
          <FileText />
          Tạo đề từ file Word
        </Button>
      </div>
      {error && <p className="error-note">{error}</p>}
      {exams.length > 0 && (
        <ul className="grid gap-1">
          {exams.map((m) => {
            const count = (k: QuestionKind) => m.slots.filter((s) => s.kind === k).length;
            const total = m.slots.reduce((t, s) => t + s.points, 0);
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
              >
                <span className="font-medium">{m.title}</span>
                <span className="text-xs text-muted-foreground">
                  {m.source_file && `${m.source_file} · `}
                  {m.slots.length} câu ({count("mcq")} TN, {count("tf")} Đ/S, {count("short")} TLN)
                  · {formatPoints(total)} điểm
                  {m.shuffle_order && " · đảo câu"}
                  {m.shuffle_options && " · đảo phương án"}
                  {m.shuffle_statements && " · đảo ý a–d"}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(m)}>
                    <Eye />
                    Xem / sửa
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onAssign(m.id)}>
                    <Send />
                    Giao bài
                  </Button>
                  <Button size="sm" variant="ghost" title="Xóa đề" onClick={() => setDeleting(m)}>
                    <Trash2 />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={step === "file"} onOpenChange={(o) => !o && setStep("closed")}>
        <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
          {step === "file" && (
            <ImportWord
              mode="exam"
              userId={userId}
              bankTitle=""
              defaultTopic=""
              busy={false}
              onClose={() => setStep("closed")}
              onSave={(questions, fileName) => {
                setPicked({ questions, fileName });
                setStep("settings");
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={step === "settings"} onOpenChange={(o) => !o && !busy && setStep("closed")}>
        <DialogContent className="max-h-[94vh] max-w-3xl overflow-y-auto">
          {step === "settings" && picked && (
            <ExamSettings
              picked={picked}
              busy={busy}
              onBack={() => setStep("file")}
              onCreate={async (v) => {
                setBusy(true);
                try {
                  const r = await create({ data: v });
                  setStep("closed");
                  setPicked(null);
                  await onChanged();
                  onAssign(r.id);
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
          {viewing && <ExamQuestions userId={userId} exam={viewing} onChanged={onChanged} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && !busy && setDeleting(null)}>
        <DialogContent>
          <DialogTitle>Xóa đề “{deleting?.title}”?</DialogTitle>
          <DialogDescription>
            Các câu hỏi của đề cũng bị xóa. Đề đang được dùng ở bài giao thì phải xóa bài giao
            trước.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (!deleting) return;
                setBusy(true);
                setError("");
                remove({ data: { id: deleting.id } })
                  .then(async () => {
                    setDeleting(null);
                    await onChanged();
                  })
                  .catch((e) => {
                    setDeleting(null);
                    setError(message(e));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Xóa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

interface CreateValues {
  title: string;
  sourceFile: string;
  questions: { level: QuestionLevel; body: QuestionBody }[];
  points: Record<QuestionKind, number>;
  shuffleOptions: boolean;
  shuffleOrder: boolean;
  shuffleStatements: boolean;
}

function ExamSettings({
  picked,
  busy,
  onBack,
  onCreate,
}: {
  picked: { questions: ImportedForSave[]; fileName: string };
  busy: boolean;
  onBack: () => void;
  onCreate: (v: CreateValues) => Promise<void>;
}) {
  const counts = useMemo(() => {
    const c: Record<QuestionKind, number> = { mcq: 0, tf: 0, short: 0 };
    for (const q of picked.questions) c[q.body.data.kind] += 1;
    return c;
  }, [picked]);
  const [title, setTitle] = useState(picked.fileName.replace(/\.docx$/i, "").slice(0, 150));
  const [points, setPoints] = useState<Record<QuestionKind, number>>({ ...THPT_POINTS });
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [shuffleOrder, setShuffleOrder] = useState(true);
  const [shuffleStatements, setShuffleStatements] = useState(true);
  const [error, setError] = useState("");
  const total = KIND_ORDER.reduce((t, k) => t + counts[k] * points[k], 0);
  const evenly = () => {
    const n = picked.questions.length;
    const each = Math.round((10 / n) * 1000) / 1000;
    setPoints({ mcq: each, tf: each, short: each });
  };
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        onCreate({
          title,
          sourceFile: picked.fileName,
          questions: picked.questions.map((q) => ({ level: q.level, body: q.body })),
          points,
          shuffleOptions,
          shuffleOrder,
          shuffleStatements,
        }).catch((err) => setError(message(err)));
      }}
    >
      <DialogTitle>Cài đặt đề</DialogTitle>
      <DialogDescription>
        {picked.questions.length} câu từ file {picked.fileName}. Tạo xong, màn hình giao bài mở ra
        để chọn lớp, giờ và các luật làm bài như mọi bài giao khác.
      </DialogDescription>
      <label className="grid gap-1 text-sm">
        Tên đề
        <Input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="grid gap-2 rounded-md border p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Điểm mỗi câu</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPoints({ ...THPT_POINTS })}
          >
            Theo đề tốt nghiệp (0,25 / 1 / 0,5)
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={evenly}>
            Chia đều 10 điểm
          </Button>
        </div>
        {KIND_ORDER.filter((k) => counts[k] > 0).map((k) => (
          <label key={k} className="flex flex-wrap items-center gap-2">
            <span className="w-48">{PART[k]}</span>
            <span className="w-16 text-muted-foreground">{counts[k]} câu ×</span>
            <Input
              type="number"
              className="w-24"
              min={0}
              max={100}
              step={0.05}
              value={points[k]}
              onChange={(e) =>
                setPoints((p) => ({ ...p, [k]: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
            <span className="text-muted-foreground">
              = {formatPoints(counts[k] * points[k])} điểm
            </span>
          </label>
        ))}
        <p className={Math.abs(total - 10) < 1e-6 ? "text-green-700" : "text-amber-800"}>
          Tổng: {formatPoints(total)} điểm
          {Math.abs(total - 10) >= 1e-6 && " (điểm bài vẫn được quy về thang điểm khi giao bài)"}
        </p>
      </div>
      <div className="grid gap-1 rounded-md border p-3 text-sm">
        <span className="font-medium">Đảo đề cho từng học sinh</span>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shuffleOrder}
            onChange={(e) => setShuffleOrder(e.target.checked)}
          />
          Đảo thứ tự câu trong từng phần (Phần I, II, III vẫn giữ thứ tự)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shuffleOptions}
            onChange={(e) => setShuffleOptions(e.target.checked)}
          />
          Đảo phương án A–D (trắc nghiệm)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shuffleStatements}
            onChange={(e) => setShuffleStatements(e.target.checked)}
          />
          Đảo thứ tự 4 ý a–d (đúng/sai)
        </label>
      </div>
      <Preview
        questions={picked.questions}
        points={points}
        shuffle={{ shuffleOptions, shuffleOrder, shuffleStatements }}
      />
      {error && <p className="error-note">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onBack}>
          Quay lại duyệt câu
        </Button>
        <Button disabled={busy || !title.trim()}>
          {busy ? "Đang tạo đề…" : "Tạo đề và giao bài"}
        </Button>
      </div>
    </form>
  );
}

/** What one student might receive, with the same drawing code the server uses. */
function Preview({
  questions,
  points,
  shuffle,
}: {
  questions: ImportedForSave[];
  points: Record<QuestionKind, number>;
  shuffle: { shuffleOptions: boolean; shuffleOrder: boolean; shuffleStatements: boolean };
}) {
  const [seed, setSeed] = useState<number | null>(null);
  const exam: DrawnExam | null = useMemo(() => {
    if (seed === null) return null;
    const ids = questions.map((_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const slots = KIND_ORDER.flatMap((k) =>
      questions.flatMap((q, i) =>
        q.body.data.kind === k
          ? [{ bankId: ids[0]!, kind: k, level: q.level, points: points[k], questionId: ids[i]! }]
          : [],
      ),
    );
    const pool = questions.map((q, i) => ({
      id: ids[i]!,
      bankId: ids[0]!,
      kind: q.body.data.kind,
      level: q.level,
      position: i,
    }));
    return drawExam(slots, pool, seededRandom(seed), shuffle);
  }, [seed, questions, points, shuffle]);
  const index = (id: string) => Number(id.slice(-12));
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => setSeed(randomSeed())}
      >
        <Eye />
        {exam ? "Xem thử đề của một học sinh khác" : "Xem thử đề của một học sinh"}
      </Button>
      {exam && (
        <ol className="grid max-h-[45vh] gap-2 overflow-y-auto rounded-md border p-2">
          {exam.items.map((it, n) => {
            const body = questions[index(it.questionId)]!.body;
            return (
              <li key={it.questionId} className="rounded border p-2">
                <div className="mb-1 text-xs text-muted-foreground">
                  Câu {n + 1} · {KIND_LABEL[it.kind]} · mã đề {exam.code}
                </div>
                <QuestionView
                  body={withOptionOrder(body, it.optionOrder, it.statementOrder)}
                  showAnswer
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ExamQuestions({
  userId,
  exam,
  onChanged,
}: {
  userId: string;
  exam: MatrixRow;
  onChanged: () => Promise<void> | void;
}) {
  const load = useServerFn(getWordExamQuestions);
  const fix = useServerFn(fixWordExamQuestion);
  const [data, setData] = useState<{
    locked: boolean;
    questions: { id: string; points: number; level: QuestionLevel; body: QuestionBody | null }[];
  } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = () =>
    load({ data: { id: exam.id } })
      .then((r) => setData(r as typeof data))
      .catch((e) => setError(message(e)));
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id]);
  const current = editing === null ? null : data?.questions[editing];
  return (
    <div className="grid gap-3">
      <DialogTitle>{exam.title}</DialogTitle>
      <DialogDescription>
        {data?.locked
          ? "Đã có học sinh làm đề này nên chỉ xem được, không sửa câu hỏi nữa."
          : "Sửa được từng câu cho đến khi có học sinh bắt đầu làm."}
      </DialogDescription>
      {error && <p className="error-note">{error}</p>}
      {!data ? (
        <p>Đang tải…</p>
      ) : (
        <ol className="grid gap-2">
          {data.questions.map((q, i) => (
            <li key={q.id} className="rounded-md border p-2">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Câu {i + 1}</span>
                {q.body && KIND_LABEL[q.body.data.kind]} · {formatPoints(q.points)} điểm
                {!data.locked && q.body && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7"
                    onClick={() => setEditing(i)}
                  >
                    <Pencil />
                    Sửa
                  </Button>
                )}
              </div>
              {q.body ? <QuestionView body={q.body} showAnswer /> : <p>(Câu hỏi đã bị xóa)</p>}
            </li>
          ))}
        </ol>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && !busy && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          {current?.body && (
            <QuestionEditor
              userId={userId}
              initial={{ level: current.level, topic: "", body: current.body }}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={(e: Editing) => {
                setBusy(true);
                setError("");
                fix({ data: { id: exam.id, questionId: current.id, level: e.level, body: e.body } })
                  .then(async () => {
                    setEditing(null);
                    await refresh();
                    await onChanged();
                  })
                  .catch((err) => setError(message(err)))
                  .finally(() => setBusy(false));
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
