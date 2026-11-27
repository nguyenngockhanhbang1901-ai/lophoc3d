// Word equations (OMML, the format of Insert → Equation) to LaTeX for KaTeX.
// Covers what school maths uses: fractions, powers/indices, roots, brackets, accents (vector,
// angle hat, bar), sums/integrals, functions, limits, systems (eqArr) and matrices. Unknown
// elements fall back to their content, so a formula never disappears.

const SYMBOLS: Record<string, string> = {
  "∥": "\\ss ",
  "∦": "\\nparallel ",
  "⊥": "\\perp ",
  "∈": "\\in ",
  "∉": "\\notin ",
  "∋": "\\ni ",
  "⊂": "\\subset ",
  "⊃": "\\supset ",
  "⊆": "\\subseteq ",
  "⊇": "\\supseteq ",
  "⊄": "\\not\\subset ",
  "∩": "\\cap ",
  "∪": "\\cup ",
  "∅": "\\varnothing ",
  "≤": "\\le ",
  "≥": "\\ge ",
  "≠": "\\ne ",
  "≈": "\\approx ",
  "≡": "\\equiv ",
  "∼": "\\sim ",
  "±": "\\pm ",
  "∓": "\\mp ",
  "×": "\\times ",
  "÷": "\\div ",
  "·": "\\cdot ",
  "⋅": "\\cdot ",
  "∞": "\\infty ",
  "→": "\\to ",
  "←": "\\leftarrow ",
  "⇒": "\\Rightarrow ",
  "⇐": "\\Leftarrow ",
  "⇔": "\\Leftrightarrow ",
  "↔": "\\leftrightarrow ",
  "∀": "\\forall ",
  "∃": "\\exists ",
  "∠": "\\angle ",
  "△": "\\triangle ",
  "∆": "\\Delta ",
  "°": "^\\circ ",
  "′": "'",
  "″": "''",
  "…": "\\ldots ",
  "⋯": "\\cdots ",
  "−": "-",
  ℝ: "\\mathbb{R}",
  ℕ: "\\mathbb{N}",
  ℤ: "\\mathbb{Z}",
  ℚ: "\\mathbb{Q}",
  ℂ: "\\mathbb{C}",
  α: "\\alpha ",
  β: "\\beta ",
  γ: "\\gamma ",
  δ: "\\delta ",
  ε: "\\varepsilon ",
  ϵ: "\\epsilon ",
  θ: "\\theta ",
  λ: "\\lambda ",
  μ: "\\mu ",
  π: "\\pi ",
  ρ: "\\rho ",
  σ: "\\sigma ",
  τ: "\\tau ",
  φ: "\\varphi ",
  ϕ: "\\phi ",
  ω: "\\omega ",
  Δ: "\\Delta ",
  Ω: "\\Omega ",
  Σ: "\\Sigma ",
  Π: "\\Pi ",
  Φ: "\\Phi ",
  "{": "\\{",
  "}": "\\}",
  "%": "\\%",
  "#": "\\#",
  "&": "\\&",
  $: "\\$",
  "\\": "\\backslash ",
  "⁡": "",
  "⁢": "",
  "⁣": "",
  "​": "",
};

const FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "log",
  "ln",
  "lg",
  "exp",
  "lim",
  "max",
  "min",
  "sup",
  "inf",
  "det",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
]);

const NARY: Record<string, string> = {
  "∑": "\\sum",
  "∏": "\\prod",
  "∫": "\\int",
  "∬": "\\iint",
  "∭": "\\iiint",
  "∮": "\\oint",
  "⋃": "\\bigcup",
  "⋂": "\\bigcap",
};

const ACCENT: Record<string, string> = {
  "⃗": "\\overrightarrow",
  "→": "\\overrightarrow",
  "̂": "\\widehat",
  "^": "\\widehat",
  "̄": "\\overline",
  "̅": "\\overline",
  "¯": "\\overline",
  "̃": "\\widetilde",
  "~": "\\widetilde",
  "̇": "\\dot",
  "̈": "\\ddot",
  "⃖": "\\overleftarrow",
  "⃡": "\\overleftrightarrow",
};

const DELIM: Record<string, string> = {
  "(": "(",
  ")": ")",
  "[": "[",
  "]": "]",
  "{": "\\{",
  "}": "\\}",
  "|": "|",
  "‖": "\\|",
  "⟨": "\\langle",
  "⟩": "\\rangle",
  "〈": "\\langle",
  "〉": "\\rangle",
  "⌊": "\\lfloor",
  "⌋": "\\rfloor",
  "⌈": "\\lceil",
  "⌉": "\\rceil",
  "": ".",
};

function children(el: Element, name?: string): Element[] {
  return Array.from(el.children).filter((c) => !name || c.localName === name);
}
function child(el: Element, name: string): Element | undefined {
  return children(el, name)[0];
}
/** m:val of a property child such as <m:begChr m:val="["/>; undefined when absent. */
function prop(el: Element, prName: string, name: string): string | undefined {
  const pr = child(el, prName);
  const p = pr ? child(pr, name) : undefined;
  if (!p) return undefined;
  return p.getAttribute("m:val") ?? p.getAttribute("val") ?? "";
}
function isOn(value: string | undefined): boolean {
  return value !== undefined && value !== "0" && value !== "off" && value !== "false";
}

function group(tex: string): string {
  return `{${tex.trim()}}`;
}

function textRun(raw: string, plain: boolean): string {
  const word = raw.trim();
  if (plain && word && /[^\x20-\x7e]|[a-z]{2,}/i.test(word) && !FUNCTIONS.has(word.toLowerCase()))
    return `\\text{${raw}}`;
  if (FUNCTIONS.has(word) && word === raw) return `\\${word} `;
  // Vietnamese words typed inside an equation stay upright text
  if (/[À-ỹ]/.test(raw) && /[a-zà-ỹ]{2,}/i.test(raw)) return `\\text{${raw}}`;
  let out = "";
  for (const ch of raw) out += SYMBOLS[ch] ?? ch;
  return out;
}

function convertAll(els: Element[]): string {
  return els.map(convert).join("");
}

function inner(el: Element | undefined): string {
  return el ? convertAll(children(el)) : "";
}

export function convert(el: Element): string {
  switch (el.localName) {
    case "oMathPara":
    case "oMath":
    case "e":
    case "num":
    case "den":
    case "sub":
    case "sup":
    case "deg":
    case "lim":
    case "fName":
    case "box":
    case "borderBox":
    case "phant":
    case "argPr":
      return el.localName.endsWith("Pr") ? "" : convertAll(children(el));
    case "r": {
      const t = children(el, "t")
        .map((x) => x.textContent ?? "")
        .join("");
      const rPr = child(el, "rPr");
      const plain = !!(rPr && child(rPr, "nor"));
      return textRun(t, plain);
    }
    case "f": {
      const type = prop(el, "fPr", "type");
      const num = inner(child(el, "num"));
      const den = inner(child(el, "den"));
      if (type === "lin") return `${group(num)}/${group(den)}`;
      if (type === "noBar") return `\\genfrac{}{}{0pt}{}${group(num)}${group(den)}`;
      return `\\frac${group(num)}${group(den)}`;
    }
    case "sSup":
      return `${group(inner(child(el, "e")))}^${group(inner(child(el, "sup")))}`;
    case "sSub":
      return `${group(inner(child(el, "e")))}_${group(inner(child(el, "sub")))}`;
    case "sSubSup":
      return `${group(inner(child(el, "e")))}_${group(inner(child(el, "sub")))}^${group(inner(child(el, "sup")))}`;
    case "sPre":
      return `{}_${group(inner(child(el, "sub")))}^${group(inner(child(el, "sup")))}${group(inner(child(el, "e")))}`;
    case "rad": {
      const deg = inner(child(el, "deg")).trim();
      const hide = isOn(prop(el, "radPr", "degHide"));
      return !hide && deg
        ? `\\sqrt[${deg}]${group(inner(child(el, "e")))}`
        : `\\sqrt${group(inner(child(el, "e")))}`;
    }
    case "d": {
      const beg = prop(el, "dPr", "begChr") ?? "(";
      const end = prop(el, "dPr", "endChr") ?? ")";
      const sep = prop(el, "dPr", "sepChr") ?? "|";
      const parts = children(el, "e").map((e) => inner(e));
      const left = DELIM[beg] ?? beg;
      const right = DELIM[end] ?? end;
      return `\\left${left}${parts.join(` ${DELIM[sep] ?? sep} `)}\\right${right}`;
    }
    case "acc": {
      const chr = prop(el, "accPr", "chr") ?? "̂";
      const cmd = ACCENT[chr] ?? "\\widehat";
      return `${cmd}${group(inner(child(el, "e")))}`;
    }
    case "bar": {
      const pos = prop(el, "barPr", "pos");
      return `${pos === "bot" ? "\\underline" : "\\overline"}${group(inner(child(el, "e")))}`;
    }
    case "groupChr": {
      const chr = prop(el, "groupChrPr", "chr") ?? "⏟";
      const pos = prop(el, "groupChrPr", "pos") ?? "bot";
      const body = group(inner(child(el, "e")));
      if (chr === "⏞" || (chr === "⏟" && pos === "top")) return `\\overbrace${body}`;
      if (chr === "⏟") return `\\underbrace${body}`;
      if (chr === "→")
        return pos === "top" ? `\\overrightarrow${body}` : `\\underrightarrow${body}`;
      return body;
    }
    case "nary": {
      const chr = prop(el, "naryPr", "chr") ?? "∫";
      const op = NARY[chr] ?? chr;
      const sub = isOn(prop(el, "naryPr", "subHide")) ? "" : inner(child(el, "sub")).trim();
      const sup = isOn(prop(el, "naryPr", "supHide")) ? "" : inner(child(el, "sup")).trim();
      return `${op}${sub ? `_${group(sub)}` : ""}${sup ? `^${group(sup)}` : ""} ${inner(child(el, "e"))}`;
    }
    case "func": {
      const name = inner(child(el, "fName")).trim();
      const plainName = name.replace(/^\\/, "").trim();
      const head = FUNCTIONS.has(plainName)
        ? `\\${plainName}`
        : /^[a-z]+$/i.test(name)
          ? `\\operatorname{${name}}`
          : name;
      return `${head} ${inner(child(el, "e"))}`;
    }
    case "limLow": {
      const base = inner(child(el, "e")).trim();
      const lim = inner(child(el, "lim"));
      const word = base.replace(/^\\/, "").trim();
      if (FUNCTIONS.has(word)) return `\\${word}_${group(lim)} `;
      return `\\underset${group(lim)}${group(base)}`;
    }
    case "limUpp":
      return `\\overset${group(inner(child(el, "lim")))}${group(inner(child(el, "e")))}`;
    case "eqArr":
      return `\\begin{array}{l}${children(el, "e")
        .map((e) => inner(e))
        .join(" \\\\ ")}\\end{array}`;
    case "m": {
      const rows = children(el, "mr").map((r) =>
        children(r, "e")
          .map((e) => inner(e))
          .join(" & "),
      );
      return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
    }
    case "sPrePr":
    case "rPr":
    case "ctrlPr":
      return "";
    default:
      if (el.localName.endsWith("Pr")) return "";
      return convertAll(children(el));
  }
}

/** LaTeX for one <m:oMath> or <m:oMathPara>, tidied for KaTeX. */
export function ommlToLatex(el: Element): string {
  return convert(el)
    .replace(/\s+/g, " ")
    .replace(/ ([_^}])/g, "$1")
    .trim();
}
