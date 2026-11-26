import { useMemo } from "react";
import { useEnterReview } from "@/hooks/use-enter-review";
import { lessonTimeline } from "@/lib/slides/animation";
import { allSlides, parseSlideContent } from "@/lib/slides/model";
import { SlideArrows } from "../SlideArrows";
import { SlideCanvas } from "./SlideCanvas";

/**
 * A slide lesson as the class sees it, read straight from the stored JSON, with no editing panel.
 * Enter or → shows the next element, then the next slide; Backspace or ← goes back one step.
 * The same component serves the normal, lecture and presentation modes and the teacher's quick preview.
 */
export function SlideLessonView({
  content,
  reserve = 240,
  bare = false,
}: {
  content: unknown;
  reserve?: number;
  bare?: boolean;
}) {
  const lesson = useMemo(() => parseSlideContent(content), [content]);
  const timeline = useMemo(() => (lesson ? lessonTimeline(lesson) : []), [lesson]);
  const { selected } = useEnterReview(Math.max(1, timeline.length));
  if (!lesson || timeline.length === 0)
    return (
      <section className="practice-workspace">
        <p>Chưa có nội dung bài học.</p>
      </section>
    );
  const state = timeline[selected] ?? (timeline[0] as (typeof timeline)[number]);
  const slides = allSlides(lesson);
  const slide = slides[state.slideIndex] ?? (slides[0] as (typeof slides)[number]);
  const activity = lesson.activities[state.activityIndex];
  return (
    <section
      className="practice-workspace slide-lesson"
      data-testid="slide-lesson"
      style={{ ["--slide-reserve" as string]: `${reserve}px` }}
    >
      {!bare && <SlideArrows />}
      <div className="slide-frame">
        {!bare && (
          <p className="slide-lesson-status" aria-live="polite">
            {activity?.title ? `${activity.title} · ` : ""}Slide {state.slideIndex + 1}/
            {slides.length}
          </p>
        )}
        <SlideCanvas key={slide.id} slide={slide} step={state.step} />
      </div>
    </section>
  );
}
