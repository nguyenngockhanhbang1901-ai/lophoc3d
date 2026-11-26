import { useEnterReview } from "@/hooks/use-enter-review";
import { customLessonText } from "@/lib/lessons";
import { MathText } from "./MathText";
import { SlideArrows } from "./SlideArrows";
import { reveal } from "@/lib/reveal";
import { parseSlideContent } from "@/lib/slides/model";
import { SlideLessonView } from "./slides/SlideLessonView";
export function CustomLesson({ content, stepped = true }: { content: unknown; stepped?: boolean }) {
  // Slide lessons (made in Soạn bài giảng) have their own viewer, step by step only in lecture and
  // presentation modes; plain text lessons below are unchanged.
  if (parseSlideContent(content)) return <SlideLessonView content={content} stepped={stepped} />;
  return <TextLesson content={content} />;
}
function TextLesson({ content }: { content: unknown }) {
  const paragraphs = customLessonText(content)
    .split(/\n\s*\n/)
    .filter(Boolean);
  const { selected } = useEnterReview(Math.max(1, paragraphs.length));
  return (
    <section className="practice-workspace">
      <SlideArrows />
      {paragraphs.length ? (
        paragraphs.map((p, i) => (
          <p
            key={i}
            className="practice-question-prompt whitespace-pre-line"
            {...reveal(i <= selected)}
          >
            <MathText text={p} />
          </p>
        ))
      ) : (
        <p>Chưa có nội dung bài học.</p>
      )}
    </section>
  );
}
