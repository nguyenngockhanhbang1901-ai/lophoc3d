import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Play, RotateCcw } from "lucide-react";
import { appearances } from "@/lib/slides/animation";
import type { AnimMode, Slide } from "@/lib/slides/types";
import { Button } from "../ui/button";
import { TYPE_NAMES, elementLabel } from "./labels";

export const MODE_LABELS: Record<AnimMode, string> = {
  enter: "Khi nhấn Enter",
  with: "Cùng lúc với phần tử trước",
  immediate: "Hiện ngay",
};

/**
 * "Hiệu ứng": the slide's appearance list, like PowerPoint's animation pane. Each row is one
 * element in the order it appears; drag a row (or use the arrows) to change the order, and pick
 * how it appears. "Cùng lúc với phần tử trước" merges it into the step above, so several
 * elements show on one Enter.
 */
export function AnimationPanel({
  slide,
  selectedId,
  previewing,
  onSelect,
  onMode,
  onMove,
  onReset,
  onPreview,
}: {
  slide: Slide;
  selectedId: string | null;
  previewing: boolean;
  onSelect: (id: string) => void;
  onMode: (id: string, mode: AnimMode) => void;
  onMove: (from: number, to: number) => void;
  onReset: () => void;
  onPreview: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const rows = appearances(slide);
  const byId = new Map(slide.elements.map((e) => [e.id, e]));
  const steps = rows.reduce((m, r) => Math.max(m, r.step), 0);

  return (
    <div className="flex flex-col gap-2" aria-label="Thứ tự xuất hiện">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onPreview} aria-pressed={previewing}>
          <Play />
          {previewing ? "Dừng xem thử" : "Xem thử"}
        </Button>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw />
          Đặt lại tự động
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {steps === 0
          ? "Mọi phần tử hiện ngay khi mở slide."
          : `Slide cần ${steps} lần nhấn Enter. Kéo để đổi thứ tự; chọn "Cùng lúc với phần tử trước" để gộp vào lượt trên.`}
      </p>
      <ol className="flex flex-col gap-1">
        {rows.map((r, i) => {
          const el = byId.get(r.id);
          if (!el) return null;
          const merged = r.mode === "with" && i > 0;
          return (
            <li
              key={r.id}
              draggable
              data-testid="anim-row"
              data-step={r.step}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i);
                setDragFrom(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setOver(null);
              }}
              className={`rounded-md border p-1.5 ${merged ? "ml-5" : ""} ${r.id === selectedId ? "border-primary bg-accent" : ""} ${over === i && dragFrom !== i ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex items-center gap-1">
                <GripVertical
                  className="size-4 shrink-0 cursor-grab text-muted-foreground"
                  aria-hidden="true"
                />
                <span
                  className="inline-flex h-5 min-w-9 shrink-0 items-center justify-center rounded bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
                  title={r.step === 0 ? "Hiện ngay khi mở slide" : `Lần nhấn Enter thứ ${r.step}`}
                >
                  {r.step === 0 ? "Ngay" : `Enter ${r.step}`}
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm"
                  onClick={() => onSelect(r.id)}
                  title={`${TYPE_NAMES[el.type]}: ${elementLabel(el)}`}
                >
                  {elementLabel(el)}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Đưa "${elementLabel(el)}" lên trước`}
                  disabled={i === 0}
                  onClick={() => onMove(i, i - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Đưa "${elementLabel(el)}" ra sau`}
                  disabled={i === rows.length - 1}
                  onClick={() => onMove(i, i + 1)}
                >
                  <ArrowDown />
                </Button>
              </div>
              <select
                aria-label={`Cách xuất hiện của "${elementLabel(el)}"`}
                className="mt-1 h-7 w-full rounded border bg-background px-1 text-xs"
                value={r.mode}
                onChange={(e) => onMode(r.id, e.target.value as AnimMode)}
              >
                {(Object.keys(MODE_LABELS) as AnimMode[]).map((m) => (
                  <option key={m} value={m} disabled={m === "with" && i === 0}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
