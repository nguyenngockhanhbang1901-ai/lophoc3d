import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  HANDLES,
  moveBox,
  nudge,
  resizeBox,
  snapMove,
  snapResize,
  type Guides,
  type Handle,
} from "@/lib/slides/boxes";
import type { Box, Slide, SlideElement } from "@/lib/slides/types";
import { isTextElement } from "@/lib/slides/fit";
import { SlideCanvas, textStyle } from "./SlideCanvas";

type Drag = {
  id: string;
  handle: Handle | null;
  startX: number;
  startY: number;
  start: Box;
  keepRatio: boolean;
};
const NO_GUIDES: Guides = { vertical: [], horizontal: [] };
const boxStyle = (b: Box): CSSProperties => ({
  left: `${b.x}%`,
  top: `${b.y}%`,
  width: `${b.w}%`,
  height: `${b.h}%`,
});
const pick = (b: Box): Box => ({ x: b.x, y: b.y, w: b.w, h: b.h });

/**
 * The slide being edited, PowerPoint style: click to select (blue frame, 8 handles), drag to move,
 * drag a handle to resize (corners of pictures and models keep their shape; Shift keeps it for any
 * box), double-click text to type in place, arrow keys nudge (Shift = bigger steps), Delete removes.
 * Boxes snap to other boxes and to the slide centre (hold Alt to place freely). Nothing is saved
 * while dragging: the finished box is handed to `onCommitBox` once, so one drag is one undo step.
 */
export function SlideStage({
  slide,
  selectedId,
  numbers,
  onSelect,
  onCommitBox,
  onCommitText,
  onDelete,
  onDuplicate,
  onActivate,
  editRequest = null,
}: {
  slide: Slide;
  selectedId: string | null;
  numbers?: ReadonlyMap<string, number>;
  onSelect: (id: string | null) => void;
  onCommitBox: (id: string, box: Box) => void;
  onCommitText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  /** Double-click on a picture or model (opens its picker). */
  onActivate: (el: SlideElement) => void;
  /** Id of a text box that should open for typing right away (a box just added). */
  editRequest?: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<{ id: string; box: Box; guides: Guides } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const selected = slide.elements.find((e) => e.id === selectedId) ?? null;
  const drawn: Slide = draft
    ? {
        ...slide,
        elements: slide.elements.map((e) => (e.id === draft.id ? { ...e, ...draft.box } : e)),
      }
    : slide;
  const shown = drawn.elements.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    const el = editRequest ? slide.elements.find((e) => e.id === editRequest) : undefined;
    if (el && isTextElement(el)) setEditing({ id: el.id, text: el.text });
    // only when a new request arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);

  // A slide switch or an outside change ends any typing in place.
  useEffect(() => {
    setEditing((cur) => (cur && slide.elements.some((e) => e.id === cur.id) ? cur : null));
  }, [slide]);

  function percent(clientX: number, clientY: number, from: Drag) {
    const canvas = wrap.current?.querySelector(".slide-canvas");
    const r = canvas?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return { dx: 0, dy: 0 };
    return {
      dx: ((clientX - from.startX) / r.width) * 100,
      dy: ((clientY - from.startY) / r.height) * 100,
    };
  }

  useEffect(() => {
    function onMove(e: globalThis.PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const { dx, dy } = percent(e.clientX, e.clientY, d);
      const others = slide.elements.filter((o) => o.id !== d.id).map(pick);
      let next: { box: Box; guides: Guides };
      if (d.handle) {
        const raw = resizeBox(d.start, d.handle, dx, dy, d.keepRatio || e.shiftKey);
        next =
          e.altKey || d.keepRatio || e.shiftKey
            ? { box: raw, guides: NO_GUIDES }
            : snapResize(raw, d.handle, others);
      } else {
        const raw = moveBox(d.start, dx, dy);
        next = e.altKey ? { box: raw, guides: NO_GUIDES } : snapMove(raw, others);
      }
      setDraft({ id: d.id, ...next });
    }
    function onUp() {
      const d = drag.current;
      drag.current = null;
      const done = draftRef.current;
      setDraft(null);
      if (!d || !done) return;
      const b = done.box;
      const s = d.start;
      if (
        Math.abs(b.x - s.x) + Math.abs(b.y - s.y) + Math.abs(b.w - s.w) + Math.abs(b.h - s.h) >
        0.05
      )
        onCommitBox(d.id, b);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [slide, onCommitBox]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".slide-inline-editor")) return;
    wrap.current?.focus({ preventScroll: true });
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset["handle"] as
      Handle | undefined;
    const inFrame = target.closest(".slide-selection");
    const id =
      inFrame && selected
        ? selected.id
        : target.closest<HTMLElement>("[data-el-id]")?.dataset["elId"];
    const el = slide.elements.find((x) => x.id === id);
    if (!el) {
      if (editing) commitEditing();
      onSelect(null);
      return;
    }
    if (editing && editing.id !== el.id) commitEditing();
    if (el.id !== selectedId) onSelect(el.id);
    e.preventDefault();
    drag.current = {
      id: el.id,
      handle: handle ?? null,
      startX: e.clientX,
      startY: e.clientY,
      start: pick(el),
      keepRatio: Boolean(handle && handle.length === 2 && !isTextElement(el)),
    };
  }

  function startEditing(el: SlideElement) {
    if (isTextElement(el)) setEditing({ id: el.id, text: el.text });
    else onActivate(el);
  }
  function commitEditing() {
    if (!editing) return;
    const el = slide.elements.find((x) => x.id === editing.id);
    setEditing(null);
    if (el && el.text !== editing.text) onCommitText(el.id, editing.text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (editing || !selected) return;
    if ((e.target as HTMLElement).closest(".slide-inline-editor")) return;
    const step = e.shiftKey ? 5 : 0.5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      onCommitBox(selected.id, nudge(pick(selected), mv[0], mv[1]));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDelete(selected.id);
    } else if (e.key === "Escape") {
      onSelect(null);
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEditing(selected);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      onDuplicate(selected.id);
    }
  }

  const editEl = editing ? drawn.elements.find((x) => x.id === editing.id) : null;
  return (
    <div
      ref={wrap}
      className="slide-stage"
      tabIndex={0}
      role="application"
      aria-label="Khung soạn slide: bấm để chọn, kéo để di chuyển, bấm đúp để sửa chữ"
      data-dragging={draft ? "true" : undefined}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".slide-inline-editor")) return;
        const id =
          target.closest(".slide-selection") && selected
            ? selected.id
            : target.closest<HTMLElement>("[data-el-id]")?.dataset["elId"];
        const el = slide.elements.find((x) => x.id === id);
        if (el) startEditing(el);
      }}
      onKeyDown={onKeyDown}
    >
      <SlideCanvas slide={drawn} edit {...(numbers ? { numbers } : {})}>
        {drawn.elements
          .filter((el) => el.custom)
          .map((el) => (
            <span
              key={`c-${el.id}`}
              className="slide-custom-mark"
              style={{ left: `${el.x + el.w}%`, top: `${el.y}%` }}
              title="Đã chỉnh ngoài layout"
              aria-label="Đã chỉnh ngoài layout"
            />
          ))}
        {shown && !editing && (
          <div
            className="slide-selection"
            data-testid="slide-selection"
            data-custom={shown.custom ? "true" : undefined}
            style={boxStyle(shown)}
          >
            {HANDLES.map((h) => (
              <span key={h} className="slide-handle" data-handle={h} aria-hidden="true" />
            ))}
          </div>
        )}
        {draft?.guides.vertical.map((x) => (
          <span key={`v${x}`} className="slide-guide" data-dir="v" style={{ left: `${x}%` }} />
        ))}
        {draft?.guides.horizontal.map((y) => (
          <span key={`h${y}`} className="slide-guide" data-dir="h" style={{ top: `${y}%` }} />
        ))}
        {editing && editEl && (
          <textarea
            className="slide-inline-editor"
            aria-label="Sửa chữ trên slide"
            autoFocus
            value={editing.text}
            placeholder={
              editEl.type === "title" ? "Tiêu đề slide" : "Văn bản; công thức viết trong $…$"
            }
            style={{ ...boxStyle(editEl), ...textStyle(editEl) }}
            onChange={(e) => setEditing({ id: editing.id, text: e.target.value })}
            onBlur={commitEditing}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                setEditing(null);
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitEditing();
              }
            }}
          />
        )}
      </SlideCanvas>
    </div>
  );
}
