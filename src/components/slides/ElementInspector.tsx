import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  Copy,
  ImageIcon,
  Italic,
  SendToBack,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ElementPatch } from "@/lib/slides/model";
import { slotOf } from "@/lib/slides/layouts";
import type { Align, Box, Slide, SlideElement } from "@/lib/slides/types";
import { modelName } from "@/lib/slides/model-library";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { TYPE_NAMES } from "./labels";

/**
 * A number box you can type into: what you type is kept as you type it and only applied with Enter,
 * on leaving the box, or straight away for the spinner arrows. Out-of-range values are brought into range.
 */
export function DraftNumber({
  label,
  value,
  min,
  max,
  step = 1,
  className,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  className: string;
  onCommit: (v: number) => void;
}) {
  const shown = String(Math.round(value * 100) / 100);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(shown);
  }, [shown, focused]);
  function apply(raw: string) {
    const v = Number(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(v)) {
      setText(shown);
      return;
    }
    const clamped = Math.min(max, Math.max(min, v));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      className={className}
      value={text}
      min={min}
      max={max}
      step={step}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        // typing has an inputType; spinner arrows and the arrow keys do not, so they apply at once
        const typed = Boolean((e.nativeEvent as InputEvent).inputType);
        if (!typed) apply(e.target.value);
      }}
      onBlur={(e) => {
        setFocused(false);
        apply(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          apply((e.target as HTMLInputElement).value);
        } else if (e.key === "Escape") setText(shown);
      }}
    />
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.5,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="w-12 shrink-0 text-muted-foreground">{label}</span>
      <DraftNumber
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        className="h-7 w-full min-w-0 rounded border bg-background px-1 text-sm"
        onCommit={onChange}
      />
    </label>
  );
}

/** "Định dạng": properties of the selected element (text style, position and size, layering). */
export function ElementInspector({
  slide,
  el,
  onPatch,
  onBox,
  onLayer,
  onDuplicate,
  onDelete,
  onMedia,
}: {
  slide: Slide;
  el: SlideElement | null;
  onPatch: (patch: ElementPatch) => void;
  onBox: (box: Box) => void;
  onLayer: (to: "front" | "back") => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMedia: () => void;
}) {
  if (!el)
    return (
      <p className="text-sm text-muted-foreground">
        Bấm vào một phần tử trên slide để chỉnh. Kéo để di chuyển, kéo các ô vuông ở góc để đổi kích
        thước, bấm đúp vào chữ để sửa ngay trên slide.
      </p>
    );
  const isText = el.type === "title" || el.type === "text";
  const slot = slotOf(slide.layout, el.slot);
  const box: Box = { x: el.x, y: el.y, w: el.w, h: el.h };
  const align = el.align ?? "left";
  const bold = el.bold ?? el.type === "title";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <strong className="mr-auto text-sm">
          {TYPE_NAMES[el.type]}
          {slot && (
            <span className="ml-1 font-normal text-muted-foreground">
              · ô {slot.label} của layout
            </span>
          )}
        </strong>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Đưa lên trên cùng"
          title="Đưa lên trên cùng"
          onClick={() => onLayer("front")}
        >
          <BringToFront />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Đưa xuống dưới cùng"
          title="Đưa xuống dưới cùng"
          onClick={() => onLayer("back")}
        >
          <SendToBack />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Nhân đôi phần tử"
          title="Nhân đôi (Ctrl+D)"
          onClick={onDuplicate}
        >
          <Copy />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Xóa phần tử"
          title="Xóa (Delete)"
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
      {el.custom && (
        <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Phần tử này đã được chỉnh ra ngoài layout. Dùng "Khôi phục layout mặc định" để đưa về như
          cũ.
        </p>
      )}

      {isText && (
        <>
          <Textarea
            aria-label={el.type === "title" ? "Nội dung tiêu đề" : "Nội dung văn bản"}
            rows={el.type === "title" ? 2 : 5}
            value={el.text}
            placeholder={
              el.type === "title" ? "Tiêu đề slide" : "Văn bản; công thức viết trong $…$"
            }
            onChange={(e) => onPatch({ text: e.target.value })}
          />
          <div className="flex flex-wrap items-center gap-1">
            <label className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Cỡ chữ</span>
              <DraftNumber
                label="Cỡ chữ"
                className="h-7 w-16 rounded border bg-background px-1 text-sm"
                min={8}
                max={200}
                value={el.fontSize ?? (el.type === "title" ? 40 : 24)}
                onCommit={(v) => onPatch({ fontSize: v })}
              />
            </label>
            <Button
              variant={bold ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              aria-label="Chữ đậm"
              aria-pressed={bold}
              onClick={() => onPatch({ bold: !bold })}
            >
              <Bold />
            </Button>
            <Button
              variant={el.italic ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              aria-label="Chữ nghiêng"
              aria-pressed={Boolean(el.italic)}
              onClick={() => onPatch({ italic: !el.italic })}
            >
              <Italic />
            </Button>
            <label className="flex items-center" title="Màu chữ">
              <input
                type="color"
                aria-label="Màu chữ"
                className="h-7 w-8 cursor-pointer rounded border bg-background p-0.5"
                value={el.color ?? "#111827"}
                onChange={(e) => onPatch({ color: e.target.value })}
              />
            </label>
            {(["left", "center", "right"] as Align[]).map((a) => {
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              const name = a === "left" ? "Căn trái" : a === "center" ? "Căn giữa" : "Căn phải";
              return (
                <Button
                  key={a}
                  variant={align === a ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  aria-label={name}
                  aria-pressed={align === a}
                  onClick={() => onPatch({ align: a })}
                >
                  <Icon />
                </Button>
              );
            })}
          </div>
          {el.fit !== undefined && el.fit < 1 && (
            <p className="text-xs text-muted-foreground">
              Chữ đang tự thu nhỏ còn {Math.round(el.fit * 100)}% để vừa khung.
            </p>
          )}
        </>
      )}

      {!isText && (
        <div className="flex items-center gap-2">
          {el.type === "image" && el.src ? (
            <img src={el.src} alt="" className="h-12 w-16 rounded border object-contain" />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm">
            {el.type === "image"
              ? el.src
                ? el.alt || "Ảnh đã chọn"
                : "Chưa chọn ảnh"
              : el.modelId
                ? modelName(el.modelId)
                : el.src
                  ? "Mô hình của bạn"
                  : "Chưa chọn mô hình"}
          </span>
          <Button variant="outline" size="sm" onClick={onMedia}>
            <ImageIcon />
            {el.type === "image" ? "Đổi ảnh" : "Đổi mô hình"}
          </Button>
        </div>
      )}

      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1 text-xs font-medium">Vị trí và kích thước (% slide)</legend>
        <NumberField
          label="Trái"
          value={box.x}
          min={0}
          max={100 - box.w}
          onChange={(x) => onBox({ ...box, x })}
        />
        <NumberField
          label="Trên"
          value={box.y}
          min={0}
          max={100 - box.h}
          onChange={(y) => onBox({ ...box, y })}
        />
        <NumberField
          label="Rộng"
          value={box.w}
          min={3}
          max={100 - box.x}
          onChange={(w) => onBox({ ...box, w })}
        />
        <NumberField
          label="Cao"
          value={box.h}
          min={3}
          max={100 - box.y}
          onChange={(h) => onBox({ ...box, h })}
        />
      </fieldset>
    </div>
  );
}
