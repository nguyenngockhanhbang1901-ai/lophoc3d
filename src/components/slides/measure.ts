import katex from "katex";
import { REFERENCE_WIDTH, type SlideElement } from "@/lib/slides/types";
import type { Measure } from "@/lib/slides/fit";
import { textSizeCqw } from "./SlideCanvas";

const REFERENCE_HEIGHT = (REFERENCE_WIDTH * 9) / 16;
const MACROS = { "\\ss": "\\mathrel{/\\mkern-5mu/}" };
const escape = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

/** Same markup MathText draws, as a string, so the probe measures what the slide will show. */
export function mathHtml(text: string): string {
  return text
    .split("$")
    .map((part, i) =>
      i % 2 === 0
        ? escape(part)
        : `<span class="math-inline">${katex.renderToString(part, { throwOnError: false, macros: { ...MACROS } })}</span>`,
    )
    .join("");
}

let probe: HTMLDivElement | null = null;
/**
 * Measures text in a hidden box drawn at the reference slide size (1280×720). Sizes on the slide
 * are all relative to its width, so the result is the same at any zoom.
 */
export const domMeasure: Measure = (el: SlideElement) => {
  if (typeof document === "undefined") return 0;
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.className = "slide-measure-probe";
    Object.assign(probe.style, {
      position: "fixed",
      left: "-20000px",
      top: "0",
      visibility: "hidden",
      lineHeight: "1.25",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      boxSizing: "border-box",
      padding: `${REFERENCE_WIDTH * 0.005}px ${REFERENCE_WIDTH * 0.008}px`,
    });
    document.body.appendChild(probe);
  }
  probe.style.width = `${(el.w / 100) * REFERENCE_WIDTH}px`;
  probe.style.fontSize = `${(textSizeCqw(el) * REFERENCE_WIDTH) / 100}px`;
  probe.style.fontWeight = (el.bold ?? el.type === "title") ? "700" : "400";
  probe.style.fontStyle = el.italic ? "italic" : "normal";
  probe.innerHTML = mathHtml(el.text || " ");
  return (probe.scrollHeight / REFERENCE_HEIGHT) * 100;
};
