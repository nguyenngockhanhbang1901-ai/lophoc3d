import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Box as BoxIcon,
  Copy,
  ImagePlus,
  LayoutTemplate,
  Play,
  Plus,
  Presentation,
  Redo2,
  RotateCcw,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  addActivity,
  addElement,
  addSlide,
  deleteActivity,
  deleteElement,
  deleteSlide,
  duplicateElement,
  duplicateSlide,
  findSlide,
  firstSlideId,
  moveActivity,
  moveElementInOrder,
  moveSlide,
  newSlideContent,
  newSlideLessonKey,
  randomId,
  renameActivity,
  reorderElement,
  replaceElement,
  resetSlideAnimation,
  restoreSlideLayout,
  setElementAnim,
  setSlideLayout,
  updateSlide,
  MAX_TEXT_LENGTH,
  type Box,
  type ElementPatch,
  type SlideContent,
  type SlideElement,
} from "@/lib/slides/model";
import { appearances, stepCount } from "@/lib/slides/animation";
import { fitElement, markCustom, refitSlide, type Measure } from "@/lib/slides/fit";
import { getLayout } from "@/lib/slides/layouts";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
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
import { SlideStage } from "./SlideStage";
import { ElementInspector } from "./ElementInspector";
import { AnimationPanel } from "./AnimationPanel";
import { LayoutPicker } from "./LayoutPicker";
import { MediaDialog, type MediaKind, type MediaPick } from "./MediaDialog";
import { domMeasure } from "./measure";

export const OVERFLOW_MESSAGE =
  "Nội dung vượt quá khung của layout. Tiếp tục chỉnh sửa có thể làm slide kém đẹp hơn mặc định. Bạn có muốn tiếp tục?";

function withMedia(el: SlideElement, pick: MediaPick, kind: MediaKind): SlideElement {
  const { src: _s, modelId: _m, alt: _a, ...rest } = el;
  void _s;
  void _m;
  void _a;
  return {
    ...rest,
    type: kind,
    ...(pick.src ? { src: pick.src } : {}),
    ...(pick.modelId ? { modelId: pick.modelId } : {}),
    ...(pick.alt ? { alt: pick.alt } : {}),
  };
}

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
  initialKey = "",
  measure = domMeasure,
}: {
  userId: string;
  client?: SlideStore;
  /** How tall a text box's text is (percent of slide height); the tests pass a fake. */
  measure?: Measure;
  /** Lesson to open first (from the Bài học page or the viewer); falls back to the first lesson. */
  initialKey?: string;
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
  const [elementId, setElementId] = useState<string | null>(null);
  const [tab, setTab] = useState("format");
  const [media, setMedia] = useState<{
    kind: MediaKind;
    elementId: string | null;
    switchable: boolean;
  } | null>(null);
  const [layoutFor, setLayoutFor] = useState<{ activityId: string | null } | null>(null);
  const [overflow, setOverflow] = useState<{ apply: () => void } | null>(null);
  const [previewStep, setPreviewStep] = useState<number | null>(null);
  const [editRequest, setEditRequest] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const content = hist?.present ?? null;
  const slideId = content
    ? selectedId && findSlide(content, selectedId)
      ? selectedId
      : firstSlideId(content)
    : null;
  const found = content && slideId ? findSlide(content, slideId) : null;
  const slide = found?.slide ?? null;
  const selectedEl = slide?.elements.find((e) => e.id === elementId) ?? null;
  const numbers = useMemo(
    () =>
      new Map(
        slide
          ? appearances(slide)
              .filter((a) => a.step > 0)
              .map((a) => [a.id, a.step])
          : [],
      ),
    [slide],
  );

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
        const first = rows.find((r) => r.lesson_key === initialKey) ?? rows[0];
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
  /** Saves what is pending, then opens the lesson read from the database in a new tab. */
  function openViewer(mode: "lecture" | "presentation") {
    if (!activeKey) return;
    const url = `/xem-bai?lesson=${encodeURIComponent(activeKey)}&mode=${mode}`;
    void flush().then(() => window.open(url, "_blank"));
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

  // A new slide starts with nothing selected and no preview running.
  useEffect(() => {
    setElementId(null);
    setPreviewStep(null);
  }, [slideId]);

  // "Xem thử": plays the slide's steps one by one, then returns to editing.
  useEffect(() => {
    if (previewStep === null || !slide) return;
    const total = stepCount(slide);
    const t = setTimeout(
      () => setPreviewStep((s) => (s === null || s >= total ? null : s + 1)),
      previewStep >= total ? 1500 : 900,
    );
    return () => clearTimeout(t);
  }, [previewStep, slide]);

  // Ctrl+Z / Ctrl+Y anywhere except while typing in a field.
  const historyKeys = useRef<(e: KeyboardEvent) => void>(() => {});
  historyKeys.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      stepHistory(undo);
    } else if (k === "y" || (k === "z" && e.shiftKey)) {
      e.preventDefault();
      stepHistory(redo);
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => historyKeys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  /**
   * Every change to one element goes through here: text is fitted to its box, and a change that
   * would push a layout box's content out of its frame asks first. "Đồng ý" keeps it (the box
   * becomes custom); "Hủy" drops the change.
   */
  function propose(next: SlideElement) {
    if (!slide) return;
    const sid = slide.id;
    const result = fitElement(slide, next, measure);
    if (result.overflow) {
      setOverflow({ apply: () => edit((c) => replaceElement(c, sid, markCustom(next))) });
      return;
    }
    edit((c) => replaceElement(c, sid, result.el));
  }
  const elementById = (id: string) => slide?.elements.find((e) => e.id === id) ?? null;
  function commitBox(id: string, box: Box) {
    const el = elementById(id);
    if (el) propose({ ...el, ...box });
  }
  function commitText(id: string, text: string) {
    const el = elementById(id);
    if (el) propose({ ...el, text: text.slice(0, MAX_TEXT_LENGTH) });
  }
  function patchSelected(patch: ElementPatch) {
    if (selectedEl) propose({ ...selectedEl, ...patch });
  }
  function onAddElement(type: "text" | "image" | "model3d") {
    if (!slide) return;
    if (type !== "text") {
      setMedia({ kind: type, elementId: null, switchable: false });
      return;
    }
    const newId = randomId();
    edit((c) => addElement(c, slide.id, "text", () => newId));
    setElementId(newId);
    setEditRequest(newId);
    setTab("format");
  }
  function openMediaFor(el: SlideElement) {
    const empty = !el.src && !el.modelId;
    setMedia({
      kind: el.type === "model3d" ? "model3d" : "image",
      elementId: el.id,
      switchable: Boolean(el.slot) && empty,
    });
  }
  function pickMedia(pick: MediaPick, kind: MediaKind) {
    if (!slide || !media) return;
    const sid = slide.id;
    const target = media.elementId ? elementById(media.elementId) : null;
    if (target) edit((c) => replaceElement(c, sid, withMedia(target, pick, kind)));
    else {
      const newId = randomId();
      edit((c) => {
        const added = addElement(c, sid, kind, () => newId);
        const el = findSlide(added, sid)?.slide.elements.find((e) => e.id === newId);
        return el ? replaceElement(added, sid, withMedia(el, pick, kind)) : added;
      });
      setElementId(newId);
    }
    setMedia(null);
  }
  function removeElement(id: string) {
    if (!slide) return;
    edit((c) => deleteElement(c, slide.id, id));
    setElementId(null);
  }
  function copyElement(id: string) {
    if (!slide) return;
    const newId = randomId();
    if (edit((c) => duplicateElement(c, slide.id, id, () => newId))) setElementId(newId);
  }
  function chooseLayout(layoutId: string) {
    const target = layoutFor;
    setLayoutFor(null);
    if (!target) return;
    if (target.activityId) {
      onAddSlide(target.activityId, layoutId);
      return;
    }
    if (!slide) return;
    const sid = slide.id;
    edit((c) => updateSlide(setSlideLayout(c, sid, layoutId), sid, (s) => refitSlide(s, measure)));
  }
  function restoreLayout() {
    if (!slide) return;
    const sid = slide.id;
    edit((c) => updateSlide(restoreSlideLayout(c, sid), sid, (s) => refitSlide(s, measure)));
  }
  const canRestore = Boolean(
    content && slide && restoreSlideLayout(content, slide.id, () => "x") !== content,
  );

  function onAddActivity() {
    const next = edit((c) => addActivity(c));
    const last = next?.activities[next.activities.length - 1];
    if (last?.slides[0]) setSelectedId(last.slides[0].id);
  }
  function onAddSlide(activityId: string, layoutId?: string) {
    const next = edit((c) => addSlide(c, activityId, layoutId));
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
          <>
            <Button variant="outline" size="sm" onClick={() => openViewer("lecture")}>
              <BookOpen />
              Xem bài giảng
            </Button>
            <Button variant="outline" size="sm" onClick={() => openViewer("presentation")}>
              <Presentation />
              Trình chiếu
            </Button>
          </>
        )}
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
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_330px]">
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
                  onClick={() => setLayoutFor({ activityId: a.id })}
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

          <main aria-label="Slide đang chọn" className="flex min-w-0 flex-col gap-2">
            {slide && (
              <>
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="toolbar"
                  aria-label="Chèn và bố cục"
                >
                  <Button variant="outline" size="sm" onClick={() => onAddElement("text")}>
                    <Type />
                    Văn bản
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onAddElement("image")}>
                    <ImagePlus />
                    Hình ảnh
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onAddElement("model3d")}>
                    <BoxIcon />
                    Mô hình 3D
                  </Button>
                  <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLayoutFor({ activityId: null })}
                  >
                    <LayoutTemplate />
                    Layout: {getLayout(slide.layout).name}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canRestore}
                    onClick={restoreLayout}
                  >
                    <RotateCcw />
                    Khôi phục layout mặc định
                  </Button>
                  <Button
                    variant={previewStep !== null ? "default" : "outline"}
                    size="sm"
                    className="ml-auto"
                    onClick={() => setPreviewStep((p) => (p === null ? 0 : null))}
                  >
                    <Play />
                    {previewStep !== null ? "Dừng xem thử" : "Xem thử"}
                  </Button>
                </div>
                {previewStep !== null ? (
                  <div
                    className="slide-preview"
                    title="Bấm để dừng xem thử"
                    onClick={() => setPreviewStep(null)}
                  >
                    <SlideCanvas key={`p-${slide.id}`} slide={slide} step={previewStep} />
                  </div>
                ) : (
                  <SlideStage
                    slide={slide}
                    selectedId={elementId}
                    numbers={numbers}
                    onSelect={setElementId}
                    onCommitBox={commitBox}
                    onCommitText={commitText}
                    onDelete={removeElement}
                    onDuplicate={copyElement}
                    onActivate={openMediaFor}
                    editRequest={editRequest}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Bấm đúp vào chữ để sửa · kéo các ô vuông để đổi kích thước (Shift giữ tỉ lệ) ·
                  phím mũi tên để dịch từng chút · Delete để xóa · giữ Alt để đặt tự do không bám
                  đường căn · số xanh là lượt Enter.
                </p>
              </>
            )}
          </main>

          <section className="flex flex-col gap-3" aria-label="Nội dung slide">
            {found && slide && (
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
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="w-full">
                    <TabsTrigger value="format" className="flex-1">
                      Định dạng
                    </TabsTrigger>
                    <TabsTrigger value="anim" className="flex-1">
                      Hiệu ứng
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="format" className="mt-3">
                    <ElementInspector
                      slide={slide}
                      el={selectedEl}
                      onPatch={patchSelected}
                      onBox={(box) => selectedEl && commitBox(selectedEl.id, box)}
                      onLayer={(to) =>
                        selectedEl && edit((c) => reorderElement(c, slide.id, selectedEl.id, to))
                      }
                      onDuplicate={() => selectedEl && copyElement(selectedEl.id)}
                      onDelete={() => selectedEl && removeElement(selectedEl.id)}
                      onMedia={() => selectedEl && openMediaFor(selectedEl)}
                    />
                  </TabsContent>
                  <TabsContent value="anim" className="mt-3">
                    <AnimationPanel
                      slide={slide}
                      selectedId={elementId}
                      previewing={previewStep !== null}
                      onSelect={setElementId}
                      onMode={(id, mode) => edit((c) => setElementAnim(c, slide.id, id, mode))}
                      onMove={(from, to) => edit((c) => moveElementInOrder(c, slide.id, from, to))}
                      onReset={() => edit((c) => resetSlideAnimation(c, slide.id))}
                      onPreview={() => setPreviewStep((p) => (p === null ? 0 : null))}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </section>
        </div>
      )}

      <LayoutPicker
        open={layoutFor !== null}
        title={layoutFor?.activityId ? "Chọn layout cho slide mới" : "Đổi layout của slide"}
        current={layoutFor?.activityId ? undefined : slide?.layout}
        onPick={chooseLayout}
        onClose={() => setLayoutFor(null)}
      />
      <MediaDialog
        kind={media?.kind ?? null}
        switchable={media?.switchable ?? false}
        initial={
          media?.elementId
            ? (() => {
                const el = elementById(media.elementId);
                return el
                  ? {
                      ...(el.src ? { src: el.src } : {}),
                      ...(el.modelId ? { modelId: el.modelId } : {}),
                      ...(el.alt ? { alt: el.alt } : {}),
                    }
                  : undefined;
              })()
            : undefined
        }
        onPick={pickMedia}
        onClose={() => setMedia(null)}
      />
      <AlertDialog
        open={overflow !== null}
        onOpenChange={(open) => {
          if (!open) setOverflow(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nội dung vượt khung</AlertDialogTitle>
            <AlertDialogDescription>{OVERFLOW_MESSAGE}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                overflow?.apply();
                setOverflow(null);
              }}
            >
              Đồng ý
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
