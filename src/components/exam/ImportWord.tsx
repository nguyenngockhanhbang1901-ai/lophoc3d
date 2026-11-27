import { useMemo, useState } from "react";
import { AlertTriangle, Download, FileUp, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { imageFileToDataUrl } from "@/components/slides/media-files";
import { readDocx, imageMime } from "@/lib/exam/docx-reader";
import { splitQuestions } from "@/lib/exam/word-import";
import {
  KIND_LABEL,
  LEVEL_LABEL,
  questionGaps,
  type QuestionBody,
  type QuestionLevel,
} from "@/lib/exam/questions";
import { QuestionView } from "./ExamMath";
import { QuestionEditor, type Editing } from "./QuestionEditor";

interface Item {
  key: number;
  number: number | null;
  include: boolean;
  level: QuestionLevel;
  body: QuestionBody;
  issues: string[];
  source: string;
  edited: boolean;
}

export interface ImportedForSave {
  level: QuestionLevel;
  topic: string;
  body: QuestionBody;
}

/**
 * "Nhập từ Word": read the file in the browser, split it into questions, let the teacher review
 * each one next to what the file said, fix any of them in the normal editor, then save.
 */
export function ImportWord({
  userId,
  bankTitle,
  defaultTopic,
  busy,
  onSave,
  onClose,
}: {
  userId: string;
  bankTitle: string;
  defaultTopic: string;
  busy: boolean;
  onSave: (questions: ImportedForSave[]) => void;
  onClose: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [topic, setTopic] = useState(defaultTopic);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setItems(null);
    setError("");
    setReading(true);
    try {
      if (!/\.docx$/i.test(file.name))
        throw new Error(
          "Hãy chọn file Word .docx (file .doc cũ: mở bằng Word rồi Lưu thành .docx).",
        );
      const doc = readDocx(new Uint8Array(await file.arrayBuffer()));
      const found = splitQuestions(doc.paragraphs);
      if (!found.length)
        throw new Error("Không tìm thấy câu hỏi nào. Mỗi câu cần bắt đầu bằng “Câu 1.”, “Câu 2:”…");
      const next: Item[] = [];
      for (const [i, q] of found.entries()) {
        const issues = [...q.issues];
        let body = q.body;
        if (q.mediaPath) {
          const bytes = doc.media.get(q.mediaPath);
          const mime = imageMime(q.mediaPath);
          try {
            if (!bytes || !mime) throw new Error();
            const src = await imageFileToDataUrl(
              new File([bytes as BlobPart], q.mediaPath.split("/").pop() ?? "hinh", { type: mime }),
            );
            body = { ...body, media: { kind: "image", src } };
          } catch {
            issues.push("Không chèn được hình của câu này, hãy chèn lại bằng nút Sửa");
          }
        }
        next.push({
          key: i,
          number: q.number,
          include: true,
          level: q.level ?? "nb",
          body,
          issues,
          source: q.source,
          edited: false,
        });
      }
      setItems(next);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Không đọc được file Word");
    } finally {
      setReading(false);
    }
  }

  const stats = useMemo(() => {
    const list = items ?? [];
    const count = (k: string) => list.filter((q) => q.body.data.kind === k).length;
    return {
      total: list.length,
      mcq: count("mcq"),
      tf: count("tf"),
      short: count("short"),
      issues: list.filter((q) => q.issues.length && !q.edited).length,
      chosen: list.filter((q) => q.include).length,
    };
  }, [items]);

  const update = (key: number, patch: Partial<Item>) =>
    setItems((list) => list?.map((q) => (q.key === key ? { ...q, ...patch } : q)) ?? null);
  const shown = (items ?? []).filter((q) => !onlyIssues || (q.issues.length && !q.edited));

  return (
    <>
      <DialogTitle>Nhập đề từ Word vào “{bankTitle}”</DialogTitle>
      <DialogDescription>
        Mỗi câu bắt đầu bằng “Câu 1.”, “Câu 2:”… Đáp án đúng là chữ cái (hoặc nội dung) được gạch
        chân, tô màu đỏ, hoặc cả hai; cũng có thể ghi dòng “Đáp án: B”. Công thức gõ LaTeX ($…$)
        hoặc chèn bằng Equation của Word đều được.
      </DialogDescription>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          <FileUp size={16} />
          {fileName ? "Chọn file khác" : "Chọn file Word (.docx)"}
          <input
            type="file"
            className="sr-only"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={reading || busy}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <a
          className="inline-flex items-center gap-1 text-sm text-primary underline"
          href="/mau-de-thi.docx"
          download
        >
          <Download size={14} />
          Tải file Word mẫu
        </a>
        {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
      </div>
      {reading && <p className="text-sm">Đang đọc file…</p>}
      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      {items && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted p-2 text-sm">
            <span>
              Tách được <strong>{stats.total}</strong> câu: {stats.mcq} trắc nghiệm, {stats.tf}{" "}
              đúng/sai, {stats.short} trả lời ngắn.
            </span>
            {stats.issues > 0 ? (
              <span className="text-amber-800">
                <AlertTriangle className="mr-1 inline" size={14} />
                {stats.issues} câu cần xem lại
              </span>
            ) : (
              <span className="text-green-700">Không có câu nào cần xem lại.</span>
            )}
            <label className="ml-auto flex items-center gap-1">
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => setOnlyIssues(e.target.checked)}
              />
              Chỉ hiện câu cần xem lại
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              Chủ đề cho các câu
              <Input
                className="w-72"
                maxLength={150}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </label>
            <span className="text-muted-foreground">Mức độ:</span>
            {(Object.keys(LEVEL_LABEL) as QuestionLevel[]).map((l) => (
              <Button
                key={l}
                size="sm"
                variant="outline"
                onClick={() => setItems((list) => list?.map((q) => ({ ...q, level: l })) ?? null)}
              >
                Tất cả {LEVEL_LABEL[l]}
              </Button>
            ))}
          </div>

          <ol className="grid max-h-[55vh] gap-3 overflow-y-auto pr-1">
            {shown.map((q) => {
              const pending = q.edited ? questionGaps(q.body) : q.issues;
              return (
                <li
                  key={q.key}
                  className={`rounded-lg border p-3 ${q.include ? "" : "opacity-50"}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex items-center gap-1 font-semibold">
                      <input
                        type="checkbox"
                        checked={q.include}
                        onChange={(e) => update(q.key, { include: e.target.checked })}
                      />
                      Câu {q.number ?? q.key + 1}
                    </label>
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {KIND_LABEL[q.body.data.kind]}
                    </span>
                    <select
                      className="rounded border bg-background px-1 py-0.5"
                      value={q.level}
                      onChange={(e) => update(q.key, { level: e.target.value as QuestionLevel })}
                    >
                      {(Object.keys(LEVEL_LABEL) as QuestionLevel[]).map((l) => (
                        <option key={l} value={l}>
                          {LEVEL_LABEL[l]}
                        </option>
                      ))}
                    </select>
                    {q.edited && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-900">
                        Đã sửa
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto h-7"
                      onClick={() => setEditing(q)}
                    >
                      <Pencil />
                      Sửa
                    </Button>
                  </div>
                  {pending.length > 0 && (
                    <ul className="mb-2 list-disc rounded border border-amber-300 bg-amber-50 py-1 pl-6 pr-2 text-xs text-amber-900">
                      {pending.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  )}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        Web nhận được (đáp án tô xanh)
                      </div>
                      <QuestionView body={q.body} showAnswer />
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        Trong file Word
                      </div>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-sans text-xs">
                        {q.source}
                      </pre>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              disabled={busy || stats.chosen === 0}
              onClick={() =>
                onSave(
                  (items ?? [])
                    .filter((q) => q.include)
                    .map((q) => ({ level: q.level, topic, body: q.body })),
                )
              }
            >
              {busy ? "Đang lưu…" : `Lưu ${stats.chosen} câu vào ngân hàng`}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          {editing && (
            <QuestionEditor
              userId={userId}
              initial={{ level: editing.level, topic, body: editing.body }}
              busy={false}
              onCancel={() => setEditing(null)}
              onSave={(e: Editing) => {
                update(editing.key, { body: e.body, level: e.level, edited: true });
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
