import { modelName } from "@/lib/slides/model-library";
import type { ElementType, SlideElement } from "@/lib/slides/types";

export const TYPE_NAMES: Record<ElementType, string> = {
  title: "Tiêu đề",
  text: "Văn bản",
  image: "Hình ảnh",
  model3d: "Mô hình 3D",
};
/** Short name of an element for lists: its kind plus the start of its text or its model. */
export function elementLabel(el: SlideElement): string {
  if (el.type === "title" || el.type === "text") {
    const t = el.text.replace(/\s+/g, " ").trim();
    return t ? (t.length > 34 ? `${t.slice(0, 34)}…` : t) : `${TYPE_NAMES[el.type]} (trống)`;
  }
  if (el.type === "model3d")
    return el.modelId
      ? modelName(el.modelId)
      : el.src
        ? "Mô hình của bạn"
        : "Mô hình 3D (chưa chọn)";
  return el.alt?.trim() || (el.src ? "Hình ảnh" : "Hình ảnh (chưa chọn)");
}
