import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "@/lib/exam/assignment";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

const now = new Date().toISOString();
const later = new Date(Date.now() + 10 * 60_000).toISOString();
const fns = vi.hoisted(() => ({
  assignmentRules: vi.fn(),
  startAttempt: vi.fn(),
  attemptView: vi.fn(),
  attemptQuestion: vi.fn(),
  saveAnswer: vi.fn(),
  submitAttempt: vi.fn(),
  myAssignments: vi.fn(),
}));
vi.mock("@/lib/exam/attempt.functions", () => fns);

const { ExamFlow } = await import("./StudentExam");

describe("student exam screens", () => {
  it("needs the rules accepted, opens questions one by one and hands in", async () => {
    fns.assignmentRules.mockResolvedValue({
      id: "a1",
      title: "Kiểm tra 15 phút",
      className: "11A1",
      opensAt: now,
      closesAt: later,
      durationMinutes: 15,
      questionCount: 2,
      partCounts: { mcq: 1, tf: 0, short: 1 },
      state: "open",
      serverNow: now,
      maxAttempts: 1,
      attemptsUsed: 0,
      inProgressId: null,
      settings: DEFAULT_SETTINGS,
      canStart: true,
      blocked: null,
    });
    fns.startAttempt.mockResolvedValue({ attemptId: "t1" });
    fns.attemptView.mockResolvedValue({
      id: "t1",
      title: "Kiểm tra 15 phút",
      status: "in_progress",
      serverNow: now,
      deadlineAt: later,
      kinds: ["mcq", "short"],
      points: [0.25, 0.5],
      reachedIndex: 0,
      answers: [null, null],
      settings: DEFAULT_SETTINGS,
      score: null,
      correctCount: null,
    });
    fns.attemptQuestion.mockImplementation(({ data }: { data: { index: number } }) =>
      Promise.resolve(
        data.index === 0
          ? { kind: "mcq", stem: "Câu hỏi một", media: null, options: ["P1", "P2", "P3", "P4"] }
          : { kind: "short", stem: "Câu hỏi hai", media: null },
      ),
    );
    fns.saveAnswer.mockImplementation(({ data }: { data: { index: number } }) =>
      Promise.resolve({ reachedIndex: data.index + 1, completedAll: data.index === 1 }),
    );
    fns.submitAttempt.mockResolvedValue({ status: "submitted", score: 7.5, correctCount: 1 });

    render(
      <ExamFlow
        token={"a".repeat(64)}
        assignmentId="a1"
        studentName="Nguyễn Văn An"
        studentUsername="annv0001"
        onExit={() => undefined}
      />,
    );
    const start = await screen.findByRole("button", { name: "Bắt đầu làm bài" });
    expect(screen.getByText(/Quá 3 lần cảnh báo thì bị tự động thu bài/)).toBeTruthy();
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/đã đọc và đồng ý/));
    expect((start as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(start);

    await screen.findByText("Câu hỏi một");
    expect(fns.startAttempt).toHaveBeenCalledWith({
      data: { token: "a".repeat(64), assignmentId: "a1", acceptRules: true },
    });
    const next = screen.getByRole("button", { name: /Câu tiếp/ }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "2" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: /P3/ })));
    expect(fns.saveAnswer).toHaveBeenCalledWith({
      data: {
        token: "a".repeat(64),
        attemptId: "t1",
        index: 0,
        answer: { kind: "mcq", choice: 2 },
      },
    });
    await waitFor(() => expect(next.disabled).toBe(false));
    fireEvent.click(next);
    await screen.findByText("Câu hỏi hai");
    fireEvent.change(screen.getByPlaceholderText("Nhập đáp án"), { target: { value: "2,5" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Xác nhận" })));
    fireEvent.click(await screen.findByRole("button", { name: /Nộp bài/ }));
    await act(async () =>
      fireEvent.click(screen.getAllByRole("button", { name: "Nộp bài" }).at(-1)!),
    );
    await screen.findByText("Em đã nộp bài");
    expect(screen.getByText("7,5")).toBeTruthy();
  });
});
