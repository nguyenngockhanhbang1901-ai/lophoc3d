import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CopyPlus,
  Dices,
  Eye,
  EyeOff,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { listBanks, type BankSummary } from "@/lib/exam/bank-store";
import { listTopics } from "@/lib/exam/topic-store";
import {
  LEVEL_NAME,
  bankPaths,
  buildTree,
  flatten,
  unclassified,
  type BankRef,
  type Topic,
  type TopicLevel,
} from "@/lib/exam/topics";
import {
  deleteMatrix,
  getQuestionBodies,
  listMatrices,
  listPoolQuestions,
  saveMatrix,
  type MatrixRow,
} from "@/lib/exam/matrix-store";
import {
  KIND_ORDER,
  THPT_POINTS,
  analyzeMatrix,
  inSource,
  drawExam,
  formatExamCount,
  formatPoints,
  randomSeed,
  seededRandom,
  withOptionOrder,
  type DrawnExam,
  type MatrixSlot,
  type PoolQuestion,
} from "@/lib/exam/matrix";
import {
  KIND_LABEL,
  LEVEL_LABEL,
  type QuestionBody,
  type QuestionKind,
  type QuestionLevel,
} from "@/lib/exam/questions";
import { QuestionView } from "./ExamMath";

type Draft = Omit<MatrixRow, "updated_at" | "id" | "purpose" | "source_file"> & { id?: string };

const PART_TITLE: Record<QuestionKind, string> = {
  mcq: "PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn",
  tf: "PHẦN II. Câu trắc nghiệm đúng sai",
  short: "PHẦN III. Câu trắc nghiệm trả lời ngắn",
};

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

const blank = (): Draft => ({
  title: "",
  description: "",
  slots: [],
  shuffle_options: true,
  shuffle_order: false,
  shuffle_statements: false,
});

export function ExamMatrices() {
  const [matrices, setMatrices] = useState<MatrixRow[] | null>(null);
  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [pool, setPool] = useState<PoolQuestion[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, b, t] = await Promise.all([
        listMatrices(),
        listBanks(),
        listTopics().catch(() => [] as Topic[]),
      ]);
      const p = await listPoolQuestions(bankPaths(t, b));
      setMatrices(m.filter((x) => x.purpose !== "word_exam"));
      setBanks(b);
      setTopics(t);
      setPool(p);
      return m;
    } catch (e) {
      setMatrices([]);
      setError(message(e));
      return [];
    }
  }, []);
  useEffect(() => {
    void load().then((m) => {
      if (m[0]) setDraft({ ...m[0] });
    });
  }, [load]);

  const titles = useMemo(
    () => [...banks, ...topics].map((x) => ({ id: x.id, title: x.title })),
    [banks, topics],
  );
  const sources = useMemo(() => {
    const tree = buildTree(topics, banks);
    return { list: flatten(tree), loose: unclassified(topics, banks) };
  }, [topics, banks]);
  const analysis = useMemo(
    () => (draft ? analyzeMatrix(draft.slots, pool, titles) : null),
    [draft, pool, titles],
  );

  function edit(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
    setNotice("");
  }
  function editSlot(i: number, patch: Partial<MatrixSlot>) {
    if (!draft) return;
    edit({ slots: draft.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  }
  function open(next: Draft) {
    if (dirty && !window.confirm("Ma trận đang sửa chưa được lưu. Bỏ các thay đổi?")) return;
    setDraft(next);
    setDirty(false);
    setError("");
    setNotice("");
  }

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

  if (matrices === null) return <p className="text-muted-foreground">Đang tải…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Ma trận đề</h2>
          <Button size="sm" onClick={() => open(blank())}>
            <Plus />
            Tạo
          </Button>
        </div>
        {matrices.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Chưa có ma trận nào. Ma trận lưu thành mẫu để dùng lại cho nhiều lần giao bài.
          </p>
        )}
        <ul className="grid gap-1">
          {matrices.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => open({ ...m })}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${draft?.id === m.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <div className="font-medium">{m.title}</div>
                <div className="text-xs opacity-80">{m.slots.length} vị trí</div>
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
        {!draft || !analysis ? (
          <p className="text-muted-foreground">Chọn hoặc tạo một ma trận.</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
              <div className="grid gap-2">
                <Input
                  aria-label="Tên ma trận"
                  placeholder="Tên ma trận, ví dụ: Kiểm tra 15 phút – Quan hệ song song"
                  maxLength={150}
                  value={draft.title}
                  onChange={(e) => edit({ title: e.target.value })}
                />
                <Textarea
                  aria-label="Ghi chú"
                  rows={1}
                  placeholder="Ghi chú (không bắt buộc)"
                  maxLength={1000}
                  value={draft.description}
                  onChange={(e) => edit({ description: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !dirty}
                  onClick={() =>
                    run(async () => {
                      const id = await saveMatrix(draft);
                      const list = await load();
                      const saved = list.find((m) => m.id === id);
                      if (saved) setDraft({ ...saved });
                      setDirty(false);
                      setNotice("Đã lưu ma trận.");
                    })
                  }
                >
                  <Save />
                  {dirty ? "Lưu" : "Đã lưu"}
                </Button>
                <Button
                  variant="outline"
                  disabled={analysis.distinctExams === 0}
                  onClick={() => setPreview(true)}
                >
                  <Dices />
                  Xem thử đề
                </Button>
                {draft.id && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() =>
                        open({
                          title: `${draft.title} (bản sao)`,
                          description: draft.description,
                          slots: draft.slots,
                          shuffle_options: draft.shuffle_options,
                          shuffle_order: draft.shuffle_order,
                          shuffle_statements: draft.shuffle_statements,
                        })
                      }
                      title="Nhân bản ma trận"
                    >
                      <CopyPlus />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDelete(true)}
                      title="Xóa ma trận"
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <Stats analysis={analysis} />

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.shuffle_options}
                  onChange={(e) => edit({ shuffle_options: e.target.checked })}
                />
                Đảo thứ tự phương án A–D
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.shuffle_order}
                  onChange={(e) => edit({ shuffle_order: e.target.checked })}
                />
                Đảo thứ tự câu (trong từng phần)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.shuffle_statements}
                  onChange={(e) => edit({ shuffle_statements: e.target.checked })}
                />
                Đảo thứ tự 4 ý a–d (câu đúng/sai)
              </label>
              <Button
                size="sm"
                variant="ghost"
                disabled={!draft.slots.length}
                onClick={() =>
                  edit({ slots: draft.slots.map((s) => ({ ...s, points: THPT_POINTS[s.kind] })) })
                }
                title="Trắc nghiệm 0,25 · Đúng/sai 1 · Trả lời ngắn 0,5"
              >
                Đặt điểm theo đề THPT
              </Button>
            </div>

            <SlotTable
              slots={draft.slots}
              sources={sources}
              pool={pool}
              poolSizes={analysis.poolSizes}
              errorSlots={
                new Set(
                  analysis.problems
                    .filter((p) => p.severity === "error" && p.slot !== null)
                    .map((p) => p.slot!),
                )
              }
              onChange={editSlot}
              onMove={(i, d) => {
                const slots = [...draft.slots];
                const j = i + d;
                if (j < 0 || j >= slots.length) return;
                [slots[i], slots[j]] = [slots[j]!, slots[i]!];
                edit({ slots });
              }}
              onRemove={(i) => edit({ slots: draft.slots.filter((_, j) => j !== i) })}
            />
            <AddSlots
              sources={sources}
              pool={pool}
              onAdd={(added) => edit({ slots: [...draft.slots, ...added] })}
            />
          </div>
        )}
      </section>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
          {preview && draft && <Preview draft={draft} pool={pool} />}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(o) => !busy && setConfirmDelete(o)}>
        <DialogContent>
          <DialogTitle>Xóa ma trận “{draft?.title}”?</DialogTitle>
          <DialogDescription>Câu hỏi trong ngân hàng không bị ảnh hưởng.</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (draft?.id) await deleteMatrix(draft.id);
                  setConfirmDelete(false);
                  setDirty(false);
                  const list = await load();
                  setDraft(list[0] ? { ...list[0] } : null);
                })
              }
            >
              Xóa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stats({ analysis }: { analysis: ReturnType<typeof analyzeMatrix> }) {
  const errors = analysis.problems.filter((p) => p.severity === "error");
  const warnings = analysis.problems.filter((p) => p.severity === "warning");
  const items: [string, string][] = [
    [
      "Số câu",
      `${analysis.slotCount} (${KIND_ORDER.map((k) => `${analysis.byKind[k].count} ${k === "mcq" ? "TN" : k === "tf" ? "ĐS" : "TLN"}`).join(" · ")})`,
    ],
    ["Tổng điểm", formatPoints(analysis.totalPoints)],
    ["Số đề khác nhau", analysis.distinctExams ? formatExamCount(analysis.distinctExams) : "—"],
    [
      "Hai học sinh trùng trung bình",
      analysis.distinctExams
        ? `${formatPoints(Math.round(analysis.expectedShared * 10) / 10)} câu`
        : "—",
    ],
  ];
  return (
    <div className="grid gap-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-md bg-muted p-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="grid gap-1 text-sm">
          {errors.map((p) => (
            <li key={p.message} className="flex gap-2 text-destructive">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {p.message}
            </li>
          ))}
          {warnings.map((p) => (
            <li key={p.message} className="flex gap-2 text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {p.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SlotTable({
  slots,
  sources,
  pool,
  poolSizes,
  errorSlots,
  onChange,
  onMove,
  onRemove,
}: {
  slots: MatrixSlot[];
  sources: Sources;
  pool: PoolQuestion[];
  poolSizes: number[];
  errorSlots: Set<number>;
  onChange: (i: number, patch: Partial<MatrixSlot>) => void;
  onMove: (i: number, delta: number) => void;
  onRemove: (i: number) => void;
}) {
  if (!slots.length)
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Chưa có vị trí nào. Thêm vị trí ở bên dưới.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="p-2">Vị trí</th>
            <th className="p-2">Lấy từ (khối / chương / bài / dạng)</th>
            <th className="p-2">Dạng câu</th>
            <th className="p-2">Mức độ</th>
            <th className="p-2">Điểm</th>
            <th className="p-2">Câu để rút</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {slots.map((s, i) => (
            <tr
              key={i}
              className={`border-b last:border-0 ${errorSlots.has(i) ? "bg-red-50" : ""}`}
            >
              <td className="p-2 font-semibold">{i + 1}</td>
              <td className="p-2">
                <SourceSelect
                  label={`Nguồn vị trí ${i + 1}`}
                  sources={sources}
                  value={sourceValue(s)}
                  onChange={(v) => onChange(i, fromSourceValue(v))}
                />
              </td>
              <td className="p-2">
                <select
                  className="entry-select"
                  aria-label={`Dạng câu vị trí ${i + 1}`}
                  value={s.kind}
                  onChange={(e) => {
                    const kind = e.target.value as QuestionKind;
                    onChange(i, {
                      kind,
                      points: s.points === THPT_POINTS[s.kind] ? THPT_POINTS[kind] : s.points,
                    });
                  }}
                >
                  {KIND_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]} ({pool.filter((q) => inSource(s, q) && q.kind === k).length})
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <select
                  className="entry-select"
                  aria-label={`Mức độ vị trí ${i + 1}`}
                  value={s.level ?? ""}
                  onChange={(e) =>
                    onChange(i, { level: (e.target.value || null) as QuestionLevel | null })
                  }
                >
                  <option value="">Bất kỳ</option>
                  {(Object.keys(LEVEL_LABEL) as QuestionLevel[]).map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABEL[l]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <PointsInput
                  value={s.points}
                  onChange={(points) => onChange(i, { points })}
                  label={`Điểm vị trí ${i + 1}`}
                />
              </td>
              <td
                className={`p-2 ${(poolSizes[i] ?? 0) < 3 ? "font-semibold text-amber-800" : ""}`}
              >
                {poolSizes[i] ?? 0}
              </td>
              <td className="whitespace-nowrap p-2 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Lên"
                  disabled={i === 0}
                  onClick={() => onMove(i, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Xuống"
                  disabled={i === slots.length - 1}
                  onClick={() => onMove(i, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Bỏ vị trí"
                  onClick={() => onRemove(i)}
                >
                  <X />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PointsInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const [text, setText] = useState(formatPoints(value));
  useEffect(() => setText(formatPoints(value)), [value]);
  return (
    <Input
      aria-label={label}
      className="w-20"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (Number.isFinite(n) && n >= 0 && n <= 100) onChange(n);
      }}
      onBlur={() => setText(formatPoints(value))}
    />
  );
}

type Sources = { list: ReturnType<typeof flatten>; loose: BankRef[] };

const SOURCE_PREFIX: Record<TopicLevel | "form", string> = {
  grade: "",
  chapter: "",
  lesson: "",
  form: "▸ ",
};

/** "t:<id>" for a khối/chương/bài (every dạng below it), "<id>" for one dạng toán (bank). */
function sourceValue(s: Pick<MatrixSlot, "bankId" | "topicId">): string {
  return s.topicId ? `t:${s.topicId}` : s.bankId;
}
function fromSourceValue(v: string): Partial<MatrixSlot> {
  return v.startsWith("t:")
    ? { bankId: v.slice(2), topicId: v.slice(2) }
    : { bankId: v, topicId: undefined };
}

function SourceSelect({
  label,
  sources,
  value,
  onChange,
}: {
  label: string;
  sources: Sources;
  value: string;
  onChange: (v: string) => void;
}) {
  const known =
    sources.list.some((x) => (x.kind === "form" ? x.id : `t:${x.id}`) === value) ||
    sources.loose.some((b) => b.id === value);
  return (
    <select
      className="entry-select max-w-72"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {!known && <option value={value}>(đã xóa)</option>}
      {sources.list.map((x) => (
        <option key={x.id} value={x.kind === "form" ? x.id : `t:${x.id}`}>
          {"\u00a0\u00a0\u00a0".repeat(x.depth)}
          {SOURCE_PREFIX[x.kind]}
          {x.title}
          {x.kind !== "form" ? ` (cả ${LEVEL_NAME[x.kind].toLowerCase()})` : ""}
        </option>
      ))}
      {sources.loose.length > 0 && (
        <optgroup label="Chưa phân loại">
          {sources.loose.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

const GRID_LEVELS: (QuestionLevel | "")[] = ["nb", "th", "vd", "vdc", ""];

/** OLM-style: pick a branch, fill a count per kind × level, add them all as slots. */
function AddSlots({
  sources,
  pool,
  onAdd,
}: {
  sources: Sources;
  pool: PoolQuestion[];
  onAdd: (slots: MatrixSlot[]) => void;
}) {
  const first =
    sources.list.find((x) => x.kind === "form")?.id ??
    (sources.list[0] ? `t:${sources.list[0].id}` : (sources.loose[0]?.id ?? ""));
  const [source, setSource] = useState(first);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!source && first) setSource(first);
  }, [first, source]);
  if (!sources.list.length && !sources.loose.length)
    return (
      <p className="text-sm text-muted-foreground">
        Hãy dựng cây câu hỏi trước (thẻ Ngân hàng đề: thêm khối → chương → bài → dạng toán).
      </p>
    );
  const from = fromSourceValue(source) as Pick<MatrixSlot, "bankId" | "topicId">;
  const available = (k: QuestionKind, l: QuestionLevel | "") =>
    pool.filter((q) => inSource(from, q) && q.kind === k && (!l || q.level === l)).length;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="grid gap-2 rounded-md border border-dashed p-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <span className="font-medium">Thêm câu từ</span>
        <SourceSelect
          label="Nguồn câu hỏi"
          sources={sources}
          value={source}
          onChange={(v) => {
            setSource(v);
            setCounts({});
          }}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="p-1" />
              {GRID_LEVELS.map((l) => (
                <th key={l} className="p-1">
                  {l ? LEVEL_LABEL[l] : "Bất kỳ"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KIND_ORDER.map((k) => (
              <tr key={k}>
                <td className="p-1 font-medium">{KIND_LABEL[k]}</td>
                {GRID_LEVELS.map((l) => {
                  const key = `${k}|${l}`;
                  const have = available(k, l);
                  const want = counts[key] ?? 0;
                  return (
                    <td key={l} className="p-1">
                      <span className="flex items-center gap-1">
                        <Input
                          aria-label={`Số câu ${KIND_LABEL[k]} ${l ? LEVEL_LABEL[l] : "bất kỳ"}`}
                          className={`h-8 w-14 ${want > have ? "border-amber-500" : ""}`}
                          type="number"
                          min={0}
                          max={50}
                          value={want || ""}
                          placeholder="0"
                          onChange={(e) =>
                            setCounts((c) => ({
                              ...c,
                              [key]: Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                            }))
                          }
                        />
                        <span className="text-xs text-muted-foreground" title="Câu dùng được">
                          /{have}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <Button
          disabled={!source || total === 0}
          onClick={() => {
            const added: MatrixSlot[] = [];
            for (const k of KIND_ORDER)
              for (const l of GRID_LEVELS)
                for (let n = 0; n < (counts[`${k}|${l}`] ?? 0); n++)
                  added.push({
                    ...from,
                    ...(from.topicId ? {} : { topicId: undefined }),
                    kind: k,
                    level: l || null,
                    points: THPT_POINTS[k],
                  } as MatrixSlot);
            onAdd(added.map(clean));
            setCounts({});
          }}
        >
          <Plus />
          Thêm {total || ""} câu vào ma trận
        </Button>
        <span className="text-xs text-muted-foreground">
          Số sau dấu / là số câu đang có. Chọn cả một bài (hoặc chương, khối) thì rút ngẫu nhiên từ
          mọi dạng toán bên trong.
        </span>
      </div>
    </div>
  );
}

/** Drop an undefined topicId so stored slots stay clean. */
function clean(s: MatrixSlot): MatrixSlot {
  const { topicId, ...rest } = s;
  return topicId ? { ...rest, topicId } : rest;
}

function Preview({ draft, pool }: { draft: Draft; pool: PoolQuestion[] }) {
  const [seed, setSeed] = useState(randomSeed);
  const [exam, setExam] = useState<DrawnExam | null>(null);
  const [bodies, setBodies] = useState<Map<string, QuestionBody>>(new Map());
  const [showAnswers, setShowAnswers] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const e = drawExam(draft.slots, pool, seededRandom(seed), {
        shuffleOptions: draft.shuffle_options,
        shuffleOrder: draft.shuffle_order,
        shuffleStatements: draft.shuffle_statements,
      });
      setExam(e);
      setError("");
      void getQuestionBodies(e.items.map((i) => i.questionId))
        .then(setBodies)
        .catch((err) => setError(message(err)));
    } catch (err) {
      setError(message(err));
    }
  }, [seed, draft, pool]);

  return (
    <>
      <DialogTitle>Xem thử đề ngẫu nhiên</DialogTitle>
      <DialogDescription>
        Mỗi học sinh sẽ nhận một đề rút ngẫu nhiên như thế này. Bấm “Rút đề khác” để xem thêm.
      </DialogDescription>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setSeed(randomSeed())}>
          <Dices />
          Rút đề khác
        </Button>
        <Button variant="outline" onClick={() => setShowAnswers((v) => !v)}>
          {showAnswers ? <EyeOff /> : <Eye />}
          {showAnswers ? "Ẩn đáp án" : "Hiện đáp án"}
        </Button>
        {exam && (
          <span className="text-sm">
            Mã đề: <span className="font-mono font-semibold">{exam.code}</span>
          </span>
        )}
      </div>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      {exam &&
        KIND_ORDER.map((kind) => {
          const items = exam.items.filter((i) => i.kind === kind);
          if (!items.length) return null;
          const start = exam.items.indexOf(items[0]!);
          return (
            <section key={kind} className="grid gap-3">
              <h3 className="font-semibold">{PART_TITLE[kind]}</h3>
              {items.map((it, k) => {
                const body = bodies.get(it.questionId);
                return (
                  <article key={it.questionId} className="rounded-lg border p-3">
                    <div className="mb-1 text-sm font-semibold">
                      Câu {kind === "mcq" ? start + k + 1 : k + 1}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({formatPoints(it.points)} điểm · vị trí {it.slot + 1} · câu số{" "}
                        {it.poolNumber} trong ngân hàng)
                      </span>
                    </div>
                    {body ? (
                      <QuestionView
                        body={withOptionOrder(body, it.optionOrder, it.statementOrder)}
                        showAnswer={showAnswers}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">Đang tải…</p>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
    </>
  );
}
