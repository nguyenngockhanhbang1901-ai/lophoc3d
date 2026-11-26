import type { CSSProperties, ReactNode } from "react";
import { MathText } from "../MathText";
import { visibleIds } from "@/lib/slides/animation";
import { REFERENCE_WIDTH, type Slide, type SlideElement } from "@/lib/slides/types";
import { modelName } from "@/lib/slides/model-library";
import { ModelView } from "./ModelView";
import "./slides.css";

/** Text size in cqw: stored px of a 1280px slide, times the editor's fit factor. */
export function textSizeCqw(el: Pick<SlideElement, "fontSize" | "fit" | "type">): number {
  const base = el.fontSize ?? (el.type === "title" ? 40 : 24);
  return Math.round(((base * (el.fit ?? 1)) / (REFERENCE_WIDTH / 100)) * 1000) / 1000;
}
export function textStyle(el: SlideElement): CSSProperties {
  return {
    fontSize: `${textSizeCqw(el)}cqw`,
    fontWeight: (el.bold ?? el.type === "title") ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textAlign: el.align ?? "left",
    ...(el.color ? { color: el.color } : {}),
  };
}

export function ElementView({
  el,
  visible,
  edit = false,
  number,
}: {
  el: SlideElement;
  visible: boolean;
  edit?: boolean;
  number?: number;
}) {
  const isText = el.type === "title" || el.type === "text";
  return (
    <div
      className="slide-el"
      data-el-id={el.id}
      data-hidden={visible ? undefined : "true"}
      data-edit={edit ? "true" : undefined}
      style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
    >
      {isText ? (
        el.type === "title" ? (
          <h2
            className="slide-text"
            data-overflow={el.custom ? "visible" : undefined}
            style={textStyle(el)}
          >
            <MathText text={el.text} />
          </h2>
        ) : (
          <div
            className="slide-text"
            data-overflow={el.custom ? "visible" : undefined}
            style={textStyle(el)}
          >
            <MathText text={el.text} />
          </div>
        )
      ) : el.type === "image" ? (
        el.src ? (
          <img className="slide-image" src={el.src} alt={el.alt ?? ""} draggable={false} />
        ) : edit ? (
          <div className="slide-placeholder">Chọn hình ảnh</div>
        ) : null
      ) : // a 3D scene only starts once it is on screen
      el.modelId ? (
        visible || edit ? (
          <ModelView id={el.modelId} />
        ) : null
      ) : edit ? (
        <div className="slide-placeholder">{modelName(undefined)}</div>
      ) : null}
      {number !== undefined && (
        <span className="slide-order-badge" aria-hidden="true">
          {number}
        </span>
      )}
    </div>
  );
}

/** One slide, drawn from its data. `step` is how many Enters have been pressed; `edit` shows everything. */
export function SlideCanvas({
  slide,
  step = 0,
  edit = false,
  numbers,
  className = "",
  children,
}: {
  slide: Slide;
  step?: number;
  edit?: boolean;
  numbers?: ReadonlyMap<string, number>;
  className?: string;
  children?: ReactNode;
}) {
  const shown = edit ? null : visibleIds(slide, step);
  return (
    <div
      className={`slide-canvas ${className}`.trim()}
      data-testid="slide-canvas"
      data-layout={slide.layout}
    >
      {slide.elements.map((el) => (
        <ElementView
          key={el.id}
          el={el}
          visible={!shown || shown.has(el.id)}
          edit={edit}
          {...(numbers?.has(el.id) ? { number: numbers.get(el.id) as number } : {})}
        />
      ))}
      {children}
    </div>
  );
}
