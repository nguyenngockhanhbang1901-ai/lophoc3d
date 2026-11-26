// Splitting exam text into plain runs, inline formulas ($...$) and display formulas ($$...$$),
// line by line. Pure so the editor preview, the student view and tests agree.

export type MathPiece =
  | { type: "text"; value: string }
  | { type: "inline"; tex: string }
  | { type: "display"; tex: string };

/** Pieces of one block of text; newlines become separate lines (arrays). */
export function mathLines(source: string): MathPiece[][] {
  const pieces: MathPiece[] = [];
  const display = /\$\$([\s\S]+?)\$\$/g;
  let last = 0;
  for (let m = display.exec(source); m; m = display.exec(source)) {
    pushInline(pieces, source.slice(last, m.index));
    pieces.push({ type: "display", tex: (m[1] ?? "").trim() });
    last = m.index + m[0].length;
  }
  pushInline(pieces, source.slice(last));
  // break text pieces at newlines into lines; display formulas stand on their own line
  const lines: MathPiece[][] = [[]];
  for (const p of pieces) {
    if (p.type === "display") {
      if (lines[lines.length - 1]!.length) lines.push([]);
      lines[lines.length - 1]!.push(p);
      lines.push([]);
    } else if (p.type === "text") {
      p.value.split("\n").forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1]!.push({ type: "text", value: part });
      });
    } else lines[lines.length - 1]!.push(p);
  }
  while (lines.length > 1 && lines[lines.length - 1]!.length === 0) lines.pop();
  return lines;
}

function pushInline(out: MathPiece[], text: string) {
  const parts = text.split("$");
  // an unmatched final "$" is shown as a dollar sign, not as an unfinished formula
  const odd = parts.length % 2 === 0;
  parts.forEach((part, i) => {
    const isMath = i % 2 === 1 && !(odd && i === parts.length - 1);
    const value = !isMath && odd && i === parts.length - 1 ? `$${part}` : part;
    if (isMath) out.push({ type: "inline", tex: part });
    else if (value) out.push({ type: "text", value });
  });
}

/** True when the caret at `index` sits inside a $...$ formula. */
export function insideFormula(source: string, index: number): boolean {
  const before = source.slice(0, index).replace(/\$\$/g, "");
  return (before.split("$").length - 1) % 2 === 1;
}

/** Insert a TeX snippet at the caret, adding $...$ around it when the caret is in plain text. */
export function insertSnippet(
  source: string,
  start: number,
  end: number,
  snippet: string,
): { text: string; caret: number } {
  const wrap = !insideFormula(source, start);
  const selected = source.slice(start, end);
  // "{}" in a snippet is where the selection (or the caret) goes
  const slot = snippet.indexOf("{}");
  const filled =
    slot >= 0
      ? `${snippet.slice(0, slot + 1)}${selected}${snippet.slice(slot + 1)}`
      : snippet + selected;
  const piece = wrap ? `$${filled}$` : filled;
  const caretInPiece = (wrap ? 1 : 0) + (slot >= 0 ? slot + 1 + selected.length : filled.length);
  return { text: source.slice(0, start) + piece + source.slice(end), caret: start + caretInPiece };
}
