import { lazy, Suspense, useState } from 'react';
import { Box, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEnterReview } from '@/hooks/use-enter-review';
import { type CaseIndex } from '@/lib/geometry';
import { ACTIVITY2_ORDER, ACTIVITY2_TOTAL, activity2ConceptVisible } from '@/lib/activity2-walkthrough';
import { ACTIVITY2_FIT } from '@/lib/geometry-fit';
import { MathText } from './MathText';
import { reveal } from '@/lib/reveal';
import { SlideArrows } from './SlideArrows';
const GeometryView = lazy(() => import('./GeometryView'));

/** Textbook order of the three positions: parallel, intersecting, contained (indices into `cases`). The symbol line is shown bold and centred under its definition. */
const CONCEPTS: Record<CaseIndex, { text: string; symbol: string }> = {
  1: { text: 'Nếu $\\boldsymbol{d}$ và $(\\alpha)$ không có điểm chung thì ta nói $\\boldsymbol{d}$ song song với $(\\alpha)$ hay $(\\alpha)$ song song với $\\boldsymbol{d}$.', symbol: '$\\boldsymbol{d \\ss (\\alpha)}$ hay $\\boldsymbol{(\\alpha) \\ss d}$' },
  0: { text: 'Nếu $\\boldsymbol{d}$ và $(\\alpha)$ có một điểm chung duy nhất $\\boldsymbol{M}$ thì ta nói $\\boldsymbol{d}$ và $(\\alpha)$ cắt nhau tại điểm $\\boldsymbol{M}$.', symbol: '$\\boldsymbol{d \\cap (\\alpha) = \\{M\\}}$ hay $\\boldsymbol{d \\cap (\\alpha) = M}$' },
  2: { text: 'Nếu $\\boldsymbol{d}$ và $(\\alpha)$ có nhiều hơn một điểm chung thì ta nói $\\boldsymbol{d}$ nằm trong $(\\alpha)$ hay $(\\alpha)$ chứa $\\boldsymbol{d}$.', symbol: '$\\boldsymbol{d \\subset (\\alpha)}$ hay $\\boldsymbol{(\\alpha) \\supset d}$' },
};

/** Static textbook drawing of one case: plane (α) as a parallelogram and the line d. */
export function ConceptFigure({ index }: { index: CaseIndex }) {
  const caption = index === 1 ? 'd // (α)' : index === 0 ? 'd ∩ (α) = {M}' : 'd ⊂ (α)';
  return <svg viewBox="0 0 320 260" role="img" aria-label={caption}>
    <polygon className="concept-edge" points="20,190 80,90 300,90 240,190" />
    <path className="concept-arc" d="M 62 190 Q 61 171 44 150" />
    <text className="concept-label" x="36" y="178">α</text>
    {index === 1 && <><line className="concept-line" x1="85" y1="50" x2="295" y2="50" /><text className="concept-label" x="260" y="38">d</text></>}
    {index === 0 && <><line className="concept-line" x1="140" y1="10" x2="180" y2="122" /><text className="concept-label" x="154" y="40">d</text><line className="concept-line dashed" x1="180" y1="122" x2="207" y2="190" /><line className="concept-line" x1="207" y1="190" x2="222" y2="232" /><circle className="concept-dot" cx="180" cy="122" r="5" /><text className="concept-label" x="192" y="118">M</text></>}
    {index === 2 && <><line className="concept-line" x1="90" y1="165" x2="270" y2="110" /><circle className="concept-dot" cx="135" cy="151" r="5" /><text className="concept-label" x="128" y="138" textAnchor="middle">A</text><circle className="concept-dot" cx="220" cy="125" r="5" /><text className="concept-label" x="213" y="112" textAnchor="middle">B</text><text className="concept-label" x="248" y="140">d</text></>}
  </svg>;
}

function Concept({ index, revealed }: { index: CaseIndex; revealed: boolean }) {
  const [model, setModel] = useState(false);
  return <div className="concept-column">
    <div className="concept-figure">
      {!revealed || model ? <Suspense fallback={<div className="geometry-view compact" />}><GeometryView index={index} compact hideLegend planeLabel="α" fit={ACTIVITY2_FIT} lineToken="--destructive" /></Suspense> : <ConceptFigure index={index} />}
      <Button size="sm" variant="outline" tabIndex={revealed ? undefined : -1} {...reveal(revealed)} onClick={() => setModel(m => !m)}>{model ? <><Image />Xem ảnh tĩnh</> : <><Box />Xem mô hình</>}</Button>
    </div>
    <div className="concept-text concept-definition" {...reveal(revealed)}>
      <p><MathText text={CONCEPTS[index].text} /></p>
      <p className="concept-symbol"><strong><MathText text={CONCEPTS[index].symbol} /></strong></p>
    </div>
  </div>;
}

/** Three models first; Enter progressively replaces them with textbook figures and concepts. */
export function ActivityTwo() {
  const total = ACTIVITY2_TOTAL;
  const { selected } = useEnterReview(total);
  return <div>
    <SlideArrows />
    <div className="models-row activity2-presentation">{ACTIVITY2_ORDER.map((index, column) => <section key={index}><Concept key={`${index}-${activity2ConceptVisible(selected, column)}`} index={index} revealed={activity2ConceptVisible(selected, column)} /></section>)}</div>
  </div>;
}
