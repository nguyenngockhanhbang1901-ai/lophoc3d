// Sổ điểm cá nhân: books (class + subject + term) of the signed-in teacher, SMAS import/export,
// the score table and the in-class records.
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileUp, NotebookPen, Plus, Settings2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listExamClasses, type ExamClassSummary } from "@/lib/exam/classes.functions";
import {
  bookData,
  listBooks,
  smasTemplate,
  type BookData,
  type BookSummary,
} from "@/lib/gradebook/gradebook.functions";
import { readSmasSheet, fillSmasSheet, type SmasSheet } from "@/lib/gradebook/smas";
import { exportFills } from "@/lib/gradebook/smas-plan";
import { effectiveValues, isNumeric, termAverage } from "@/lib/gradebook/scores";
import { downloadTable, fileSafe } from "@/components/homeroom/sheets";
import { BonusDialog, BookSettingsDialog, NewBookDialog, SmasImportDialog } from "./BookDialogs";
import { BehaviorPanel } from "./BehaviorPanel";
import { ScoreGrid, sortedStudents, studentValues, type Student } from "./ScoreGrid";
import { downloadBytes, errorText, fromBase64 } from "./files";

const PICK_KEY = "lhs-so-diem";

type Dialog =
  | { kind: "new" }
  | { kind: "import"; sheet: SmasSheet; bytes: Uint8Array }
  | { kind: "settings" }
  | { kind: "bonus"; student: Student }
  | null;

const term = (n: 1 | 2) => (n === 1 ? "HK I" : "HK II");

export function GradebookPage() {
  const books = useServerFn(listBooks);
  const classesFn = useServerFn(listExamClasses);
  const loadBook = useServerFn(bookData);
  const template = useServerFn(smasTemplate);
  const [list, setList] = useState<BookSummary[] | null>(null);
  const [classes, setClasses] = useState<ExamClassSummary[]>([]);
  const [bookId, setBookId] = useState("");
  const [data, setData] = useState<BookData | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshList = useCallback(
    async (pick?: string) => {
      try {
        const [b, c] = await Promise.all([books(), classesFn()]);
        setList(b);
        setClasses(c);
        let remembered = "";
        try {
          remembered = localStorage.getItem(PICK_KEY) ?? "";
        } catch {
          /* private mode */
        }
        const want = pick ?? remembered;
        setBookId(b.some((x) => x.id === want) ? want : (b[0]?.id ?? ""));
      } catch (e) {
        setList([]);
        setError(errorText(e));
      }
    },
    [books, classesFn],
  );

  const refreshBook = useCallback(async () => {
    if (!bookId) {
      setData(null);
      return;
    }
    try {
      setData(await loadBook({ data: { bookId } }));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [bookId, loadBook]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);
  useEffect(() => {
    setData(null);
    void refreshBook();
    try {
      if (bookId) localStorage.setItem(PICK_KEY, bookId);
    } catch {
      /* private mode */
    }
  }, [bookId, refreshBook]);

  async function pickSmasFile(f: File) {
    setError("");
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      setDialog({ kind: "import", sheet: readSmasSheet(bytes), bytes });
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function exportSmas() {
    if (!data) return;
    try {
      const t = await template({ data: { bookId: data.book.id } });
      const bytes = fromBase64(t.template);
      const out = fillSmasSheet(
        bytes,
        t.map.sheetPath,
        exportFills(
          {
            columns: data.book.columns,
            bonusTarget: data.book.bonusTarget,
            scores: data.scores,
            bonus: data.bonus,
          },
          t.map,
        ),
      );
      downloadBytes(
        out,
        `SDGHS_${fileSafe(data.book.className)}_${data.book.schoolYear || "nam-hoc"}_${data.book.semester}.xlsx`,
      );
      const unmatched = t.map.rows.filter((r) => !r.studentId).length;
      setNotice(
        `Đã tạo file SMAS. Vào SMAS → Sổ điểm → Nhập từ Excel và chọn file vừa tải.${unmatched ? ` ${unmatched} dòng trong file không khớp học sinh nên giữ nguyên.` : ""}`,
      );
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function exportPlain() {
    if (!data) return;
    const cols = data.book.columns;
    const { raw, txt, bonus } = studentValues(data);
    const head = [
      "STT",
      "Họ và tên",
      "Mã học sinh",
      ...cols.map((c) => c.label),
      "Cộng",
      "Trừ",
      "ĐTB",
    ];
    const rows = sortedStudents(data).map((s, i) => {
      const b = bonus.get(s.id);
      const eff = effectiveValues(cols, raw.get(s.id) ?? {}, b, data.book.bonusTarget);
      const avg = termAverage(cols, eff).average;
      return [
        i + 1,
        s.fullName,
        s.studentCode ?? "",
        ...cols.map((c) => (isNumeric(c) ? (eff[c.key] ?? "") : (txt.get(s.id)?.[c.key] ?? ""))),
        b?.plus || "",
        b?.minus || "",
        avg ?? "",
      ];
    });
    await downloadTable(
      `so-diem-${fileSafe(data.book.subject)}-${fileSafe(data.book.className)}-hk${data.book.semester}.xlsx`,
      "Sổ điểm",
      head,
      rows,
    );
  }

  const current = list?.find((b) => b.id === bookId);

  return (
    <div className="grid gap-4">
      <section className="site-card flex flex-wrap items-center gap-2 p-4">
        {list?.length ? (
          <select
            className="h-9 rounded-md border bg-background px-3 font-semibold"
            value={bookId}
            onChange={(e) => setBookId(e.target.value)}
            aria-label="Chọn sổ điểm"
          >
            {list.map((b) => (
              <option key={b.id} value={b.id}>
                {b.subject} · {b.className} · {term(b.semester)} {b.schoolYear}
              </option>
            ))}
          </select>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp /> Nhập từ SMAS
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog({ kind: "new" })}
            disabled={!classes.length}
          >
            <Plus /> Sổ mới
          </Button>
          {data ? (
            <>
              {current?.hasSmas ? (
                <Button size="sm" onClick={() => void exportSmas()}>
                  <Upload /> Xuất file SMAS
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => void exportPlain()}>
                <Download /> Excel
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "settings" })}>
                <Settings2 /> Cài đặt sổ
              </Button>
            </>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pickSmasFile(f);
          }}
        />
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
      ) : null}

      {list === null ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : !list.length ? (
        <div className="site-card mx-auto grid max-w-xl gap-3 p-6 text-center">
          <NotebookPen className="mx-auto h-10 w-10 text-primary" />
          <h2 className="site-section-title justify-center">Chưa có sổ điểm</h2>
          <p className="text-sm text-muted-foreground">
            Cách nhanh nhất: trên SMAS vào Sổ điểm, chọn lớp – môn – học kỳ, bấm Xuất Excel, rồi
            “Nhập từ SMAS” ở đây. Lớp Học Số đọc đúng các cột điểm, ghép học sinh theo mã và giữ lại
            file để xuất ngược lên SMAS.
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => fileRef.current?.click()}>
              <FileUp /> Nhập từ SMAS
            </Button>
            <Button
              variant="outline"
              onClick={() => setDialog({ kind: "new" })}
              disabled={!classes.length}
            >
              <Plus /> Tạo sổ trống
            </Button>
          </div>
        </div>
      ) : !data ? (
        <p className="text-muted-foreground">Đang mở sổ…</p>
      ) : (
        <Tabs defaultValue="diem">
          <TabsList>
            <TabsTrigger value="diem">Bảng điểm</TabsTrigger>
            <TabsTrigger value="ghi-nhan">Ghi nhận trong tiết</TabsTrigger>
          </TabsList>
          <TabsContent value="diem">
            <ScoreGrid
              data={data}
              onChanged={(cells) =>
                setData((d) => {
                  if (!d) return d;
                  const rest = d.scores.filter(
                    (s) => !cells.some((c) => c.studentId === s.studentId && c.key === s.key),
                  );
                  return {
                    ...d,
                    scores: [...rest, ...cells.filter((c) => c.num !== null || c.txt)],
                  };
                })
              }
              onBonus={(student) => setDialog({ kind: "bonus", student })}
            />
          </TabsContent>
          <TabsContent value="ghi-nhan">
            <BehaviorPanel data={data} onRecorded={() => void refreshBook()} />
          </TabsContent>
        </Tabs>
      )}

      {dialog?.kind === "new" ? (
        <NewBookDialog
          classes={classes}
          onClose={() => setDialog(null)}
          onCreated={(id) => {
            setDialog(null);
            void refreshList(id);
          }}
        />
      ) : null}
      {dialog?.kind === "import" ? (
        <SmasImportDialog
          sheet={dialog.sheet}
          bytes={dialog.bytes}
          classes={classes}
          onClose={() => setDialog(null)}
          onDone={(id, message) => {
            setDialog(null);
            setNotice(message);
            if (id === bookId) void refreshBook();
            void refreshList(id);
          }}
        />
      ) : null}
      {dialog?.kind === "settings" && data ? (
        <BookSettingsDialog
          data={data}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void refreshBook();
          }}
          onDeleted={() => {
            setDialog(null);
            void refreshList("");
          }}
        />
      ) : null}
      {dialog?.kind === "bonus" && data ? (
        <BonusDialog
          data={data}
          student={dialog.student}
          onClose={() => setDialog(null)}
          onSaved={(b) => {
            setDialog(null);
            setData((d) =>
              d
                ? {
                    ...d,
                    bonus: [
                      ...d.bonus.filter((x) => x.studentId !== dialog.student.id),
                      { studentId: dialog.student.id, ...b },
                    ],
                  }
                : d,
            );
          }}
        />
      ) : null}
    </div>
  );
}
