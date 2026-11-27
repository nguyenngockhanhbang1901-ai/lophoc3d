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
  attemptPulse: vi.fn(),
  reportLeave: vi.fn(),
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
      assignmentId: "a1",
      violationCount: 0,
      disconnectCount: 0,
      editWarned: false,
      drop: null,
      retake: null,
    });
    fns.attemptQuestion.mockImplementation(({ data }: { data: { index: number } }) =>
      Promise.resolve(
        data.index === 0
          ? { kind: "mcq", stem: "Câu hỏi một", media: null, options: ["P1", "P2", "P3", "P4"] }
          : { kind: "short", stem: "Câu hỏi hai", media: null },
      ),
    );
    fns.saveAnswer.mockImplementation(({ data }: { data: { index: number } }) =>
      Promise.resolve({
        reachedIndex: data.index + 1,
        completedAll: data.index === 1,
        editWarning: false,
        status: "in_progress",
        drop: null,
      }),
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
      data: {
        token: "a".repeat(64),
        assignmentId: "a1",
        acceptRules: true,
        device: expect.stringMatching(/^[0-9a-f]{32}$/),
      },
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
        device: expect.stringMatching(/^[0-9a-f]{32}$/),
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

  it("covers the paper when the student leaves, warns on edits and offers a new exam when cancelled", async () => {
    const base = {
      id: "t2",
      title: "Kiểm tra",
      serverNow: now,
      deadlineAt: later,
      kinds: ["mcq"],
      points: [1],
      reachedIndex: 1,
      settings: DEFAULT_SETTINGS,
      score: null,
      correctCount: null,
      assignmentId: "a1",
      violationCount: 0,
      disconnectCount: 0,
      editWarned: false,
      drop: null,
    };
    fns.assignmentRules.mockResolvedValue({
      id: "a1",
      title: "Kiểm tra",
      className: "",
      opensAt: now,
      closesAt: later,
      durationMinutes: 15,
      questionCount: 1,
      partCounts: { mcq: 1, tf: 0, short: 0 },
      state: "open",
      serverNow: now,
      maxAttempts: 1,
      attemptsUsed: 0,
      inProgressId: "t2",
      settings: DEFAULT_SETTINGS,
      canStart: true,
      blocked: null,
    });
    fns.startAttempt.mockResolvedValueOnce({ attemptId: "t2" });
    fns.attemptView.mockResolvedValueOnce({
      ...base,
      status: "in_progress",
      answers: [{ kind: "mcq", choice: 0 }],
      retake: null,
    });
    fns.attemptQuestion.mockResolvedValue({
      kind: "mcq",
      stem: "Câu duy nhất",
      media: null,
      options: ["A1", "A2", "A3", "A4"],
    });
    fns.reportLeave.mockResolvedValue({ violationCount: 1, maxWarnings: 3, status: "in_progress" });

    render(
      <ExamFlow
        token={"a".repeat(64)}
        assignmentId="a1"
        studentName="An"
        studentUsername="an0001"
        onExit={() => undefined}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Làm tiếp" }));
    await screen.findByText("Câu duy nhất");

    // switching away covers the paper and counts once, however many events fire
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("blur"));
    });
    expect(await screen.findByText("Em đã rời khỏi bài thi")).toBeTruthy();
    expect(fns.reportLeave).toHaveBeenCalledTimes(1);
    await screen.findByText(/lần cảnh báo thứ 1/);
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục làm bài" }));
    expect(screen.queryByText("Em đã rời khỏi bài thi")).toBeNull();

    // changing answers after finishing: one warning, then the attempt is cancelled
    fns.saveAnswer.mockResolvedValueOnce({
      reachedIndex: 1,
      completedAll: true,
      editWarning: true,
      status: "in_progress",
      drop: null,
    });
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: /A2/ })));
    expect(await screen.findByText("Bài thi có dấu hiệu gian lận")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tôi đã hiểu" }));

    fns.saveAnswer.mockResolvedValueOnce({
      reachedIndex: 1,
      completedAll: true,
      editWarning: false,
      status: "cancelled_edit",
      drop: null,
    });
    fns.attemptView.mockResolvedValueOnce({
      ...base,
      status: "cancelled_edit",
      answers: [],
      retake: { allowed: true, reason: null },
    });
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: /A3/ })));
    expect(await screen.findByText("Lượt làm bị hủy do sửa đáp án")).toBeTruthy();

    fns.startAttempt.mockResolvedValueOnce({ attemptId: "t3" });
    fns.attemptView.mockResolvedValueOnce({
      ...base,
      id: "t3",
      status: "in_progress",
      reachedIndex: 0,
      answers: [null],
      retake: null,
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Làm đề mới/ })));
    await screen.findByText("Câu duy nhất");
    expect(fns.attemptView).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ attemptId: "t3" }),
    });
  });
});
