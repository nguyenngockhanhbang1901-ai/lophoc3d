import { MathText } from "../MathText";
import type { Slide } from "@/lib/slides/model";

/**
 * Fixed 16:9 slide. Sizes use container units (cqw), so the slide scales as one picture on any
 * screen. This is the phase 2 stack of title + text; layouts with positioned slots come in phase 3.
 */
export function SlideCanvas({ slide, className = "" }: { slide: Slide; className?: string }) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-md border bg-white text-black shadow-sm ${className}`}
      style={{ aspectRatio: "16 / 9", containerType: "inline-size" }}
      data-testid="slide-canvas"
    >
      <div className="absolute inset-0 flex flex-col gap-[2cqw] p-[4cqw]">
        {slide.elements.map((e) =>
          e.text.trim() === "" ? null : e.type === "title" ? (
            <h2
              key={e.id}
              className="whitespace-pre-line font-bold leading-tight"
              style={{ fontSize: "4.6cqw" }}
            >
              <MathText text={e.text} />
            </h2>
          ) : (
            <p
              key={e.id}
              className="whitespace-pre-line leading-snug"
              style={{ fontSize: "2.8cqw" }}
            >
              <MathText text={e.text} />
            </p>
          ),
        )}
        {slide.elements.every((e) => e.text.trim() === "") && (
          <p className="m-auto text-gray-400" style={{ fontSize: "2.4cqw" }}>
            Slide trống
          </p>
        )}
      </div>
    </div>
  );
}
