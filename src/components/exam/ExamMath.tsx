import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { mathLines, insertSnippet } from "@/lib/exam/math-text";
import {
  OPTION_LETTERS,
  STATEMENT_LETTERS,
  type QuestionBody,
  type QuestionMedia,
} from "@/lib/exam/questions";
import { Textarea } from "@/components/ui/textarea";

/** Same macros as the lessons' MathText, so "//" looks the same everywhere. */
const MACROS = { "\\ss": "\\mathrel{/\\mkern-5mu/}" };

function tex(source: string, displayMode: boolean): string {
  return katex.renderToString(source, { throwOnError: false, displayMode, macros: { ...MACROS } });
}

/** Text with $inline$ and $$display$$ formulas, keeping the teacher's line breaks. */
export function ExamMath({ text, className }: { text: string; className?: string }) {
  const lines = useMemo(() => mathLines(text), [text]);
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <div key={i} className="min-h-[1.2em]">
          {line.map((p, j) =>
            p.type === "text" ? (
              <Fragment key={j}>{p.value}</Fragment>
            ) : p.type === "inline" ? (
              <span
                key={j}
                className="math-inline"
                dangerouslySetInnerHTML={{ __html: tex(p.tex, false) }}
              />
            ) : (
              <div
                key={j}
                className="my-1 overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: tex(p.tex, true) }}
              />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

const ModelView = lazy(() =>
  import("@/components/slides/ModelView").then((m) => ({ default: m.ModelView })),
);

export function QuestionMediaView({ media }: { media: QuestionMedia | null }) {
  if (!media) return null;
  if (media.kind === "image")
    return (
      <img
        src={media.src}
        alt={media.alt ?? "Hình minh họa"}
        className="my-2 max-h-80 max-w-full rounded border object-contain"
        draggable={false}
      />
    );
  return (
    <div className="my-2 h-72 w-full max-w-xl overflow-hidden rounded border">
      <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Đang tải mô hình…</p>}>
        <ModelView id={media.modelId} src={media.src} />
      </Suspense>
    </div>
  );
}

/**
 * A question as students see it. With `showAnswer` the right option / Đúng-Sai / accepted
 * answers are marked, for the teacher's library and the review after an exam.
 */
export function QuestionView({
  body,
  showAnswer = false,
}: {
  body: QuestionBody;
  showAnswer?: boolean;
}) {
  const d = body.data;
  return (
    <div className="grid gap-2">
      <ExamMath text={body.stem} />
      <QuestionMediaView media={body.media} />
      {d.kind === "mcq" && (
        <ol className="grid gap-1">
          {d.options.map((o, i) => (
            <li
              key={i}
              className={`flex gap-2 rounded px-2 py-1 ${showAnswer && d.correct === i ? "bg-green-100 font-medium text-green-900" : ""}`}
            >
              <span className="font-semibold">{OPTION_LETTERS[i]}.</span>
              <ExamMath text={o} />
            </li>
          ))}
        </ol>
      )}
      {d.kind === "tf" && (
        <ol className="grid gap-1">
          {d.statements.map((s, i) => (
            <li key={i} className="flex items-start gap-2 rounded px-2 py-1">
              <span className="font-semibold">{STATEMENT_LETTERS[i]})</span>
              <ExamMath text={s} className="flex-1" />
              {showAnswer && d.correct[i] !== null && (
                <span
                  className={`rounded px-1.5 text-xs font-semibold ${d.correct[i] ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}
                >
                  {d.correct[i] ? "Đúng" : "Sai"}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {d.kind === "short" && showAnswer && (
        <p className="text-sm">
          <span className="text-muted-foreground">Đáp án: </span>
          <span className="font-mono font-semibold">
            {d.answers.filter((a) => a.trim()).join(" hoặc ") || "—"}
          </span>
          {d.mode === "number" && d.tolerance ? (
            <span className="text-muted-foreground">
              {" "}
              (sai số ±{String(d.tolerance).replace(".", ",")})
            </span>
          ) : null}
        </p>
      )}
      {showAnswer && body.explanation.trim() && (
        <div className="mt-1 rounded border-l-4 border-primary/40 bg-muted/50 p-2 text-sm">
          <div className="mb-1 font-medium">Lời giải</div>
          <ExamMath text={body.explanation} />
        </div>
      )}
    </div>
  );
}

const SNIPPETS: { label: string; tex: string; title: string }[] = [
  { label: "$…$", tex: "", title: "Chèn công thức" },
  { label: "//", tex: "\\ss ", title: "Song song" },
  { label: "⊥", tex: "\\perp ", title: "Vuông góc" },
  { label: "∈", tex: "\\in ", title: "Thuộc" },
  { label: "∉", tex: "\\notin ", title: "Không thuộc" },
  { label: "⊂", tex: "\\subset ", title: "Nằm trong" },
  { label: "∩", tex: "\\cap ", title: "Giao" },
  { label: "∪", tex: "\\cup ", title: "Hợp" },
  { label: "≠", tex: "\\ne ", title: "Khác" },
  { label: "≤", tex: "\\le ", title: "Nhỏ hơn hoặc bằng" },
  { label: "≥", tex: "\\ge ", title: "Lớn hơn hoặc bằng" },
  { label: "⇒", tex: "\\Rightarrow ", title: "Suy ra" },
  { label: "⇔", tex: "\\Leftrightarrow ", title: "Tương đương" },
  { label: "a/b", tex: "\\dfrac{}{}", title: "Phân số" },
  { label: "√", tex: "\\sqrt{}", title: "Căn bậc hai" },
  { label: "xⁿ", tex: "^{}", title: "Số mũ" },
  { label: "xₙ", tex: "_{}", title: "Chỉ số dưới" },
  { label: "→", tex: "\\overrightarrow{}", title: "Vectơ" },
  { label: "∠", tex: "\\widehat{}", title: "Góc" },
  { label: "△", tex: "\\triangle ", title: "Tam giác" },
  { label: "°", tex: "^\\circ", title: "Độ" },
  { label: "π", tex: "\\pi ", title: "Pi" },
  { label: "α", tex: "\\alpha ", title: "Alpha" },
  { label: "β", tex: "\\beta ", title: "Beta" },
  { label: "(α)", tex: "(\\alpha)", title: "Mặt phẳng (α)" },
];

/** A text box for exam text: formula buttons insert TeX at the caret, the preview typesets it. */
export function MathField({
  label,
  value,
  onChange,
  rows = 3,
  toolbar = true,
  preview = true,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  toolbar?: boolean;
  preview?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function add(snippet: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { text, caret } = snippet
      ? insertSnippet(value, start, end, snippet)
      : {
          text: `${value.slice(0, start)}$${value.slice(start, end)}$${value.slice(end)}`,
          caret: end + 1,
        };
    onChange(text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }
  return (
    <div className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      {toolbar && (
        <div className="flex flex-wrap gap-1" role="toolbar" aria-label={`Công thức cho ${label}`}>
          {SNIPPETS.map((s) => (
            <button
              key={s.title}
              type="button"
              title={s.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s.tex)}
              className="min-w-8 rounded border bg-background px-1.5 py-0.5 text-sm hover:bg-muted"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <Textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-sm"
      />
      {preview && value.includes("$") && (
        <div className="rounded border border-dashed bg-muted/30 px-2 py-1 text-sm">
          <ExamMath text={value} />
        </div>
      )}
    </div>
  );
}

/** Embedded font CSS per set of font families, so each set is fetched and encoded once. */
const fontCss = new Map<string, Promise<string>>();

function familiesOf(node: HTMLElement): string {
  const set = new Set<string>();
  try {
    for (const el of [node, ...Array.from(node.querySelectorAll<HTMLElement>("*"))])
      for (const f of getComputedStyle(el).fontFamily.split(","))
        set.add(f.trim().replace(/^["']|["']$/g, ""));
  } catch {
    // a browser that cannot report styles shares one font set
  }
  return [...set].sort().join("|");
}

/** Keep one source per @font-face (the first, woff2 for KaTeX): a third of the size. */
function firstSourceOnly(css: string): string {
  return (css.match(/@font-face\s*{[^}]*}/g) ?? [])
    .map((rule) => {
      const first = rule.match(/url\([^)]*\)/);
      return first
        ? rule.replace(/src:[\s\S]*?(?=;\s*[a-z-]+\s*:|;?\s*})/, `src: ${first[0]}`)
        : rule;
    })
    .join("\n");
}

/**
 * High anti-copy mode: the text is typeset as usual, then drawn into a picture (fonts
 * embedded, twice the screen resolution) and only the picture stays on the page, so it cannot
 * be selected, searched or copied. If drawing fails the typeset text stays, still unselectable.
 */
export function ProtectedMath({
  text,
  className,
  protect,
}: {
  text: string;
  className?: string;
  protect: boolean;
}) {
  const source = useRef<HTMLDivElement>(null);
  const [picture, setPicture] = useState<{ text: string; src: string; width: number } | null>(null);
  useEffect(() => {
    if (!protect) return;
    const node = source.current;
    if (!node) return;
    let cancelled = false;
    void (async () => {
      try {
        const { toPng, getFontEmbedCSS } = await import("html-to-image");
        const key = familiesOf(node);
        let css = fontCss.get(key);
        if (!css) {
          css = getFontEmbedCSS(node).then(firstSourceOnly, () => "");
          fontCss.set(key, css);
        }
        const width = node.offsetWidth;
        const src = await toPng(node, {
          fontEmbedCSS: await css,
          width,
          height: node.offsetHeight,
          pixelRatio: Math.max(2, window.devicePixelRatio || 1),
          style: { opacity: "1" },
        });
        if (!cancelled) setPicture({ text, src, width });
      } catch {
        // keep the typeset text (unselectable)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [protect, text]);
  if (!protect) return <ExamMath text={text} {...(className ? { className } : {})} />;
  const ready = picture?.text === text;
  return (
    <div className={`relative select-none ${className ?? ""}`}>
      {ready ? (
        <img
          src={picture.src}
          alt=""
          draggable={false}
          className="pointer-events-none max-w-full"
          style={{ width: picture.width }}
        />
      ) : (
        <div ref={source} style={{ opacity: picture ? 0 : 1 }} aria-hidden={false}>
          <ExamMath text={text} />
        </div>
      )}
    </div>
  );
}
