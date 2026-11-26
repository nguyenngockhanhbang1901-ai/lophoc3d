import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionView } from "./ExamMath";
import type { QuestionBody } from "@/lib/exam/questions";

const tf: QuestionBody = {
  stem: "Cho hình chóp $S.ABCD$ có đáy là hình bình hành.\n$$AB \\ss CD$$",
  media: null,
  explanation: "Vì $ABCD$ là hình bình hành.",
  data: {
    kind: "tf",
    statements: ["$AB \\ss (SCD)$", "b", "c", "d"],
    correct: [true, false, true, false],
  },
};

describe("QuestionView", () => {
  it("typesets formulas and hides answers from students", () => {
    const { container } = render(<QuestionView body={tf} />);
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(screen.queryByText("Đúng")).toBeNull();
    expect(screen.queryByText("Lời giải")).toBeNull();
  });
  it("marks answers and shows the explanation for the teacher", () => {
    render(<QuestionView body={tf} showAnswer />);
    expect(screen.getAllByText("Đúng")).toHaveLength(2);
    expect(screen.getAllByText("Sai")).toHaveLength(2);
    expect(screen.getByText("Lời giải")).toBeTruthy();
  });
  it("shows accepted short answers with tolerance", () => {
    render(
      <QuestionView
        body={{
          stem: "x",
          media: null,
          explanation: "",
          data: { kind: "short", mode: "number", answers: ["1,41", "1.42"], tolerance: 0.01 },
        }}
        showAnswer
      />,
    );
    expect(screen.getByText("1,41 hoặc 1.42")).toBeTruthy();
    expect(screen.getByText(/±0,01/)).toBeTruthy();
  });
});
