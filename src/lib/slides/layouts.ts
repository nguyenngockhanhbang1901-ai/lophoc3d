import {
  randomId,
  type Box,
  type ElementType,
  type IdFactory,
  type Slide,
  type SlideElement,
} from "./types";

/**
 * Slide layouts are data: a name and a list of slots, each a box in percent of the 16:9 slide.
 * A slot is filled by one element of the same kind (title / text / media = image or 3D model).
 */
export type SlotKind = "title" | "text" | "media";
export type LayoutSlot = {
  id: string;
  kind: SlotKind;
  label: string;
  box: Box;
  fontSize?: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
};
export type LayoutDef = { id: string; name: string; slots: readonly LayoutSlot[] };

const TITLE: LayoutSlot = {
  id: "title",
  kind: "title",
  label: "Tiêu đề",
  box: { x: 5, y: 5, w: 90, h: 15 },
  fontSize: 40,
  bold: true,
};
const LEFT_BOX: Box = { x: 5, y: 25, w: 43, h: 65 };
const RIGHT_BOX: Box = { x: 52, y: 25, w: 43, h: 65 };

export const DEFAULT_LAYOUT_ID = "title-content";
export const BLANK_LAYOUT_ID = "blank";

export const LAYOUTS: readonly LayoutDef[] = [
  {
    id: "cover",
    name: "Trang bìa",
    slots: [
      {
        id: "title",
        kind: "title",
        label: "Tiêu đề",
        box: { x: 10, y: 30, w: 80, h: 20 },
        fontSize: 54,
        bold: true,
        align: "center",
      },
      {
        id: "subtitle",
        kind: "text",
        label: "Phụ đề",
        box: { x: 10, y: 55, w: 80, h: 15 },
        fontSize: 28,
        align: "center",
      },
    ],
  },
  {
    id: "title-content",
    name: "Tiêu đề + nội dung",
    slots: [
      TITLE,
      {
        id: "content",
        kind: "text",
        label: "Nội dung",
        box: { x: 5, y: 25, w: 90, h: 65 },
        fontSize: 24,
      },
    ],
  },
  {
    id: "two-columns",
    name: "Hai cột",
    slots: [
      TITLE,
      { id: "left", kind: "text", label: "Cột trái", box: LEFT_BOX, fontSize: 24 },
      { id: "right", kind: "text", label: "Cột phải", box: RIGHT_BOX, fontSize: 24 },
    ],
  },
  {
    id: "text-media",
    name: "Văn bản + hình/3D",
    slots: [
      TITLE,
      { id: "text", kind: "text", label: "Văn bản", box: LEFT_BOX, fontSize: 24 },
      { id: "media", kind: "media", label: "Hình hoặc 3D", box: RIGHT_BOX },
    ],
  },
  {
    id: "media-caption",
    name: "Hình/3D lớn + chú thích",
    slots: [
      TITLE,
      { id: "media", kind: "media", label: "Hình hoặc 3D", box: { x: 10, y: 22, w: 80, h: 55 } },
      {
        id: "caption",
        kind: "text",
        label: "Chú thích",
        box: { x: 10, y: 80, w: 80, h: 12 },
        fontSize: 20,
        align: "center",
      },
    ],
  },
  {
    id: "two-media",
    name: "Hai hình/3D",
    slots: [
      TITLE,
      { id: "media1", kind: "media", label: "Hình 1", box: LEFT_BOX },
      { id: "media2", kind: "media", label: "Hình 2", box: RIGHT_BOX },
    ],
  },
  { id: BLANK_LAYOUT_ID, name: "Trống", slots: [] },
];

export function getLayout(id: string): LayoutDef {
  return (
    LAYOUTS.find((l) => l.id === id) ??
    (LAYOUTS.find((l) => l.id === DEFAULT_LAYOUT_ID) as LayoutDef)
  );
}
export function slotOf(layoutId: string, slotId: string | undefined): LayoutSlot | undefined {
  return slotId ? getLayout(layoutId).slots.find((s) => s.id === slotId) : undefined;
}

export function slotKindOf(type: ElementType): SlotKind {
  return type === "title" ? "title" : type === "text" ? "text" : "media";
}

/** Defaults a new element of this type starts with when no layout slot decides them. */
export function defaultStyle(type: ElementType): Pick<SlideElement, "fontSize" | "bold" | "align"> {
  if (type === "title") return { fontSize: 40, bold: true, align: "left" };
  if (type === "text") return { fontSize: 24, bold: false, align: "left" };
  return {};
}

function elementForSlot(slot: LayoutSlot, id: IdFactory): SlideElement {
  const type: ElementType =
    slot.kind === "media" ? "image" : slot.kind === "title" ? "title" : "text";
  return {
    id: id(),
    type,
    ...slot.box,
    text: "",
    slot: slot.id,
    anim: "enter",
    ...(slot.kind === "media"
      ? { src: "" }
      : { fontSize: slot.fontSize ?? 24, bold: slot.bold ?? false, align: slot.align ?? "left" }),
  };
}
function bindToSlot(el: SlideElement, slot: LayoutSlot): SlideElement {
  const { custom: _custom, fit: _fit, ...rest } = el;
  void _custom;
  void _fit;
  return {
    ...rest,
    ...slot.box,
    slot: slot.id,
    ...(slot.kind === "media"
      ? {}
      : {
          fontSize: slot.fontSize ?? el.fontSize ?? 24,
          bold: slot.bold ?? el.bold ?? false,
          align: slot.align ?? el.align ?? "left",
        }),
  };
}

/**
 * Puts a slide into a layout without losing content: each slot takes the next element of the
 * same kind (in the slide's current order), missing slots get an empty placeholder, and any
 * element left over stays where it is as a free element. The blank layout frees everything.
 */
export function applyLayout(slide: Slide, layoutId: string, id: IdFactory = randomId): Slide {
  const layout = getLayout(layoutId);
  const ordered = [...slide.elements].sort(
    (a, b) => slide.order.indexOf(a.id) - slide.order.indexOf(b.id),
  );
  const used = new Set<string>();
  const byId = new Map<string, SlideElement>();
  const created: SlideElement[] = [];
  for (const slot of layout.slots) {
    const match = ordered.find((e) => !used.has(e.id) && slotKindOf(e.type) === slot.kind);
    if (match) {
      used.add(match.id);
      byId.set(match.id, bindToSlot(match, slot));
    } else created.push(elementForSlot(slot, id));
  }
  const elements = [
    ...slide.elements.map((e) => byId.get(e.id) ?? (e.slot ? stripSlot(e) : e)),
    ...created,
  ];
  return {
    ...slide,
    layout: layout.id,
    elements,
    order: [
      ...slide.order.filter((i) => elements.some((e) => e.id === i)),
      ...created.map((e) => e.id),
    ],
  };
}
function stripSlot(el: SlideElement): SlideElement {
  const { slot: _slot, ...rest } = el;
  void _slot;
  return rest;
}

/** "Khôi phục layout mặc định": every slot-bound element returns to its slot; custom marks go away. */
export function restoreLayout(slide: Slide, id: IdFactory = randomId): Slide {
  const layout = getLayout(slide.layout);
  const restored = slide.elements.map((e) => {
    const slot = e.slot ? layout.slots.find((s) => s.id === e.slot) : undefined;
    return slot ? bindToSlot(e, slot) : e;
  });
  const missing = layout.slots
    .filter((s) => !restored.some((e) => e.slot === s.id))
    .map((s) => elementForSlot(s, id));
  const elements = [...restored, ...missing];
  return {
    ...slide,
    elements,
    order: [
      ...slide.order.filter((i) => elements.some((e) => e.id === i)),
      ...missing.map((e) => e.id),
    ],
  };
}

/** True when a slot-bound element no longer matches its layout (moved, resized or overflowing on purpose). */
export function isCustomized(slide: Slide, el: SlideElement): boolean {
  if (el.custom) return true;
  const slot = slotOf(slide.layout, el.slot);
  return Boolean(slot) && !sameBox(el, (slot as LayoutSlot).box);
}
export function sameBox(a: Box, b: Box, eps = 0.05): boolean {
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.w - b.w) <= eps &&
    Math.abs(a.h - b.h) <= eps
  );
}
/** Is `box` entirely inside the slot's box (a small tolerance keeps rounding from tripping the warning)? */
export function insideBox(box: Box, outer: Box, eps = 0.3): boolean {
  return (
    box.x >= outer.x - eps &&
    box.y >= outer.y - eps &&
    box.x + box.w <= outer.x + outer.w + eps &&
    box.y + box.h <= outer.y + outer.h + eps
  );
}
