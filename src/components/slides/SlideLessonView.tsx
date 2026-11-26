import { useMemo } from "react";
import { useEnterReview } from "@/hooks/use-enter-review";
import { lessonTimeline, stepCount, type TimelineState } from "@/lib/slides/animation";
import { allSlides, parseSlideContent, type SlideContent } from "@/lib/slides/model";
import { Button } from "../ui/button";
import { SlideArrows } from "../SlideArrows";
import { SlideCanvas } from "./SlideCanvas";

/** Normal mode: one state per slide, everything on it already shown. */
function fullTimeline(lesson: SlideContent): TimelineState[] {
  const out: TimelineState[] = [];
  let slideIndex = 0;
  lesson.activities.forEach((activity, activityIndex) => {
    for (const slide of activity.slides) {
      const steps = stepCount(slide);
      out.push({ slideIndex, slideId: slide.id, activityIndex, step: steps, steps });
      slideIndex += 1;
    }
  });
  return out;
}

/**
 * A slide lesson as the class sees it, read straight from the stored JSON, with no editing panel.
 * - `stepped` (lecture and presentation): Enter or → shows the next element, then the next slide;
 *   Backspace or ← goes back one step.
 * - not stepped (normal mode): every slide is shown whole; Enter or the arrows go slide by slide.
 * A bar of the lesson's activities jumps straight to any of them (hidden when `bare`).
 */
export function SlideLessonView({
  content,
  reserve = 240,
  bare = false,
  stepped = true,
}: {
  content: unknown;
  reserve?: number;
  bare?: boolean;
  stepped?: boolean;
}) {
  const lesson = useMemo(() => parseSlideContent(content), [content]);
  const timeline = useMemo(
    () => (lesson ? (stepped ? lessonTimeline(lesson) : fullTimeline(lesson)) : []),
    [lesson, stepped],
  );
  const { selected, select } = useEnterReview(Math.max(1, timeline.length));
  if (!lesson || timeline.length === 0)
    return (
      <section className="practice-workspace">
        <p>Chưa có nội dung bài học.</p>
      </section>
    );
  const state = timeline[selected] ?? (timeline[0] as TimelineState);
  const slides = allSlides(lesson);
  const slide = slides[state.slideIndex] ?? (slides[0] as (typeof slides)[number]);
  const activity = lesson.activities[state.activityIndex];
  const firstOfActivity = slides.findIndex((s) => activity?.slides[0]?.id === s.id);
  const inActivity = state.slideIndex - Math.max(0, firstOfActivity) + 1;
  return (
    <section
      className="practice-workspace slide-lesson"
      data-testid="slide-lesson"
      style={{ ["--slide-reserve" as string]: `${reserve}px` }}
    >
      {!bare && lesson.activities.length > 0 && (
        <nav className="activity-switch" aria-label="Các hoạt động trong bài học">
          {lesson.activities.map((a, i) => (
            <Button
              key={a.id}
              variant="ghost"
              className={i === state.activityIndex ? "active" : ""}
              aria-current={i === state.activityIndex ? "step" : undefined}
              title={a.title}
              disabled={a.slides.length === 0}
              onClick={() => select(timeline.findIndex((t) => t.activityIndex === i))}
            >
              <span>{i + 1}</span>
              <div>
                <strong>{a.title || `Hoạt động ${i + 1}`}</strong>
                <small>{a.slides.length} slide</small>
              </div>
            </Button>
          ))}
        </nav>
      )}
      {!bare && <SlideArrows />}
      <div className="slide-frame">
        {!bare && (
          <p className="slide-lesson-status" aria-live="polite">
            {activity?.title || `Hoạt động ${state.activityIndex + 1}`} · Slide {inActivity}/
            {activity?.slides.length ?? 1}
          </p>
        )}
        <SlideCanvas key={slide.id} slide={slide} step={state.step} />
      </div>
    </section>
  );
}
