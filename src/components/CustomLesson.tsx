import { useEnterReview } from '@/hooks/use-enter-review';
import { customLessonText } from '@/lib/lessons';
import { MathText } from './MathText';
import { SlideArrows } from './SlideArrows';
import { reveal } from '@/lib/reveal';
export function CustomLesson({ content }: { content: unknown }) {
  const paragraphs = customLessonText(content).split(/\n\s*\n/).filter(Boolean);
  const { selected } = useEnterReview(Math.max(1, paragraphs.length));
  return <section className="practice-workspace"><SlideArrows />{paragraphs.length ? paragraphs.map((p, i) => <p key={i} className="practice-question-prompt whitespace-pre-line" {...reveal(i <= selected)}><MathText text={p} /></p>) : <p>Chưa có nội dung bài học.</p>}</section>;
}