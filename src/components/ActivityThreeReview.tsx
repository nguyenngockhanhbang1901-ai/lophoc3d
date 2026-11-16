import { ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEnterReview } from '@/hooks/use-enter-review';
import { ACTIVITY3_FOLLOW_UPS, ACTIVITY3_SYMBOL_ANSWERS, ACTIVITY3_STAGES, GENERAL_CONCLUSION, GENERAL_INTRO, GENERAL_RULE, isContinuedLine, PROOF_LINES } from '@/lib/activity3-walkthrough';
import { PRACTICE_SETS } from '@/lib/practice-questions';
import { MathText } from './MathText';
import { ParallelPlanesFigure } from './ParallelPlanesFigure';
import { PracticeFigure, PracticeRecapPanel } from './PracticeFigure';
import { LessonAiSolver } from './LessonAiSolver';
import { reveal } from '@/lib/reveal';

const SET = PRACTICE_SETS[5];

function GeneralLine({ rule }: { rule: boolean }) {
  return <p className="activity3-general"><MathText text={GENERAL_INTRO} /><span {...reveal(rule)}> <MathText className="activity3-rule" text={GENERAL_RULE} /></span></p>;
}

function Conclusion() {
  return <p className="activity3-general activity3-conclusion"><MathText text={GENERAL_CONCLUSION} /></p>;
}

function Prompt({ title, text }: { title?: string | undefined; text: string }) {
  return <h3>{title && <strong className="activity3-qtitle">{title}. </strong>}<MathText text={text} /></h3>;
}

function QuestionAnswer({ title, prompt, answer, answered }: { title?: string | undefined; prompt: string; answer: string; answered: boolean }) {
  return <><Prompt title={title} text={prompt} /><p className="correct-answer activity3-answer" {...reveal(answered)}><MathText text={answer} /></p></>;
}

const CONCLUSION_AT = ACTIVITY3_STAGES.findIndex(s => s.kind === 'conclusion');
const A1B1 = { kind: 'edge', from: "A'", to: "B'" } as const;

/** Hoạt động 3 slideshow for the teacher: no assignment or SHOW ANSWER; Enter reveals the next question, answer, rule and proof step, Backspace goes back. */
export function ActivityThreeReview() {
  const { selected, select } = useEnterReview(ACTIVITY3_STAGES.length);
  const stage = ACTIVITY3_STAGES[selected];
  if (!stage) return null;
  const last = selected >= ACTIVITY3_STAGES.length - 1;
  // Steps that only add lines to the same slide keep every line mounted, so nothing moves on Enter.
  const relationGroup = stage.kind === 'general' || (stage.kind === 'question' && stage.title === 'Câu 3' && Boolean(stage.answer));
  const followUpGroup = stage.kind === 'conclusion' || (stage.kind === 'question' && (stage.title === 'Câu 4' || stage.title === 'Câu 5'));
  let body;
  if (stage.kind === 'proof') {
    body = <div className="activity3-proof">
      <div className="activity3-proof-text">
        <p className="activity3-general"><strong>Chứng minh</strong> <MathText className="activity3-rule" text={GENERAL_RULE} /></p>
        <ol aria-label="Chứng minh">{PROOF_LINES.map((step, i) => <li key={i} {...reveal(i < stage.lines)}>{step.map(line => <MathText key={line} text={line} className={`activity3-proof-line ${isContinuedLine(line) ? 'continued' : ''}`} />)}</li>)}</ol>
      </div>
      <figure className="activity3-picture"><ParallelPlanesFigure /></figure>
    </div>;
  } else if (stage.kind === 'application') {
    body = <div className="activity3-columns">
      <div className="practice-review-text activity3-text activity3-panel"><Conclusion /><Prompt title="Câu 6" text={ACTIVITY3_FOLLOW_UPS.application} /><LessonAiSolver /></div>
      <div className="activity3-diagram"><PracticeFigure set={SET} compact recap={null} segments={stage.ac ? [["A'", "C'"], ['A', 'C']] : [["A'", "C'"]]} /></div>
    </div>;
  } else if (relationGroup) {
    body = <div className="activity3-columns">
      <div className="practice-review-text activity3-text activity3-panel"><div className="activity3-question-block"><Prompt title="Câu 3" text={ACTIVITY3_FOLLOW_UPS.relation} /><p className="correct-answer activity3-answer activity3-relation"><MathText text={ACTIVITY3_SYMBOL_ANSWERS.relation} /></p></div><GeneralLine rule={stage.kind === 'general'} /></div>
      <div className="activity3-diagram"><PracticeFigure set={SET} compact recap={null} highlight={A1B1} /></div>
    </div>;
  } else if (followUpGroup) {
    const k = selected - CONCLUSION_AT;
    body = <div className="activity3-columns">
      <div className="practice-review-text activity3-text activity3-panel">
        <Conclusion />
        <div className="activity3-question-block" {...reveal(k >= 1)}><QuestionAnswer title="Câu 4" prompt={ACTIVITY3_FOLLOW_UPS.cdParallel} answer={ACTIVITY3_SYMBOL_ANSWERS.cdParallel} answered={k >= 2} /></div>
        <div className="activity3-question-block" {...reveal(k >= 3)}><QuestionAnswer title="Câu 5" prompt={ACTIVITY3_FOLLOW_UPS.condition} answer={ACTIVITY3_SYMBOL_ANSWERS.condition} answered={k >= 4} /></div>
      </div>
      <div className="activity3-diagram"><PracticeFigure set={SET} compact recap={null} highlight={stage.kind === 'question' ? stage.focus : A1B1} /></div>
    </div>;
  } else {
    body = <div className="activity3-columns">
      <div className="practice-review-text activity3-text activity3-panel">
        {stage.recap && <PracticeRecapPanel recap={stage.recap} />}
        <div className="activity3-question-block">
        <Prompt title={stage.title} text={stage.prompt} />
        {stage.answer && <p className={`correct-answer activity3-answer ${stage.title === 'Câu 3' ? 'activity3-relation' : ''}`}><MathText text={stage.answer} /></p>}
        </div>
      </div>
      <div className="activity3-diagram"><PracticeFigure set={SET} compact recap={null} highlight={stage.focus} /></div>
    </div>;
  }
  return <div className="lesson-layout goal-results-layout practice-review practice-review-single activity3-review">
    <section aria-label="Kết quả Hoạt động 3">
      <div className="model-heading activity3-nav slide-arrows">
        <span className="ml-auto" />
        <Button size="sm" variant="ghost" aria-label="Bước trước" disabled={selected === 0} onClick={() => select(selected - 1)}><ArrowLeft /></Button>
        <Button size="sm" variant="ghost" aria-label="Bước tiếp theo" disabled={last} onClick={() => select(selected + 1)}><ArrowRight /></Button>
      </div>
      {body}
    </section>
  </div>;
}
