import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { emptyBody, type QuestionKind, type QuestionRow } from "@/lib/exam/questions";
import { QuestionBank } from "./QuestionBank";

const q = (id: string, kind: QuestionKind, stem: string): QuestionRow => ({
  id,
  bank_id: "b1",
  position: Number(id),
  kind,
  level: "nb",
  topic: "",
  body: { ...emptyBody(kind), stem },
  hidden: false,
  created_at: "",
  updated_at: "",
});

vi.mock("@/lib/exam/bank-store", () => ({
  listBanks: () => Promise.resolve([{ id: "b1", title: "Bài 11", topic: "", description: "", created_at: "", updated_at: "", questionCount: 4, hiddenCount: 0 }]),
  listQuestions: () => Promise.resolve([q("1", "mcq", "Câu TN 1"), q("2", "tf", "Câu ĐS 1"), q("3", "short", "Câu TLN 1"), q("4", "mcq", "Câu TN 2")]),
  saveBank: vi.fn(),
  deleteBank: vi.fn(),
  saveQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
  setQuestionHidden: vi.fn(),
  reorderQuestions: vi.fn(),
  copyQuestion: vi.fn(),
}));

describe("QuestionBank kinds", () => {
  it("groups questions by kind and filters with tabs", async () => {
    render(<QuestionBank userId="u" />);
    await waitFor(() => expect(screen.getByText("Câu TN 2")).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Tất cả (4)" })).toBeTruthy();
    expect(screen.getByText(/Phần II\. Trắc nghiệm đúng\/sai · 1 câu/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Đúng/sai (1)" }));
    expect(screen.getByText("Câu ĐS 1")).toBeTruthy();
    expect(screen.queryByText("Câu TN 1")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Trả lời ngắn (1)" }));
    expect(screen.getByText("Câu TLN 1")).toBeTruthy();
    expect(screen.queryByText("Câu ĐS 1")).toBeNull();
  });
});
