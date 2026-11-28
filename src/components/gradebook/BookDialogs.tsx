// Dialogs of the personal gradebook: new book, SMAS import, book settings, bonus/penalty.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { History, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ExamClassSummary } from "@/lib/exam/classes.functions";
import { addStudents, listClassStudents } from "@/lib/exam/classes.functions";
import {
  bonusHistory,
  createBook,
  deleteBook,
  importSmas,
  saveBonus,
  updateBook,
  type BookData,
} from "@/lib/gradebook/gradebook.functions";
import {
  BEHAVIOR_KINDS,
  BEHAVIOR_LABEL,
  BEHAVIOR_POSITIVE,
  DEFAULT_RULE,
  defaultColumns,
  formatScore,
  parseScore,
  suggestBonus,
  type BonusRule,
  type BookColumn,
} from "@/lib/gradebook/scores";
import { bookColumnsFrom, type SmasSheet } from "@/lib/gradebook/smas";
import { planImport, type ClassStudent } from "@/lib/gradebook/smas-plan";
import { nameKey } from "@/lib/exam/accounts";
import { errorText, toBase64 } from "./files";
import type { Student } from "./ScoreGrid";

function currentSchoolYear(): string {
  const d = new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// ---------- new book ----------

export function NewBookDialog({
  classes,
  onClose,
  onCreated,
}: {
  classes: ExamClassSummary[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useServerFn(createBook);
  const active = classes.filter((c) => !c.archived);
  const [classId, setClassId] = useState(active[0]?.id ?? "");
  const cls = active.find((c) => c.id === classId);
  const [subject, setSubject] = useState(cls?.subject || "Toán");
  const [semester, setSemester] = useState<1 | 2>(
    new Date().getMonth() >= 7 || new Date().getMonth() === 0 ? 1 : 2,
  );
  const [tx, setTx] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Sổ điểm mới</DialogTitle>
        <DialogDescription>
          Mỗi sổ là một lớp – một môn – một học kỳ. Nếu có file SMAS, dùng “Nhập từ SMAS” để tạo sổ
          đúng mẫu.
        </DialogDescription>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="nb-class">Lớp</Label>
            <select
              id="nb-class"
              className="h-9 w-full rounded-md border bg-background px-2"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                const c = active.find((x) => x.id === e.target.value);
                if (c?.subject) setSubject(c.subject);
              }}
            >
              {active.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.schoolYear ? ` · ${c.schoolYear}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label htmlFor="nb-subject">Môn</Label>
              <Input
                id="nb-subject"
                maxLength={60}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="nb-sem">Học kỳ</Label>
              <select
                id="nb-sem"
                className="h-9 w-full rounded-md border bg-background px-2"
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value) as 1 | 2)}
              >
                <option value={1}>I</option>
                <option value={2}>II</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="nb-tx">Số cột ĐĐG thường xuyên</Label>
            <Input
              id="nb-tx"
              type="number"
              min={1}
              max={8}
              value={tx}
              onChange={(e) => setTx(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              disabled={busy || !classId || !subject.trim()}
              onClick={() => {
                setBusy(true);
                void create({
                  data: {
                    classId,
                    subject: subject.trim(),
                    semester,
                    schoolYear: cls?.schoolYear || currentSchoolYear(),
                    columns: defaultColumns(tx),
                  },
                })
                  .then((r) => onCreated(r.id))
                  .catch((e) => {
                    setError(errorText(e));
                    setBusy(false);
                  });
              }}
            >
              Tạo sổ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- SMAS import ----------

export function SmasImportDialog({
  sheet,
  bytes,
  classes,
  onClose,
  onDone,
}: {
  sheet: SmasSheet;
  bytes: Uint8Array;
  classes: ExamClassSummary[];
  onClose: () => void;
  onDone: (bookId: string, message: string) => void;
}) {
  const listStudents = useServerFn(listClassStudents);
  const add = useServerFn(addStudents);
  const run = useServerFn(importSmas);
  const active = classes.filter((c) => !c.archived);
  const guess =
    active.find(
      (c) =>
        nameKey(c.name) === nameKey(sheet.className) &&
        (!sheet.schoolYear || !c.schoolYear || c.schoolYear === sheet.schoolYear),
    ) ?? active.find((c) => nameKey(c.name) === nameKey(sheet.className));
  const [classId, setClassId] = useState(guess?.id ?? (active.length === 1 ? active[0]!.id : ""));
  const [students, setStudents] = useState<ClassStudent[] | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async (id: string) => {
    setStudents(null);
    if (!id) return;
    try {
      const list = await listStudents({ data: { classId: id } });
      setStudents(
        list.map((s) => ({ id: s.id, fullName: s.fullName, studentCode: s.studentCode })),
      );
    } catch (e) {
      setError(errorText(e));
    }
  };
  useEffect(() => {
    void load(classId);
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo(() => bookColumnsFrom(sheet), [sheet]);
  const plan = useMemo(
    () => (students ? planImport(sheet, columns, students) : null),
    [sheet, columns, students],
  );
  const missing = plan?.matches.filter((m) => !m.studentId) ?? [];
  const existingScores = sheet.rows.reduce(
    (n, r) =>
      n + sheet.columns.filter((c) => r.values[c.col] !== null && r.values[c.col] !== "").length,
    0,
  );

  async function addMissing() {
    setBusy(true);
    setError("");
    try {
      const list = missing.map((m) => ({
        fullName: m.fullName,
        birthDate: null,
        studentCode: m.code || null,
      }));
      for (let i = 0; i < list.length; i += 20)
        await add({ data: { classId, students: list.slice(i, i + 20) } });
      await load(classId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      const r = await run({
        data: {
          classId,
          subject: sheet.subject || "Môn học",
          semester: sheet.semester,
          schoolYear: sheet.schoolYear,
          columns,
          template: toBase64(bytes),
          map: {
            sheetPath: sheet.sheetPath,
            columns: plan.columnMap,
            rows: plan.matches.map((m) => ({
              row: m.row,
              studentId: m.studentId,
              fullName: m.fullName,
            })),
          },
          cells: plan.cells,
          overwrite,
          setCodes: plan.setCodes,
        },
      });
      onDone(
        r.bookId,
        `Đã nhập sổ điểm ${sheet.subject} lớp ${sheet.className}: ${r.saved} ô điểm.`,
      );
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogTitle>Nhập sổ điểm từ SMAS</DialogTitle>
        <DialogDescription>
          Môn <b>{sheet.subject}</b> · lớp <b>{sheet.className}</b> · học kỳ{" "}
          {sheet.semester === 1 ? "I" : "II"}
          {sheet.schoolYear ? ` · ${sheet.schoolYear}` : ""} · {sheet.rows.length} học sinh ·{" "}
          {sheet.columns.map((c) => c.label).join(", ")}
        </DialogDescription>
        <div className="grid gap-3 text-sm">
          <div>
            <Label htmlFor="imp-class">Lớp trên Lớp Học Số</Label>
            <select
              id="imp-class"
              className="h-9 w-full rounded-md border bg-background px-2"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">— Chọn lớp —</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.schoolYear ? ` · ${c.schoolYear}` : ""} ({c.studentCount} HS)
                </option>
              ))}
            </select>
            {!active.length ? (
              <p className="mt-1 text-muted-foreground">
                Chưa có lớp. Tạo lớp ở trang Tài khoản học sinh trước.
              </p>
            ) : null}
          </div>
          {classId && !plan ? (
            <p className="text-muted-foreground">Đang so khớp học sinh…</p>
          ) : null}
          {plan ? (
            <div className="rounded-lg border p-3">
              <p>
                Khớp <b>{plan.matches.length - missing.length}</b>/{plan.matches.length} học sinh
                {plan.setCodes.length ? ` (${plan.setCodes.length} em sẽ được gán mã SMAS)` : ""}.
              </p>
              {missing.length ? (
                <div className="mt-2 rounded bg-amber-50 p-2">
                  <p>
                    {missing.length} em trong file chưa có trong lớp:{" "}
                    {missing
                      .slice(0, 6)
                      .map((m) => m.fullName)
                      .join(", ")}
                    {missing.length > 6 ? "…" : ""}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={busy}
                    onClick={() => void addMissing()}
                  >
                    Thêm {missing.length} em vào lớp (tạo tài khoản)
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {existingScores ? (
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span>
                File có sẵn {existingScores} ô điểm. Ghi đè điểm đã có trong sổ?
                <span className="block text-xs text-muted-foreground">
                  Tắt: chỉ điền vào ô còn trống.
                </span>
              </span>
              <Switch checked={overwrite} onCheckedChange={setOverwrite} />
            </label>
          ) : null}
          <p className="text-xs text-muted-foreground">
            File gốc được lưu cùng sổ. Khi nhập điểm xong, bấm “Xuất file SMAS” để lấy lại đúng file
            này đã điền điểm và tải lên SMAS.
          </p>
          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Hủy
            </Button>
            <Button disabled={busy || !plan} onClick={() => void submit()}>
              {busy ? "Đang nhập…" : "Nhập vào sổ"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- book settings ----------

export function BookSettingsDialog({
  data,
  onClose,
  onSaved,
  onDeleted,
}: {
  data: BookData;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const update = useServerFn(updateBook);
  const remove = useServerFn(deleteBook);
  const [columns, setColumns] = useState<BookColumn[]>(data.book.columns);
  const [target, setTarget] = useState<string>(data.book.bonusTarget ?? "");
  const [rule, setRule] = useState<BonusRule>(data.book.bonusRule ?? DEFAULT_RULE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tx = columns.filter((c) => c.kind === "tx");

  function addTx() {
    const n = tx.length + 1;
    let key = `tx${n}`;
    while (columns.some((c) => c.key === key)) key = `${key}b`;
    const at = columns.map((c) => c.kind).lastIndexOf("tx") + 1;
    setColumns([
      ...columns.slice(0, at),
      { key, kind: "tx", label: `TX${n}` },
      ...columns.slice(at),
    ]);
  }

  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogTitle>
          Cài đặt sổ · {data.book.subject} {data.book.className} · HK{" "}
          {data.book.semester === 1 ? "I" : "II"}
        </DialogTitle>
        <DialogDescription>
          Cột lấy từ SMAS không xóa được, để còn xuất lại đúng mẫu.
        </DialogDescription>
        <div className="grid gap-4 text-sm">
          <section className="grid gap-2">
            <Label>Cột điểm</Label>
            <div className="flex flex-wrap gap-1">
              {columns.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                >
                  {c.label}
                  {!c.smasCode && c.kind === "tx" && tx.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Xóa cột ${c.label}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        setColumns(columns.filter((x) => x.key !== c.key));
                        if (target === c.key) setTarget("");
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
              {tx.length < 8 ? (
                <Button size="sm" variant="ghost" onClick={addTx}>
                  + Thêm cột TX
                </Button>
              ) : null}
            </div>
          </section>

          <section className="grid gap-2 rounded-lg border p-3">
            <Label htmlFor="bs-target">Điểm cộng/trừ áp vào</Label>
            <select
              id="bs-target"
              className="h-9 rounded-md border bg-background px-2"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Chỉ theo dõi, không tính vào điểm</option>
              {tx.map((c) => (
                <option key={c.key} value={c.key}>
                  Cột {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Điểm sau khi cộng/trừ luôn nằm trong 0–10 và là điểm được xuất sang SMAS.
            </p>
          </section>

          <section className="grid gap-2 rounded-lg border p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="font-medium">Gợi ý điểm cộng/trừ theo số lần ghi nhận</span>
              <Switch
                checked={rule.enabled}
                onCheckedChange={(v) => setRule({ ...rule, enabled: v })}
              />
            </label>
            {rule.enabled ? (
              <>
                <div className="flex flex-wrap items-center gap-1">
                  Cứ
                  <Input
                    className="h-8 w-14"
                    value={rule.plusEvery}
                    onChange={(e) =>
                      setRule({ ...rule, plusEvery: Math.round(num(e.target.value, 1, 50, 5)) })
                    }
                  />
                  lần
                  {BEHAVIOR_KINDS.filter((k) => BEHAVIOR_POSITIVE[k]).map((k) => (
                    <label key={k} className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={rule.plusKinds.includes(k)}
                        onChange={(e) =>
                          setRule({
                            ...rule,
                            plusKinds: e.target.checked
                              ? [...rule.plusKinds, k]
                              : rule.plusKinds.filter((x) => x !== k),
                          })
                        }
                      />
                      {BEHAVIOR_LABEL[k].toLowerCase()}
                    </label>
                  ))}
                  thì cộng
                  <Input
                    className="h-8 w-16"
                    value={formatScore(rule.plusStep)}
                    onChange={(e) =>
                      setRule({ ...rule, plusStep: num(e.target.value, 0.05, 5, 0.5) })
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  Cứ
                  <Input
                    className="h-8 w-14"
                    value={rule.minusEvery}
                    onChange={(e) =>
                      setRule({ ...rule, minusEvery: Math.round(num(e.target.value, 1, 50, 3)) })
                    }
                  />
                  lần
                  {BEHAVIOR_KINDS.filter((k) => !BEHAVIOR_POSITIVE[k]).map((k) => (
                    <label key={k} className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={rule.minusKinds.includes(k)}
                        onChange={(e) =>
                          setRule({
                            ...rule,
                            minusKinds: e.target.checked
                              ? [...rule.minusKinds, k]
                              : rule.minusKinds.filter((x) => x !== k),
                          })
                        }
                      />
                      {BEHAVIOR_LABEL[k].toLowerCase()}
                    </label>
                  ))}
                  thì trừ
                  <Input
                    className="h-8 w-16"
                    value={formatScore(rule.minusStep)}
                    onChange={(e) =>
                      setRule({ ...rule, minusStep: num(e.target.value, 0.05, 5, 0.5) })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Chỉ là gợi ý: giáo viên bấm “Áp dụng” thì mới ghi vào ô.
                </p>
              </>
            ) : null}
          </section>

          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => {
                if (!confirm("Xóa sổ điểm này cùng toàn bộ điểm đã nhập? Không thể hoàn tác."))
                  return;
                setBusy(true);
                void remove({ data: { bookId: data.book.id } })
                  .then(onDeleted)
                  .catch((e) => {
                    setError(errorText(e));
                    setBusy(false);
                  });
              }}
            >
              Xóa sổ
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Hủy
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void update({
                    data: {
                      bookId: data.book.id,
                      columns,
                      bonusTarget: target || null,
                      bonusRule: rule,
                    },
                  })
                    .then(onSaved)
                    .catch((e) => {
                      setError(errorText(e));
                      setBusy(false);
                    });
                }}
              >
                Lưu
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- bonus / penalty of one student ----------

export function BonusDialog({
  data,
  student,
  onClose,
  onSaved,
}: {
  data: BookData;
  student: Student;
  onClose: () => void;
  onSaved: (b: { plus: number; minus: number; note: string }) => void;
}) {
  const save = useServerFn(saveBonus);
  const history = useServerFn(bonusHistory);
  const current = data.bonus.find((b) => b.studentId === student.id);
  const [plus, setPlus] = useState(formatScore(current?.plus || null));
  const [minus, setMinus] = useState(formatScore(current?.minus || null));
  const [note, setNote] = useState(current?.note ?? "");
  const [log, setLog] = useState<Awaited<ReturnType<typeof history>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const counts = data.counts[student.id] ?? {};
  const rule = data.book.bonusRule;
  const hint = rule?.enabled ? suggestBonus(counts, rule) : null;
  const targetLabel = data.book.columns.find((c) => c.key === data.book.bonusTarget)?.label;

  function submit() {
    const p = parseScore(plus);
    const m = parseScore(minus);
    if (p === "invalid" || m === "invalid") {
      setError("Điểm cộng/trừ là số từ 0 đến 10, tối đa 2 chữ số thập phân");
      return;
    }
    setBusy(true);
    const b = { plus: p ?? 0, minus: m ?? 0, note: note.trim() };
    void save({ data: { bookId: data.book.id, studentId: student.id, ...b } })
      .then(() => onSaved(b))
      .catch((e) => {
        setError(errorText(e));
        setBusy(false);
      });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Điểm cộng / trừ · {student.fullName}</DialogTitle>
        <DialogDescription>
          {targetLabel
            ? `Áp vào cột ${targetLabel}.`
            : "Đang chỉ theo dõi (chưa chọn cột áp điểm trong Cài đặt sổ)."}
        </DialogDescription>
        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="bn-plus" className="text-emerald-700">
                Điểm cộng
              </Label>
              <Input
                id="bn-plus"
                inputMode="decimal"
                value={plus}
                onChange={(e) => setPlus(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="bn-minus" className="text-red-700">
                Điểm trừ
              </Label>
              <Input
                id="bn-minus"
                inputMode="decimal"
                value={minus}
                onChange={(e) => setMinus(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="bn-note">Lý do</Label>
            <Input
              id="bn-note"
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tích cực phát biểu, …"
            />
          </div>
          <div className="rounded-lg bg-muted/50 p-2 text-xs">
            <p className="font-medium">Ghi nhận học kỳ này:</p>
            <p>
              {Object.entries(counts).length
                ? (Object.entries(counts) as [keyof typeof BEHAVIOR_LABEL, number][])
                    .map(([k, n]) => `${BEHAVIOR_LABEL[k]} ${n}`)
                    .join(" · ")
                : "Chưa có"}
            </p>
            {hint ? (
              <div className="mt-1 flex items-center justify-between gap-2">
                <span>
                  Gợi ý: +{formatScore(hint.plus)} / −{formatScore(hint.minus)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPlus(formatScore(hint.plus || null));
                    setMinus(formatScore(hint.minus || null));
                    if (!note.trim()) setNote("Theo số lần ghi nhận trên lớp");
                  }}
                >
                  <Sparkles /> Áp dụng
                </Button>
              </div>
            ) : null}
          </div>
          {log ? (
            <ul className="max-h-40 overflow-y-auto text-xs">
              {log.length ? (
                log.map((h, i) => (
                  <li key={i} className="border-b py-1">
                    {new Date(h.at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}: cộng{" "}
                    {formatScore(h.plusOld) || 0} → {formatScore(h.plusNew) || 0}, trừ{" "}
                    {formatScore(h.minusOld) || 0} → {formatScore(h.minusNew) || 0}
                    {h.note ? ` · ${h.note}` : ""}
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">Chưa có lần sửa nào.</li>
              )}
            </ul>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="justify-start"
              onClick={() =>
                void history({ data: { bookId: data.book.id, studentId: student.id } }).then(
                  setLog,
                  (e) => setError(errorText(e)),
                )
              }
            >
              <History /> Xem lịch sử sửa
            </Button>
          )}
          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Hủy
            </Button>
            <Button onClick={submit} disabled={busy}>
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
