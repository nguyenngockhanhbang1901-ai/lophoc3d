import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Fragment } from 'react';

/** "//" is the textbook parallel sign; the slashes sit close together like a single symbol. */
const MACROS = { '\\ss': '\\mathrel{/\\mkern-5mu/}' };

/** Renders text where `$...$` parts are TeX, typeset with KaTeX so every formula uses one math font and textbook spacing. */
export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = text.split('$');
  return <span className={className} data-source={text}>{parts.map((part, i) => i % 2 === 0
    ? <Fragment key={i}>{part}</Fragment>
    : <span key={i} className="math-inline" dangerouslySetInnerHTML={{ __html: katex.renderToString(part, { throwOnError: false, macros: { ...MACROS } }) }} />)}</span>;
}
