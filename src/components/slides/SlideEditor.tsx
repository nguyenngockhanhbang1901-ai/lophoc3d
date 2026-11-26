import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  addActivity,
  addElement,
  addSlide,
  deleteActivity,
  deleteElement,
  deleteSlide,
  duplicateSlide,
  findSlide,
  firstSlideId,
  moveActivity,
  moveSlide,
  newSlideContent,
  newSlideLessonKey,
  renameActivity,
  updateElementText,
  type ElementType,
  type SlideContent,
} from "@/lib/slides/model";
import {
  canRedo,
  canUndo,
  commit,
  redo,
  startHistory,
  undo,
  type History,
} from "@/lib/slides/history";
import {
  deleteSlideLesson,
  listSlideLessons,
  saveSlideLesson,
  type SlideLessonRow,
  type SlideStore,
} from "@/lib/slides/storage";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { SlideCanvas } from "./SlideCanvas";

export const AUTOSAVE_DELAY_MS = 800;
type Status = "idle" | "saving" | "saved" | "error";
type Pending = { row: SlideLessonRow };

/**
 * Phase 2 editor (normal mode): outline of activities and slides on the left, the slide in the
 * middle, the selected slide's content on the right. Everything is saved to the signed-in
 * teacher's own `lessons` rows, automatically.
 */
export function SlideEditor({
  userId,
  client = supabase,
}: {
  userId: string;
  client?: SlideStore;
}) {
  const [lessons, setLessons] = useState<SlideLessonRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [unreadable, setUnreadable] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [hist, setHist] = useState<History<SlideContent> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [confirm, setConfirm] = useState<{ message: string; onOk: () => void } | null>(null);
  const [dragFrom, setDragFrom] = useState<{ activityId: string; index: number } | null>(null);
  const pending = useRef<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const content = hist?.present ?? null;
  const slideId = content
    ? selectedId && findSlide(content, selectedId)
      ? selectedId
      : firstSlideId(content)
    : null;
  const found = content && slideId ? findSlide(content, slideId) : null;

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    setStatus("saving");
    try {
      await saveSlideLesson(client, userId, job.row);
      setStatus(pending.current ? "saving" : "saved");
    } catch {
      if (!pending.current) pending.current = job;
      setStatus("error");
    }
  }, [client, userId]);

  const queueSave = useCallback(
    (row: SlideLessonRow) => {
      pending.current = { row };
      setLessons((rows) => rows.map((r) => (r.lesson_key === row.lesson_key ? row : r)));
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  // Load this teacher's slide lessons once.
  useEffect(() => {
    let cancelled = false;
    listSlideLessons(client, userId)
      .then(({ lessons: rows, unreadable: bad }) => {
        if (cancelled) return;
        setLessons(rows);
        setUnreadable(bad);
        setLoaded(true);
        const first = rows[0];
        if (first) {
          setActiveKey(first.lesson_key);
          setTitle(first.title);
          setHist(startHistory(first.content));
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Không tải được bài học");
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, userId]);

  // Unsaved edits are written when the editor closes or the tab is hidden.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  function openLesson(row: SlideLessonRow) {
    void flush();
    setActiveKey(row.lesson_key);
    setTitle(row.title);
    setHist(startHistory(row.content));
    setSelectedId(null);
    setStatus("idle");
  }
  function selectLesson(key: string) {
    const row = lessons.find((l) => l.lesson_key === key);
    if (row && row.lesson_key !== activeKey) openLesson(row);
  }
  function createLesson() {
    void flush();
    const row: SlideLessonRow = {
      lesson_key: newSlideLessonKey(),
      title: "Bài học mới",
      content: newSlideContent(),
    };
    setLessons((rows) => [...rows, row]);
    setActiveKey(row.lesson_key);
    setTitle(row.title);
    setHist(startHistory(row.content));
    setSelectedId(null);
    pending.current = { row };
    void flush();
  }
  async function removeLesson() {
    if (!activeKey) return;
    const key = activeKey;
    pending.current = null;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    try {
      await deleteSlideLesson(client, userId, key);
    } catch {
      setStatus("error");
      return;
    }
    const rest = lessons.filter((l) => l.lesson_key !== key);
    setLessons(rest);
    const next = rest[0];
    if (next) openLesson(next);
    else {
      setActiveKey(null);
      setHist(null);
      setTitle("");
      setStatus("idle");
    }
  }

  function rowFor(c: SlideContent, t = title): SlideLessonRow {
    return { lesson_key: activeKey as string, title: t, content: c };
  }
  /** Applies a pure change; a no-op changes nothing and saves nothing. */
  function edit(fn: (c: SlideContent) => SlideContent): SlideContent | null {
    if (!hist || !activeKey) return null;
    const next = fn(hist.present);
    if (next === hist.present) return null;
    setHist(commit(hist, next));
    queueSave(rowFor(next));
    return next;
  }
  function stepHistory(fn: (h: History<SlideContent>) => History<SlideContent>) {
    if (!hist || !activeKey) return;
    const next = fn(hist);
    if (next === hist) return;
    setHist(next);
    queueSave(rowFor(next.present));
  }
  function changeTitle(value: string) {
    setTitle(value);
    if (content && activeKey) queueSave(rowFor(content, value));
  }

  function onAddActivity() {
    const next = edit((c) => addActivity(c));
    const last = next?.activities[next.activities.length - 1];
    if (last?.slides[0]) setSelectedId(last.slides[0].id);
  }
  function onAddSlide(activityId: string) {
    const next = edit((c) => addSlide(c, activityId));
    const slides = next?.activities.find((a) => a.id === activityId)?.slides;
    const created = slides?.[slides.length - 1];
    if (created) setSelectedId(created.id);
  }
  function onDuplicate() {
    if (!found) return;
    const next = edit((c) => duplicateSlide(c, found.slide.id));
    const copy = next && findSlide(next, found.slide.id)?.activity.slides[found.index + 1];
    if (copy) setSelectedId(copy.id);
  }
  function onDeleteSlide() {
    if (found) edit((c) => deleteSlide(c, found.slide.id));
  }
  function askDeleteActivity(id: string, name: string, slideCount: number) {
    const run = () => {
      edit((c) => deleteActivity(c, id));
    };
    if (slideCount > 1 || name.trim())
      setConfirm({
        message: `Xóa hoạt động "${name || "không tên"}" cùng ${slideCount} slide? Có thể bấm Hoàn tác ngay sau đó.`,
        onOk: run,
      });
    else run();
  }

  const statusText = {
    idle: "",
    saving: "Đang lưu…",
    saved: "Đã lưu",
    error: "Chưa lưu được – bấm để thử lại",
  }[status];

  if (!loaded) return <p role="status">Đang tải bài học…</p>;
  if (loadError)
    return (
      <p className="error-note" role="alert">
        {loadError}
      </p>
    );

  return (
    <div className="flex flex-col gap-4" data-testid="slide-editor">
      <div className="flex flex-wrap items-center gap-2">
        {lessons.length > 0 && (
          <select
            aria-label="Chọn bài học"
            className="entry-select"
            style={{ width: "auto", maxWidth: "24rem" }}
            value={activeKey ?? ""}
            onChange={(e) => {
              e.target.blur();
              selectLesson(e.target.value);
            }}
          >
            {lessons.map((l) => (
              <option key={l.lesson_key} value={l.lesson_key}>
                {l.title}
              </option>
            ))}
          </select>
        )}
        {activeKey && (
          <Input
            aria-label="Tên bài học"
            className="w-64"
            value={title}
            maxLength={150}
            onChange={(e) => changeTitle(e.target.value)}
          />
        )}
        <Button variant="outline" size="sm" onClick={createLesson}>
          <Plus />
          Thêm bài học
        </Button>
        {activeKey && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Xóa bài học"
            title="Xóa bài học"
            onClick={() =>
              setConfirm({
                message: `Xóa bài học "${title}" và toàn bộ slide? Không hoàn tác được.`,
                onOk: () => {
                  void removeLesson();
                },
              })
            }
          >
            <Trash2 />
          </Button>
        )}
        {hist && (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Hoàn tác"
              title="Hoàn tác"
              disabled={!canUndo(hist)}
              onClick={() => stepHistory(undo)}
            >
              <Undo2 />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Làm lại"
              title="Làm lại"
              disabled={!canRedo(hist)}
              onClick={() => stepHistory(redo)}
            >
              <Redo2 />
            </Button>
          </>
        )}
        {status === "error" ? (
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              void flush();
            }}
          >
            {statusText}
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {statusText}
          </span>
        )}
      </div>
      {unreadable > 0 && (
        <p className="text-sm text-muted-foreground" role="note">
          {unreadable} bài học có dữ liệu không đọc được nên chưa hiện trong danh sách; dữ liệu đó
          không bị sửa hay xóa.
        </p>
      )}

      {!hist || !content ? (
        <p>Chưa có bài học dạng slide. Bấm "Thêm bài học" để bắt đầu.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_320px]">
          <aside className="flex flex-col gap-3" aria-label="Hoạt động và slide">
            {content.activities.map((a, ai) => (
              <section
                key={a.id}
                className="rounded-md border p-2"
                aria-label={`Hoạt động ${ai + 1}`}
              >
                <div className="flex items-center gap-1">
                  <Input
                    aria-label={`Tên hoạt động ${ai + 1}`}
                    className="h-8"
                    value={a.title}
                    maxLength={150}
                    onChange={(e) => edit((c) => renameActivity(c, a.id, e.target.value))}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Đưa hoạt động ${ai + 1} lên`}
                    disabled={ai === 0}
                    onClick={() => edit((c) => moveActivity(c, ai, ai - 1))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Đưa hoạt động ${ai + 1} xuống`}
                    disabled={ai === content.activities.length - 1}
                    onClick={() => edit((c) => moveActivity(c, ai, ai + 1))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Xóa hoạt động ${ai + 1}`}
                    disabled={content.activities.length <= 1}
                    onClick={() => askDeleteActivity(a.id, a.title, a.slides.length)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <ol className="mt-2 flex flex-col gap-1">
                  {a.slides.map((s, si) => {
                    const label =
                      s.elements
                        .find((e) => e.text.trim())
                        ?.text.trim()
                        .slice(0, 40) || "Slide trống";
                    return (
                      <li
                        key={s.id}
                        draggable
                        onDragStart={() => setDragFrom({ activityId: a.id, index: si })}
                        onDragOver={(e) => {
                          if (dragFrom?.activityId === a.id) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragFrom?.activityId === a.id)
                            edit((c) => moveSlide(c, a.id, dragFrom.index, si));
                          setDragFrom(null);
                        }}
                        onDragEnd={() => setDragFrom(null)}
                      >
                        <button
                          type="button"
                          aria-current={s.id === slideId ? "true" : undefined}
                          className={`w-full truncate rounded px-2 py-1 text-left text-sm ${s.id === slideId ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                          onClick={() => setSelectedId(s.id)}
                        >
                          {si + 1}. {label}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full"
                  onClick={() => onAddSlide(a.id)}
                >
                  <Plus />
                  Thêm slide
                </Button>
              </section>
            ))}
            <Button variant="outline" size="sm" onClick={onAddActivity}>
              <Plus />
              Thêm hoạt động
            </Button>
          </aside>

          <main aria-label="Slide đang chọn">{found && <SlideCanvas slide={found.slide} />}</main>

          <section className="flex flex-col gap-3" aria-label="Nội dung slide">
            {found && (
              <>
                <div className="flex flex-wrap items-center gap-1">
                  <strong className="mr-auto text-sm">
                    {found.activity.title || "Hoạt động"} · Slide {found.index + 1}/
                    {found.activity.slides.length}
                  </strong>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Đưa slide lên"
                    disabled={found.index === 0}
                    onClick={() =>
                      edit((c) => moveSlide(c, found.activity.id, found.index, found.index - 1))
                    }
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Đưa slide xuống"
                    disabled={found.index === found.activity.slides.length - 1}
                    onClick={() =>
                      edit((c) => moveSlide(c, found.activity.id, found.index, found.index + 1))
                    }
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Nhân đôi slide"
                    title="Nhân đôi slide"
                    onClick={onDuplicate}
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Xóa slide"
                    title="Xóa slide"
                    disabled={found.activity.slides.length <= 1}
                    onClick={onDeleteSlide}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {found.slide.elements.map((e) => (
                  <div key={e.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{e.type === "title" ? "Tiêu đề" : "Văn bản"}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label={`Xóa phần tử ${e.type === "title" ? "tiêu đề" : "văn bản"}`}
                        onClick={() => edit((c) => deleteElement(c, found.slide.id, e.id))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <Textarea
                      aria-label={e.type === "title" ? "Nội dung tiêu đề" : "Nội dung văn bản"}
                      rows={e.type === "title" ? 2 : 6}
                      value={e.text}
                      placeholder={
                        e.type === "title" ? "Tiêu đề slide" : "Văn bản; công thức viết trong $…$"
                      }
                      onChange={(ev) =>
                        edit((c) => updateElementText(c, found.slide.id, e.id, ev.target.value))
                      }
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  {(["title", "text"] as ElementType[]).map((t) => (
                    <Button
                      key={t}
                      variant="outline"
                      size="sm"
                      onClick={() => edit((c) => addElement(c, found.slide.id, t))}
                    >
                      <Plus />
                      {t === "title" ? "Thêm tiêu đề" : "Thêm văn bản"}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onOk();
                setConfirm(null);
              }}
            >
              Đồng ý
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
