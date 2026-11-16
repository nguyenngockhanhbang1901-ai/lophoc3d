// Keyboard navigation for teacher answer reviews and the Hoạt động 3 slideshow.
// Enter advances one question; on the last question the first Enter only arms,
// and a second consecutive Enter asks to move on to the next activity.
// Backspace goes back one question and disarms.
export type ReviewStep = { selected: number; armed: boolean; finish: boolean };

export function nextReviewStep(selected: number, armed: boolean, total: number): ReviewStep {
  if (selected < total - 1) return { selected: selected + 1, armed: false, finish: false };
  if (armed) return { selected, armed: false, finish: true };
  return { selected, armed: true, finish: false };
}

export function previousReviewStep(selected: number): ReviewStep {
  return { selected: Math.max(0, selected - 1), armed: false, finish: false };
}
