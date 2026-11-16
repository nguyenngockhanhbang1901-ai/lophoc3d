import { lazy, Suspense } from 'react';
import { useEnterReview } from '@/hooks/use-enter-review';
import { type ActivityNumber } from '@/lib/assignment';
import { PRACTICE_SETS, questionTitle } from '@/lib/practice-questions';
import { ActivityTwo } from './ActivityTwo';
import { ActivityThreeReview } from './ActivityThreeReview';
import { PracticeFigure } from './PracticeFigure';
import { GoalAnswerResults } from './GoalAnswerResults';
import { MathText } from './MathText';
import { reveal } from '@/lib/reveal';
const ActivityOne = lazy(() => import('./ActivityOne'));
const PracticeOne = lazy(() => import('./PracticeOne'));

function PracticeLecture({ part }: { part: 3 | 4 }) {
  const set = PRACTICE_SETS[part];
  const { selected } = useEnterReview(set.questions.length * 2 + 1);
  const question = selected === 0 ? null : set.questions[Math.floor((selected - 1) / 2)];
  // The first question is already in place (invisible in presentation mode) on the opening step.
  const shown = question ?? set.questions[0];
  return <div className="practice-content practice-lecture">
    <PracticeFigure set={set} highlight={question?.focus ?? null} recap={null} compact />
    <section className="practice-workspace">
      {part === 3 && <p className="practice-context">{set.prompt}</p>}
      {shown && <><h3 className="practice-question-prompt" {...reveal(Boolean(question))}><strong>{questionTitle(set, shown)}. </strong>{shown.prompt}</h3><p className="correct-answer" {...reveal(Boolean(question) && selected % 2 === 0)}><MathText text={shown.answer} /></p></>}
    </section>
  </div>;
}

/** Read-only teaching content contains model answers, never team responses. */
export function LessonSlides({ part, review, lecture, autoQuestion }: { part: ActivityNumber; review: boolean; lecture: boolean; autoQuestion?: number | null | undefined }) {
  if (part === 2) return <ActivityTwo />;
  if (part === 5) return <ActivityThreeReview />;
  if (part === 1) return lecture || review ? <GoalAnswerResults teams={[]} lessonAnswers={lecture} /> : <Suspense fallback={<div className="goal-viewer" />}><ActivityOne embedded teacherPreview /></Suspense>;
  if (lecture || review) return <PracticeLecture part={part} />;
  return <Suspense fallback={<div className="box-figure" />}><PracticeOne set={PRACTICE_SETS[part]} teacherPreview autoQuestion={autoQuestion} /></Suspense>;
}