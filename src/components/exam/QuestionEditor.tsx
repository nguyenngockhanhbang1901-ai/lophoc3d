import { useMemo, useState } from "react";
import { Box, ClipboardPaste, ImagePlus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  KIND_LABEL,
  LEVEL_LABEL,
  OPTION_LETTERS,
  STATEMENT_LETTERS,
  changeKind,
  questionGaps,
  type QuestionBody,
  type QuestionKind,
  type QuestionLevel,
} from "@/lib/exam/questions";
import { scoreShare } from "@/lib/exam/grading";
import { MathField, QuestionView } from "./ExamMath";
import { imageFileToDataUrl } from "@/components/slides/media-files";

export type Editing = { id?: string; level: QuestionLevel; topic: string; body: QuestionBody };

export function QuestionEditor({
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

  const [pasteNote, setPasteNote] = useState("");

  async function attachImageFile(file: File) {
    setPasteNote("Đang chèn ảnh…");
    try {
      const src = await imageFileToDataUrl(file);
      setDraft((x) => ({ ...x, body: { ...x.body, media: { kind: "image", src } } }));
      setPasteNote("");
    } catch (e) {
      setPasteNote(e instanceof Error && e.message ? e.message : "Không chèn được ảnh này");
    }
  }

  /** Ctrl+V anywhere in the editor: a copied picture (screenshot, image copied from Word or a web page) becomes the figure. */
  function onPaste(e: React.ClipboardEvent) {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    const typing =
      (e.target as HTMLElement).tagName === "TEXTAREA" ||
      (e.target as HTMLElement).tagName === "INPUT";
    // copying from Word puts both the text and a picture of it on the clipboard: keep text pastes in text boxes
    if (typing && e.clipboardData.getData("text/plain").trim()) return;
    e.preventDefault();
    void attachImageFile(file);
  }

  /** The "Dán ảnh" button: read a picture from the clipboard (Chrome/Edge ask for permission once). */
  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          await attachImageFile(new File([blob], "anh-dan.png", { type }));
          return;
        }
      }
      setPasteNote(
        "Bộ nhớ tạm không có ảnh. Hãy sao chép ảnh (hoặc chụp màn hình) rồi bấm lại, hoặc nhấn Ctrl+V trong khung soạn câu.",
      );
    } catch {
      setPasteNote(
        "Trình duyệt chưa cho đọc bộ nhớ tạm. Hãy nhấn Ctrl+V trong khung soạn câu để dán ảnh.",
      );
    }
  }

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
    <div onPaste={onPaste} className="contents">
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
                {body.media.kind === "image" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void pasteFromClipboard()}
                    title="Thay bằng ảnh trong bộ nhớ tạm"
                  >
                    <ClipboardPaste />
                    Dán ảnh khác
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setBody({ ...body, media: null })}>
                  <X />
                  Bỏ
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => void pasteFromClipboard()}>
                  <ClipboardPaste />
                  Dán ảnh (Ctrl+V)
                </Button>
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
          {pasteNote ? (
            <p className="text-sm text-amber-800" role="status">
              {pasteNote}
            </p>
          ) : (
            !body.media && (
              <p className="-mt-2 text-xs text-muted-foreground">
                Mẹo: chụp màn hình hoặc sao chép hình trong Word, rồi nhấn Ctrl+V ngay trong khung
                này.
              </p>
            )
          )}

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
    </div>
  );
}
