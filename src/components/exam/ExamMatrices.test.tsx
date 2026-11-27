import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { emptyBody, type QuestionBody } from "@/lib/exam/questions";
import { ExamMatrices } from "./ExamMatrices";

const B1 = "11111111-1111-4111-8111-111111111111";
const pool = Array.from({ length: 5 }, (_, i) => ({
  id: `q${i + 1}`,
  bankId: B1,
  kind: "mcq" as const,
  level: "nb" as const,
  position: i + 1,
  topicPath: ["L", "c", "g"],
}));
const body = (i: number): QuestionBody => ({
  ...emptyBody("mcq"),
  stem: `Đề câu q${i}`,
  data: { kind: "mcq", options: ["A1", "B1", "C1", "D1"], correct: 0 },
});
const saveMatrix = vi.fn(() => Promise.resolve("m1"));

vi.mock("@/lib/exam/topic-store", () => ({
  listTopics: () =>
    Promise.resolve([
      { id: "g", parent_id: null, level: "grade", title: "Khối 11", position: 1 },
      { id: "c", parent_id: "g", level: "chapter", title: "Chương IV", position: 1 },
      { id: "L", parent_id: "c", level: "lesson", title: "Bài 11", position: 1 },
    ]),
  addTopic: vi.fn(),
  renameTopic: vi.fn(),
  deleteTopic: vi.fn(),
  setTopicPosition: vi.fn(),
}));
vi.mock("@/lib/exam/bank-store", () => ({
  listBanks: () =>
    Promise.resolve([
      {
        id: B1,
        title: "Song song",
        topic: "",
        description: "",
        created_at: "",
        updated_at: "",
        topic_id: "L",
        position: 1,
        questionCount: 5,
        hiddenCount: 0,
      },
    ]),
}));
vi.mock("@/lib/exam/matrix-store", () => ({
  listMatrices: () => Promise.resolve([]),
  listPoolQuestions: () => Promise.resolve(pool),
  getQuestionBodies: (ids: string[]) =>
    Promise.resolve(new Map(ids.map((id) => [id, body(Number(id.slice(1)))]))),
  saveMatrix: (...a: unknown[]) => saveMatrix(...(a as [])),
  deleteMatrix: vi.fn(),
}));

describe("ExamMatrices", () => {
  it("builds a matrix, shows how many exams it makes and previews one", async () => {
    render(<ExamMatrices />);
    await waitFor(() => expect(screen.getByText(/Chưa có ma trận nào/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Tạo" }));
    fireEvent.change(screen.getByLabelText("Tên ma trận"), { target: { value: "15 phút" } });
    // the tree is offered as the source: the dạng toán under Khối 11 › Chương IV › Bài 11
    const source = screen.getByLabelText("Nguồn câu hỏi") as HTMLSelectElement;
    expect([...source.options].map((o) => o.textContent?.trim())).toEqual([
      "Khối 11 (cả khối)",
      "Chương IV (cả chương)",
      "Bài 11 (cả bài)",
      "▸ Song song",
    ]);
    expect(source.value).toBe(B1);
    fireEvent.change(screen.getByLabelText("Số câu Trắc nghiệm 4 lựa chọn Nhận biết"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Thêm 2 câu vào ma trận/ }));
    expect(screen.getByText("20")).toBeTruthy(); // 5 · 4 different exams
    expect(screen.getByText(/Tổng điểm là 0,5, chưa bằng 10/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Xem thử đề/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getAllByText(/^Đề câu q\d$/)).toHaveLength(2));
    expect(within(dialog).getByText(/Mã đề:/)).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(saveMatrix).toHaveBeenCalled());
    const saved = (saveMatrix.mock.calls[0] as unknown as [{ title: string; slots: unknown[] }])[0];
    expect(saved.title).toBe("15 phút");
    expect(saved.slots).toHaveLength(2);
  });

  it("draws from a whole bài when the bài is chosen", async () => {
    render(<ExamMatrices />);
    await waitFor(() => expect(screen.getByText(/Chưa có ma trận nào/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Tạo" }));
    fireEvent.change(screen.getByLabelText("Nguồn câu hỏi"), { target: { value: "t:L" } });
    expect(
      screen.getByLabelText("Số câu Trắc nghiệm 4 lựa chọn Nhận biết").parentElement!.textContent,
    ).toContain("/5");
    fireEvent.change(screen.getByLabelText("Số câu Trắc nghiệm 4 lựa chọn bất kỳ"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Thêm 3 câu vào ma trận/ }));
    expect((screen.getByLabelText("Nguồn vị trí 1") as HTMLSelectElement).value).toBe("t:L");
    expect(screen.getByText("60")).toBeTruthy(); // 5 · 4 · 3
  });
});
