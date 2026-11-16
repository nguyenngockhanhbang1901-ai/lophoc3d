/**
 * Scale for a presentation slide. Space taken by an opened AI panel
 * (prompt form and generated answer) is excluded, so opening it never
 * shrinks the lesson; the page scrolls to the extra content instead.
 */
export function presentationScale(naturalHeight: number, available: number, aiExpansion = 0) {
  const lessonHeight = Math.max(1, naturalHeight - Math.max(0, aiExpansion));
  return Math.min(1, available / lessonHeight);
}
