import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, KeyRound, Pencil, Plus, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { listExamClasses, type ExamClassSummary } from "@/lib/exam/classes.functions";
import {
  assignmentResults,
  deleteAssignment,
  grantRetake,
  revokeRetake,
  listAssignments,
  saveAssignment,
  type AssignmentSummary,
  type StudentResult,
} from "@/lib/exam/assignments.functions";
import { listMatrices, type MatrixRow } from "@/lib/exam/matrix-store";
import {
  ATTEMPT_LABEL,
  DEFAULT_SETTINGS,
  WINDOW_LABEL,
  type AssignmentSettings,
} from "@/lib/exam/assignment";
import { formatPoints } from "@/lib/exam/matrix";

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

const TZ = "Asia/Ho_Chi_Minh";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** <input type="datetime-local"> value in Việt Nam time, and back (always GMT+7, whatever the computer's zone). */
function toLocalInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return d.toISOString().slice(0, 16);
}
function fromLocalInput(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}

function minutesBetween(a: string, b: string | null): string {
  if (!b) return "—";
  const m = (new Date(b).getTime() - new Date(a).getTime()) / 60_000;
  return `${Math.max(0, Math.round(m * 10) / 10)}`.replace(".", ",");
}

const STATE_CLASS: Record<AssignmentSummary["state"], string> = {
  scheduled: "bg-amber-100 text-amber-900",
  open: "bg-green-100 text-green-900",
  closed: "bg-muted text-muted-foreground",
};

export function ExamAssignments() {
  const list = useServerFn(listAssignments);
  const save = useServerFn(saveAssignment);
  const remove = useServerFn(deleteAssignment);
  const classesFn = useServerFn(listExamClasses);
  const [assignments, setAssignments] = useState<AssignmentSummary[] | null>(null);
  const [classes, setClasses] = useState<ExamClassSummary[]>([]);
  const [matrices, setMatrices] = useState<MatrixRow[]>([]);
  const [editing, setEditing] = useState<AssignmentSummary | "new" | null>(null);
  const [results, setResults] = useState<AssignmentSummary | null>(null);
  const [deleting, setDeleting] = useState<AssignmentSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, c, m] = await Promise.all([list(), classesFn(), listMatrices()]);
      setAssignments(a.assignments);
      setClasses(c.filter((x) => !x.archived));
      setMatrices(m);
    } catch (e) {
      setAssignments([]);
      setError(message(e));
    }
  }, [list, classesFn]);
  useEffect(() => {
    void load();
    const t = window.setInterval(
      () =>
        void list()
          .then((a) => setAssignments(a.assignments))
          .catch(() => undefined),
      30_000,
    );
    return () => window.clearInterval(t);
  }, [load, list]);

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

  if (assignments === null) return <p className="text-muted-foreground">Đang tải…</p>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!classes.length || !matrices.length} onClick={() => setEditing("new")}>
          <Plus />
          Giao bài mới
        </Button>
        <Button variant="ghost" onClick={() => run(load)}>
          <RefreshCw />
          Làm mới
        </Button>
        {!classes.length && (
          <span className="text-sm text-muted-foreground">
            Hãy tạo lớp trước (thẻ Lớp và tài khoản).
          </span>
        )}
        {classes.length > 0 && !matrices.length && (
          <span className="text-sm text-muted-foreground">
            Hãy tạo ma trận đề trước (thẻ Ma trận đề).
          </span>
        )}
      </div>
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}
      {assignments.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Chưa giao bài nào.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2">Bài</th>
                <th className="p-2">Lớp</th>
                <th className="p-2">Mở</th>
                <th className="p-2">Đóng</th>
                <th className="p-2">Thời lượng</th>
                <th className="p-2">Trạng thái</th>
                <th className="p-2">Đã nộp / đã vào / sĩ số</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-2 font-medium">
                    {a.title}
                    <div className="text-xs font-normal text-muted-foreground">
                      {a.questionCount} câu · {a.maxAttempts} lần làm
                    </div>
                  </td>
                  <td className="p-2">{a.className}</td>
                  <td className="p-2 whitespace-nowrap">{formatTime(a.opensAt)}</td>
                  <td className="p-2 whitespace-nowrap">{formatTime(a.closesAt)}</td>
                  <td className="p-2">{a.durationMinutes} phút</td>
                  <td className="p-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATE_CLASS[a.state]}`}
                    >
                      {WINDOW_LABEL[a.state]}
                    </span>
                  </td>
                  <td className="p-2">
                    {a.finishedCount} / {a.startedCount} / {a.studentCount}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setResults(a)}>
                      <BarChart3 />
                      Kết quả
                    </Button>
                    <Button size="sm" variant="ghost" title="Sửa" onClick={() => setEditing(a)}>
                      <Pencil />
                    </Button>
                    <Button size="sm" variant="ghost" title="Xóa" onClick={() => setDeleting(a)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && !busy && setEditing(null)}>
        <DialogContent className="max-h-[94vh] max-w-2xl overflow-y-auto">
          {editing && (
            <AssignmentForm
              initial={editing === "new" ? null : editing}
              classes={classes}
              matrices={matrices}
              busy={busy}
              error={error}
              onSubmit={(v) =>
                run(async () => {
                  await save({ data: { ...v, ...(editing !== "new" ? { id: editing.id } : {}) } });
                  setEditing(null);
                  await load();
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={results !== null} onOpenChange={(o) => !o && setResults(null)}>
        <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
          {results && <Results assignment={results} />}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && !busy && setDeleting(null)}>
        <DialogContent>
          <DialogTitle>Xóa bài giao “{deleting?.title}”?</DialogTitle>
          <DialogDescription>
            {deleting?.startedCount
              ? `Đã có ${deleting.startedCount} học sinh làm bài; toàn bộ bài làm và điểm của bài này sẽ bị xóa.`
              : "Học sinh sẽ không còn thấy bài này."}
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (deleting) await remove({ data: { id: deleting.id } });
                  setDeleting(null);
                  await load();
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

interface FormValues {
  classId: string;
  matrixId: string;
  title: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  maxAttempts: number;
  settings: AssignmentSettings;
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <span className="flex items-center gap-1">
        <Input
          type="number"
          className="w-24"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        />
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  );
}

function AssignmentForm({
  initial,
  classes,
  matrices,
  busy,
  error,
  onSubmit,
}: {
  initial: AssignmentSummary | null;
  classes: ExamClassSummary[];
  matrices: MatrixRow[];
  busy: boolean;
  error: string;
  onSubmit: (v: FormValues) => void;
}) {
  const now = Date.now();
  const roundedNow = new Date(Math.ceil(now / 300_000) * 300_000).toISOString();
  const [v, setV] = useState<FormValues>(() => ({
    classId: initial?.classId ?? classes[0]?.id ?? "",
    matrixId: initial?.matrixId ?? matrices[0]?.id ?? "",
    title: initial?.title ?? matrices[0]?.title ?? "",
    opensAt: initial?.opensAt ?? roundedNow,
    closesAt:
      initial?.closesAt ?? new Date(new Date(roundedNow).getTime() + 60 * 60_000).toISOString(),
    durationMinutes: initial?.durationMinutes ?? 15,
    maxAttempts: initial?.maxAttempts ?? 1,
    settings: initial?.settings ?? DEFAULT_SETTINGS,
  }));
  const set = (patch: Partial<FormValues>) => setV((x) => ({ ...x, ...patch }));
  const setS = (patch: Partial<AssignmentSettings>) =>
    setV((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const locked = initial?.locked ?? false;
  const s = v.settings;
  return (
    <>
      <DialogTitle>{initial ? "Sửa bài giao" : "Giao bài mới"}</DialogTitle>
      <DialogDescription>
        Mọi mốc giờ tính theo giờ Việt Nam (GMT+7) trên máy chủ. Mỗi học sinh nhận một đề rút ngẫu
        nhiên theo ma trận.
      </DialogDescription>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(v);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Lớp
            <select
              className="entry-select"
              disabled={locked}
              value={v.classId}
              onChange={(e) => set({ classId: e.target.value })}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.studentCount} học sinh)
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Ma trận đề
            <select
              className="entry-select"
              disabled={locked}
              value={v.matrixId}
              onChange={(e) => {
                const m = matrices.find((x) => x.id === e.target.value);
                set({
                  matrixId: e.target.value,
                  ...(m && (!v.title || matrices.some((x) => x.title === v.title))
                    ? { title: m.title }
                    : {}),
                });
              }}
            >
              {matrices.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} ({m.slots.length} câu)
                </option>
              ))}
            </select>
          </label>
        </div>
        {locked && (
          <p className="text-xs text-amber-800">
            Đã có học sinh làm bài nên không đổi được lớp, ma trận và thời lượng.
          </p>
        )}
        <label className="grid gap-1 text-sm">
          Tên bài
          <Input
            required
            maxLength={150}
            value={v.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Giờ mở (đến giờ tự mở)
            <Input
              type="datetime-local"
              required
              value={toLocalInput(v.opensAt)}
              onChange={(e) => e.target.value && set({ opensAt: fromLocalInput(e.target.value) })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Giờ đóng (sau giờ này không ai vào mới được)
            <Input
              type="datetime-local"
              required
              value={toLocalInput(v.closesAt)}
              onChange={(e) => e.target.value && set({ closesAt: fromLocalInput(e.target.value) })}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <NumberField
            label="Thời lượng mỗi em"
            value={v.durationMinutes}
            min={1}
            max={300}
            suffix="phút"
            onChange={(n) => !locked && set({ durationMinutes: n })}
          />
          <NumberField
            label="Số lần làm"
            value={v.maxAttempts}
            min={1}
            max={20}
            onChange={(n) => set({ maxAttempts: n })}
          />
          <NumberField
            label="Thang điểm"
            value={s.scale}
            min={1}
            max={100}
            onChange={(n) => setS({ scale: n })}
          />
          <label className="grid gap-1 text-sm">
            Điểm tính vào bảng
            <select
              className="entry-select"
              value={s.scoreRule}
              onChange={(e) =>
                setS({ scoreRule: e.target.value as AssignmentSettings["scoreRule"] })
              }
            >
              <option value="latest">Lượt mới nhất</option>
              <option value="highest">Lượt cao nhất</option>
              <option value="first">Lượt đầu tiên</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="grid gap-1 text-sm">
            Xem lại sau khi nộp
            <select
              className="entry-select"
              value={s.review}
              onChange={(e) => setS({ review: e.target.value as AssignmentSettings["review"] })}
            >
              <option value="none">Không xem lại (chỉ thấy điểm)</option>
              <option value="after_close">Xem lại sau khi đóng đề</option>
              <option value="immediate">Xem lại ngay</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Thiết bị cho phép
            <select
              className="entry-select"
              value={s.devices}
              onChange={(e) => setS({ devices: e.target.value as AssignmentSettings["devices"] })}
            >
              <option value="any">Mọi thiết bị</option>
              <option value="computer">Chỉ máy tính</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Chống sao chép
            <select
              className="entry-select"
              value={s.antiCopy}
              onChange={(e) => setS({ antiCopy: e.target.value as AssignmentSettings["antiCopy"] })}
            >
              <option value="normal">Thường</option>
              <option value="high">Cao (đề dạng ảnh)</option>
            </select>
          </label>
        </div>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Cảnh báo vi phạm, mất mạng, luật sửa đáp án
          </summary>
          <div className="mt-3 grid gap-3">
            <div className="flex flex-wrap gap-4">
              <NumberField
                label="Số lần cảnh báo tối đa"
                value={s.maxWarnings}
                min={1}
                max={50}
                onChange={(n) => setS({ maxWarnings: n })}
              />
              <NumberField
                label="Tự động làm lại tối đa"
                value={s.autoRetakes}
                min={0}
                max={10}
                suffix="lần"
                onChange={(n) => setS({ autoRetakes: n })}
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <NumberField
                label="Mất mạng ngắn dưới"
                value={s.network.shortMinutes}
                min={0.25}
                max={60}
                step={0.25}
                suffix="phút"
                onChange={(n) => setS({ network: { ...s.network, shortMinutes: n } })}
              />
              <NumberField
                label="Mất mạng dài trên"
                value={s.network.longMinutes}
                min={0.25}
                max={120}
                step={0.25}
                suffix="phút"
                onChange={(n) => setS({ network: { ...s.network, longMinutes: n } })}
              />
              <NumberField
                label="Số lần mất mạng ngắn được làm tiếp"
                value={s.network.freeDrops}
                min={0}
                max={50}
                onChange={(n) => setS({ network: { ...s.network, freeDrops: n } })}
              />
              <NumberField
                label="Quá số lần này thì tính lượt"
                value={s.network.uncountedDrops}
                min={0}
                max={50}
                onChange={(n) => setS({ network: { ...s.network, uncountedDrops: n } })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.editRule.enabled}
                onChange={(e) => setS({ editRule: { ...s.editRule, enabled: e.target.checked } })}
              />
              Bật luật sửa đáp án sau khi làm xong
            </label>
            {s.editRule.enabled && (
              <div className="flex flex-wrap gap-4">
                <NumberField
                  label="Làm quá nhanh: dưới"
                  value={Math.round(s.editRule.fastShare * 100)}
                  min={1}
                  max={100}
                  suffix="% thời lượng"
                  onChange={(n) => setS({ editRule: { ...s.editRule, fastShare: n / 100 } })}
                />
                <NumberField
                  label="Làm nhanh: sửa quá"
                  value={Math.round(s.editRule.fastLimit * 100)}
                  min={1}
                  max={100}
                  suffix="% số câu"
                  onChange={(n) => setS({ editRule: { ...s.editRule, fastLimit: n / 100 } })}
                />
                <NumberField
                  label="Làm bình thường: sửa quá"
                  value={Math.round(s.editRule.slowLimit * 100)}
                  min={1}
                  max={100}
                  suffix="% số câu"
                  onChange={(n) => setS({ editRule: { ...s.editRule, slowLimit: n / 100 } })}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Các cài đặt này được ghi nhận ngay và áp dụng khi phần chống gian lận (giai đoạn 7)
              hoàn thành.
            </p>
          </div>
        </details>
        {error && (
          <p className="error-note" role="alert">
            {error}
          </p>
        )}
        <Button disabled={busy || !v.classId || !v.matrixId}>
          {busy ? "Đang lưu…" : initial ? "Lưu" : "Giao bài"}
        </Button>
      </form>
    </>
  );
}

function Results({ assignment }: { assignment: AssignmentSummary }) {
  const load = useServerFn(assignmentResults);
  const [rows, setRows] = useState<StudentResult[] | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    load({ data: { assignmentId: assignment.id } })
      .then((r) => setRows(r.students))
      .catch((e) => setError(message(e)));
  }, [load, assignment.id]);
  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, [refresh]);
  const grantFn = useServerFn(grantRetake);
  const revokeFn = useServerFn(revokeRetake);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [granting, setGranting] = useState(false);
  const toggle = (id: string) =>
    setSelected((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const waiting = (rows ?? []).filter((r) => r.waiting && !r.grant);
  const scale = assignment.settings.scale;
  const done = (rows ?? []).filter((r) => r.score !== null);
  const avg = done.length ? done.reduce((s, r) => s + (r.score ?? 0), 0) / done.length : null;
  return (
    <>
      <DialogTitle>Kết quả · {assignment.title}</DialogTitle>
      <DialogDescription>
        Lớp {assignment.className} · tự cập nhật mỗi 15 giây.
        {avg !== null &&
          ` Đã có điểm: ${done.length} em · trung bình ${formatPoints(Math.round(avg * 100) / 100)} / ${scale}.`}
      </DialogDescription>
      {error && <p className="error-note">{error}</p>}
      {rows !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!selected.size}
            onClick={() => setGranting(true)}
            title="Cho các em đã chọn làm thêm một lượt với đề mới"
          >
            <KeyRound />
            Cấp quyền thi lại{selected.size ? ` (${selected.size})` : ""}
          </Button>
          {waiting.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelected(new Set(waiting.map((r) => r.studentId)))}
            >
              Chọn {waiting.length} em đang chờ cấp quyền
            </Button>
          )}
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
          )}
        </div>
      )}
      {rows === null ? (
        <p>Đang tải…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={!!rows.length && selected.size === rows.length}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? new Set(rows.map((r) => r.studentId)) : new Set(),
                      )
                    }
                  />
                </th>
                <th className="p-2">STT</th>
                <th className="p-2">Họ và tên</th>
                <th className="p-2">Trạng thái</th>
                <th className="p-2">Mã đề</th>
                <th className="p-2">Bắt đầu</th>
                <th className="p-2">Nộp</th>
                <th className="p-2">Thời gian (phút)</th>
                <th className="p-2">Số câu đúng</th>
                <th className="p-2" title="Tổng số lần thoát toàn màn hình / chuyển tab, mọi lượt">
                  Vi phạm
                </th>
                <th className="p-2" title="Tổng số lần mất kết nối, mọi lượt">
                  Mất mạng
                </th>
                <th className="p-2" title="Số câu đã sửa sau khi làm hết một lượt (lượt gần nhất)">
                  Sửa đáp án
                </th>
                <th className="p-2">Điểm</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const last = r.attempts[r.attempts.length - 1];
                return (
                  <tr key={r.studentId} className="border-b last:border-0">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${r.fullName}`}
                        checked={selected.has(r.studentId)}
                        onChange={() => toggle(r.studentId)}
                      />
                    </td>
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2 font-medium">
                      {r.fullName}
                      {r.attempts.length > 1 && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {r.attempts.length} lượt
                          {r.attempts.some((x) => x.status.startsWith("cancelled")) &&
                            ` (${r.attempts.filter((x) => x.status.startsWith("cancelled")).length} bị hủy)`}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      {last ? (
                        ATTEMPT_LABEL[last.status]
                      ) : (
                        <span className="text-muted-foreground">Chưa làm</span>
                      )}
                      {r.grant ? (
                        <div className="text-xs text-green-700">
                          Được thi lại
                          {r.grant.expiresAt ? ` đến ${formatTime(r.grant.expiresAt)}` : ""}
                          <button
                            type="button"
                            className="ml-1 inline-flex items-center gap-0.5 underline"
                            onClick={() =>
                              revokeFn({ data: { grantId: r.grant!.id } })
                                .then(refresh)
                                .catch((e) => setError(message(e)))
                            }
                          >
                            <Undo2 size={12} />
                            Thu hồi
                          </button>
                        </div>
                      ) : (
                        r.waiting && (
                          <div className="text-xs text-amber-700">Chờ cấp quyền: {r.waiting}</div>
                        )
                      )}
                    </td>
                    <td className="p-2 font-mono text-xs">{last?.code ?? ""}</td>
                    <td className="p-2 whitespace-nowrap text-xs">
                      {last ? formatTime(last.startedAt) : ""}
                    </td>
                    <td className="p-2 whitespace-nowrap text-xs">
                      {last?.finishedAt ? formatTime(last.finishedAt) : ""}
                    </td>
                    <td className="p-2">
                      {last ? minutesBetween(last.startedAt, last.finishedAt) : ""}
                    </td>
                    <td className="p-2">
                      {last?.correctCount !== null && last?.correctCount !== undefined
                        ? `${last.correctCount}/${last.questionCount}`
                        : ""}
                    </td>
                    <td className="p-2">{sum(r.attempts, "violationCount") || ""}</td>
                    <td className="p-2">{sum(r.attempts, "disconnectCount") || ""}</td>
                    <td className="p-2">
                      {last?.editCount ? `${last.editCount}/${last.questionCount}` : ""}
                    </td>
                    <td className="p-2 font-semibold">
                      {r.score !== null ? formatPoints(r.score) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={granting} onOpenChange={setGranting}>
        <DialogContent>
          <GrantForm
            count={selected.size}
            onCancel={() => setGranting(false)}
            onGrant={async (reason, expiresAt) => {
              await grantFn({
                data: {
                  assignmentId: assignment.id,
                  studentIds: [...selected],
                  reason,
                  expiresAt,
                },
              });
              setGranting(false);
              setSelected(new Set());
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

const GRANT_REASONS = [
  "Lỗi kỹ thuật",
  "Vắng có phép",
  "Bị thu bài do vi phạm",
  "Mất mạng nhiều lần",
];

function GrantForm({
  count,
  onCancel,
  onGrant,
}: {
  count: number;
  onCancel: () => void;
  onGrant: (reason: string, expiresAt: string | null) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [limit, setLimit] = useState(true);
  // default: 22:00 tonight (Việt Nam time), or tomorrow 22:00 if that has passed
  const [until, setUntil] = useState(() => {
    const day = toLocalInput(new Date().toISOString()).slice(0, 10);
    const tonight = fromLocalInput(`${day}T22:00`);
    return toLocalInput(
      new Date(tonight).getTime() > Date.now() + 15 * 60_000
        ? tonight
        : new Date(new Date(tonight).getTime() + 24 * 3600_000).toISOString(),
    );
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        onGrant(reason, limit ? fromLocalInput(until) : null)
          .catch((err) => setError(message(err)))
          .finally(() => setBusy(false));
      }}
    >
      <DialogTitle>Cấp quyền thi lại cho {count} học sinh</DialogTitle>
      <DialogDescription>
        Mỗi em được làm thêm một lượt với đề mới, đủ thời gian, kể cả khi bài đã đóng hoặc đã hết
        lượt. Học sinh nhận thông báo trong trang của mình.
      </DialogDescription>
      <label>
        Lý do (học sinh thấy được)
        <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-1">
        {GRANT_REASONS.map((r) => (
          <Button key={r} type="button" size="sm" variant="outline" onClick={() => setReason(r)}>
            {r}
          </Button>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={limit} onChange={(e) => setLimit(e.target.checked)} />
        Có hạn dùng
      </label>
      {limit && (
        <label>
          Dùng được đến (giờ Việt Nam)
          <Input
            type="datetime-local"
            required
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
      )}
      {error && <p className="error-note">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button disabled={busy || !count}>{busy ? "Đang cấp…" : "Cấp quyền"}</Button>
      </div>
    </form>
  );
}

function sum<T>(list: T[], key: { [K in keyof T]: T[K] extends number ? K : never }[keyof T]) {
  return list.reduce((n, x) => n + (x[key] as number), 0);
}
