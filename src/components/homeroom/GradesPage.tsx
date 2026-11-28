// Điểm & đánh giá: every subject's average for the term (from score books: the teacher's own
// and SMAS files collected from subject teachers), the suggested learning level (TT22 Điều 9),
// and the homeroom teacher's learning / conduct levels and comment per student.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileUp, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SmasImportDialog } from "@/components/gradebook/BookDialogs";
import { listExamClasses, type ExamClassSummary } from "@/lib/exam/classes.functions";
import { readSmasSheet, type SmasSheet } from "@/lib/gradebook/smas";
import { formatScore } from "@/lib/gradebook/scores";
import { attendanceData, type StudentBasic } from "@/lib/homeroom/homeroom.functions";
import {
  classBooks,
  listEvaluations,
  listIncidents,
  saveEvaluation,
  weeklyData,
  type ClassBook,
  type Evaluation,
  type Incident,
  type WeeklyResult,
} from "@/lib/homeroom/records.functions";
import {
  LEVELS,
  LEVEL_LABEL,
  studyLevel,
  subjectResult,
  yearConduct,
  yearResult,
  type Level,
  type SubjectResult,
} from "@/lib/homeroom/evaluation";
import { periodRange, vnToday } from "@/lib/homeroom/periods";
import { byGivenName, isActive } from "@/lib/homeroom/profiles";
import { errorText, type HomeroomContext } from "./HomeroomFrame";
import { downloadTable, fileSafe } from "./sheets";

type Term = 1 | 2 | 3;
const TERM_LABEL: Record<Term, string> = { 1: "Học kỳ I", 2: "Học kỳ II", 3: "Cả năm" };

function bookResult(b: ClassBook | undefined, studentId: string): SubjectResult | undefined {
  if (!b) return undefined;
  const raw: Record<string, number | null> = {};
  const texts: Record<string, string | null> = {};
  for (const s of b.scores)
    if (s.studentId === studentId) {
      raw[s.key] = s.num;
      texts[s.key] = s.txt;
    }
  return subjectResult({
    columns: b.columns,
    bonusTarget: b.bonusTarget,
    raw,
    texts,
    bonus: b.bonus.find((x) => x.studentId === studentId),
  });
}

function show(r: SubjectResult | undefined): { text: string; low: boolean; partial: boolean } {
  if (!r) return { text: "", low: false, partial: false };
  if (r.kind === "comment")
    return {
      text: r.pass === null ? "…" : r.pass ? "Đ" : "CĐ",
      low: r.pass === false,
      partial: r.pass === null,
    };
  return {
    text: r.value === null ? "" : `${formatScore(r.value)}${r.complete ? "" : "*"}`,
    low: r.value !== null && r.value < 5,
    partial: !r.complete,
  };
}

export function GradesPage({ cls }: HomeroomContext) {
  const loadBooks = useServerFn(classBooks);
  const loadStudents = useServerFn(attendanceData);
  const loadEval = useServerFn(listEvaluations);
  const loadWeekly = useServerFn(weeklyData);
  const loadIncidents = useServerFn(listIncidents);
  const loadClasses = useServerFn(listExamClasses);
  const save = useServerFn(saveEvaluation);
  const [term, setTerm] = useState<Term>(1);
  const [books, setBooks] = useState<ClassBook[] | null>(null);
  const [students, setStudents] = useState<StudentBasic[]>([]);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [weekly, setWeekly] = useState<WeeklyResult[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [importing, setImporting] = useState<{
    sheet: SmasSheet;
    bytes: Uint8Array;
    classes: ExamClassSummary[];
  } | null>(null);
  const [comment, setComment] = useState<StudentBasic | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const year = useMemo(() => periodRange("year", vnToday(), cls.settings), [cls.settings]);
  const range = useMemo(
    () =>
      term === 3
        ? year
        : periodRange(
            term === 1 ? "term1" : "term2",
            term === 1 ? year.from : year.to,
            cls.settings,
          ),
    [term, year, cls.settings],
  );

  const load = useCallback(async () => {
    try {
      const t = vnToday();
      const [b, s, e, w, i] = await Promise.all([
        loadBooks({ data: { classId: cls.id } }),
        loadStudents({ data: { classId: cls.id, from: t, to: t } }),
        loadEval({ data: { classId: cls.id } }),
        loadWeekly({ data: { classId: cls.id, ...year } }),
        loadIncidents({ data: { classId: cls.id, ...year } }),
      ]);
      setBooks(b);
      setStudents(s.students.slice().sort(byGivenName));
      setEvals(e);
      setWeekly(w.results);
      setIncidents(i);
      setError("");
    } catch (e) {
      setBooks([]);
      setError(errorText(e));
    }
  }, [loadBooks, loadStudents, loadEval, loadWeekly, loadIncidents, cls.id, year]);
  useEffect(() => {
    void load();
  }, [load]);

  const subjects = useMemo(
    () =>
      [...new Set((books ?? []).map((b) => b.subject))].sort((a, b) => a.localeCompare(b, "vi")),
    [books],
  );
  const bookOf = useCallback(
    (subject: string, semester: 1 | 2) =>
      books?.find((b) => b.subject === subject && b.semester === semester),
    [books],
  );
  const resultOf = useCallback(
    (subject: string, studentId: string): SubjectResult | undefined => {
      if (term !== 3) return bookResult(bookOf(subject, term), studentId);
      return yearResult(
        bookResult(bookOf(subject, 1), studentId),
        bookResult(bookOf(subject, 2), studentId),
      );
    },
    [term, bookOf],
  );
  const evalOf = (studentId: string, t: Term = term) =>
    evals.find((e) => e.studentId === studentId && e.term === t);

  async function update(student: StudentBasic, patch: Partial<Evaluation>) {
    const cur = evalOf(student.id);
    const next = {
      studyLevel: cur?.studyLevel ?? null,
      conductLevel: cur?.conductLevel ?? null,
      comment: cur?.comment ?? "",
      ...patch,
    };
    try {
      await save({ data: { classId: cls.id, studentId: student.id, term, ...next } });
      setEvals((list) => [
        ...list.filter((e) => !(e.studentId === student.id && e.term === term)),
        { studentId: student.id, term, ...next },
      ]);
    } catch (e) {
      setError(errorText(e));
    }
  }

  function conductHint(studentId: string): string {
    if (term === 3) {
      const y = yearConduct(
        evalOf(studentId, 1)?.conductLevel ?? null,
        evalOf(studentId, 2)?.conductLevel ?? null,
      );
      return y ? `Theo HK I, HK II: ${LEVEL_LABEL[y]}` : "Cần mức rèn luyện của cả hai học kỳ";
    }
    const inTerm = (d: string) => d >= range.from && d <= range.to;
    const wk = weekly.filter((w) => w.studentId === studentId && inTerm(w.weekStart));
    const n = (l: Level) => wk.filter((w) => w.level === l).length;
    const inc = incidents.filter((i) => i.studentId === studentId && inTerm(i.day));
    const parts = [
      wk.length
        ? `Tuần: T${n("tot")} K${n("kha")} Đ${n("dat")} CĐ${n("chua_dat")}`
        : "Chưa chốt tuần nào",
      `Khen ${inc.filter((i) => i.type === "khen").length}`,
      `Vi phạm ${inc.filter((i) => i.type === "vi_pham").length}`,
    ];
    return parts.join(" · ");
  }

  const active = students.filter((s) => isActive(s.status));

  async function exportExcel() {
    const head = ["STT", "Họ và tên", ...subjects, "Học tập", "Rèn luyện", "Nhận xét"];
    const rows = active.map((s, i) => {
      const e = evalOf(s.id);
      return [
        i + 1,
        s.fullName,
        ...subjects.map((sub) => show(resultOf(sub, s.id)).text.replace("*", "")),
        e?.studyLevel ? LEVEL_LABEL[e.studyLevel] : "",
        e?.conductLevel ? LEVEL_LABEL[e.conductLevel] : "",
        e?.comment ?? "",
      ];
    });
    await downloadTable(
      `danh-gia-${fileSafe(cls.name)}-${term === 3 ? "ca-nam" : `hk${term}`}.xlsx`,
      TERM_LABEL[term],
      head,
      rows,
    );
  }

  return (
    <div className="grid gap-4">
      <section className="site-card flex flex-wrap items-center gap-2 p-4">
        <div className="flex rounded-lg border p-0.5">
          {([1, 2, 3] as Term[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`rounded-md px-3 py-1 text-sm ${t === term ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => setTerm(t)}
            >
              {TERM_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp /> Nhập điểm môn từ file SMAS
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportExcel()} disabled={!books}>
            <Download /> Excel
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          multiple={false}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void (async () => {
              try {
                const bytes = new Uint8Array(await f.arrayBuffer());
                const sheet = readSmasSheet(bytes);
                const all = await loadClasses();
                setImporting({ sheet, bytes, classes: all.filter((c) => c.id === cls.id) });
              } catch (err) {
                setError(errorText(err));
              }
            })();
          }}
        />
        <p className="w-full text-xs text-muted-foreground">
          Mỗi môn lấy từ một sổ điểm của lớp này: sổ của chính thầy/cô hoặc file SMAS các thầy cô bộ
          môn gửi (cùng mẫu “Xuất Excel” của SMAS). Dấu * là chưa đủ cột điểm; “…” là môn nhận xét
          chưa đủ lượt đánh giá.
        </p>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      {books === null ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : !subjects.length ? (
        <p className="site-card p-6 text-center text-muted-foreground">
          Lớp chưa có sổ điểm nào. Bấm “Nhập điểm môn từ file SMAS” và chọn file Excel sổ điểm của
          từng môn.
        </p>
      ) : (
        <div className="site-card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="px-2 py-2 text-left">STT</th>
                <th className="min-w-[160px] px-2 py-2 text-left">Họ và tên</th>
                {subjects.map((s) => (
                  <th key={s} className="px-1 py-2 text-center" title={s}>
                    {s.length > 8 ? `${s.slice(0, 7)}…` : s}
                  </th>
                ))}
                <th className="px-2 py-2 text-left">Gợi ý học tập</th>
                <th className="px-2 py-2 text-left">Học tập</th>
                <th className="px-2 py-2 text-left">Rèn luyện</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.map((s, i) => {
                const results = subjects.map((sub) => ({
                  subject: sub,
                  result: resultOf(sub, s.id),
                }));
                const hint = studyLevel(results);
                const e = evalOf(s.id);
                return (
                  <tr key={s.id}>
                    <td className="px-2 py-1.5">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium">{s.fullName}</td>
                    {results.map((r) => {
                      const v = show(r.result);
                      return (
                        <td
                          key={r.subject}
                          className={`px-1 text-center ${v.low ? "font-semibold text-red-700" : ""} ${v.partial ? "text-muted-foreground" : ""}`}
                        >
                          {v.text}
                        </td>
                      );
                    })}
                    <td className="px-2 text-xs">
                      {hint.level ? (
                        <span
                          title={
                            hint.raisedBecause
                              ? `Nâng một mức theo khoản 3 Điều 9 (chỉ do môn ${hint.raisedBecause})`
                              : undefined
                          }
                        >
                          <b>{LEVEL_LABEL[hint.level]}</b>
                          {hint.raisedBecause ? " ↑" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground" title={hint.missing.join(", ")}>
                          Thiếu {hint.missing.length} môn
                        </span>
                      )}
                    </td>
                    <td className="px-2">
                      <LevelSelect
                        label={`Học tập – ${s.fullName}`}
                        value={e?.studyLevel ?? null}
                        suggested={hint.level}
                        onChange={(v) => void update(s, { studyLevel: v })}
                      />
                    </td>
                    <td className="px-2" title={conductHint(s.id)}>
                      <LevelSelect
                        label={`Rèn luyện – ${s.fullName}`}
                        value={e?.conductLevel ?? null}
                        suggested={
                          term === 3
                            ? yearConduct(
                                evalOf(s.id, 1)?.conductLevel ?? null,
                                evalOf(s.id, 2)?.conductLevel ?? null,
                              )
                            : null
                        }
                        onChange={(v) => void update(s, { conductLevel: v })}
                      />
                      <div className="text-[10px] text-muted-foreground">{conductHint(s.id)}</div>
                    </td>
                    <td className="px-2">
                      <Button
                        size="sm"
                        variant={e?.comment ? "secondary" : "ghost"}
                        onClick={() => setComment(s)}
                        aria-label={`Nhận xét – ${s.fullName}`}
                      >
                        <MessageSquareText /> {e?.comment ? "Sửa" : "Nhận xét"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {comment ? (
        <CommentDialog
          student={comment}
          term={term}
          value={evalOf(comment.id)?.comment ?? ""}
          onClose={() => setComment(null)}
          onSave={async (text) => {
            await update(comment, { comment: text });
            setComment(null);
          }}
        />
      ) : null}
      {importing ? (
        <SmasImportDialog
          sheet={importing.sheet}
          bytes={importing.bytes}
          classes={importing.classes}
          onClose={() => setImporting(null)}
          onDone={(_id, message) => {
            setImporting(null);
            setNotice(message);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function LevelSelect({
  label,
  value,
  suggested,
  onChange,
}: {
  label: string;
  value: Level | null;
  suggested: Level | null;
  onChange: (v: Level | null) => void;
}) {
  return (
    <select
      aria-label={label}
      className={`h-8 rounded-md border bg-background px-1 ${value === "chua_dat" ? "text-red-700" : ""}`}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as Level | null)}
    >
      <option value="">—</option>
      {LEVELS.map((l) => (
        <option key={l} value={l}>
          {LEVEL_LABEL[l]}
          {l === suggested ? " (gợi ý)" : ""}
        </option>
      ))}
    </select>
  );
}

function CommentDialog({
  student,
  term,
  value,
  onClose,
  onSave,
}: {
  student: StudentBasic;
  term: Term;
  value: string;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>
          Nhận xét {TERM_LABEL[term].toLowerCase()} · {student.fullName}
        </DialogTitle>
        <DialogDescription>
          Nhận xét lưu riêng cho từng học kỳ và cả năm. AI gợi ý nhận xét sẽ có ở đợt 3.
        </DialogDescription>
        <Textarea
          rows={6}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onSave(text.trim()).finally(() => setBusy(false));
            }}
          >
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
