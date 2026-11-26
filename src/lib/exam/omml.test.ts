import { describe, expect, it } from "vitest";
import katex from "katex";
import { ommlToLatex } from "./omml";

const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const r = (t: string) => `<m:r><m:t>${t}</m:t></m:r>`;
function tex(inner: string): string {
  const doc = new DOMParser().parseFromString(
    `<m:oMath ${M}>${inner}</m:oMath>`,
    "application/xml",
  );
  return ommlToLatex(doc.documentElement);
}
function renders(s: string) {
  expect(() =>
    katex.renderToString(s, { throwOnError: true, macros: { "\\ss": "\\mathrel{/\\mkern-5mu/}" } }),
  ).not.toThrow();
}

describe("Word equations to LaTeX", () => {
  const cases: [string, string][] = [
    [r("a∥b, d⊥(α)"), "a\\ss b, d\\perp (\\alpha )"],
    [`<m:sSub><m:e>${r("u")}</m:e><m:sub>${r("n")}</m:sub></m:sSub>`, "{u}_{n}"],
    [`<m:rad><m:deg>${r("3")}</m:deg><m:e>${r("x")}</m:e></m:rad>`, "\\sqrt[3]{x}"],
    [
      `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr><m:e>${r("x=1")}</m:e><m:e>${r("y=2")}</m:e></m:eqArr></m:e></m:d>`,
      "\\left\\{\\begin{array}{l}x=1 \\\\ y=2\\end{array}\\right.",
    ],
    [
      `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${r("k=1")}</m:sub><m:sup>${r("n")}</m:sup><m:e>${r("k")}</m:e></m:nary>`,
      "\\sum_{k=1}^{n} k",
    ],
    [`<m:func><m:fName>${r("sin")}</m:fName><m:e>${r("x")}</m:e></m:func>`, "\\sin x"],
    [
      `<m:func><m:fName><m:limLow><m:e>${r("lim")}</m:e><m:lim>${r("x→0")}</m:lim></m:limLow></m:fName><m:e>${r("f(x)")}</m:e></m:func>`,
      "\\lim_{x\\to 0} f(x)",
    ],
    [`<m:acc><m:e>${r("ABC")}</m:e></m:acc>`, "\\widehat{ABC}"],
    [
      `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${r("AB")}</m:e></m:bar>`,
      "\\overline{AB}",
    ],
    [
      `<m:m><m:mr><m:e>${r("1")}</m:e><m:e>${r("2")}</m:e></m:mr><m:mr><m:e>${r("3")}</m:e><m:e>${r("4")}</m:e></m:mr></m:m>`,
      "\\begin{matrix}1 & 2 \\\\ 3 & 4\\end{matrix}",
    ],
    [r("x ∈ ℝ, 60°"), "x \\in \\mathbb{R}, 60^\\circ"],
    [r("với mọi"), "\\text{với mọi}"],
  ];
  for (const [xml, want] of cases)
    it(want, () => {
      const got = tex(xml);
      expect(got).toBe(want);
      renders(got);
    });
});
