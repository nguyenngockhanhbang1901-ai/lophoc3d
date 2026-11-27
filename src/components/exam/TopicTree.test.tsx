import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TopicTree } from "./TopicTree";

const addTopic = vi.fn(() => Promise.resolve("new"));
const saveBank = vi.fn(() => Promise.resolve("f9"));
const placeBank = vi.fn(() => Promise.resolve());
vi.mock("@/lib/exam/topic-store", () => ({
  addTopic: (...a: unknown[]) => addTopic(...(a as [])),
  renameTopic: vi.fn(),
  deleteTopic: vi.fn(),
  setTopicPosition: vi.fn(),
}));
vi.mock("@/lib/exam/bank-store", () => ({
  saveBank: (...a: unknown[]) => saveBank(...(a as [])),
  placeBank: (...a: unknown[]) => placeBank(...(a as [])),
}));

const topics = [
  { id: "g", parent_id: null, level: "grade" as const, title: "Khối 11", position: 1 },
  { id: "c", parent_id: "g", level: "chapter" as const, title: "Chương IV", position: 1 },
  { id: "L", parent_id: "c", level: "lesson" as const, title: "Bài 11", position: 1 },
];
const bank = (id: string, title: string, topic_id: string | null) => ({
  id,
  title,
  topic: "",
  description: "",
  topic_id,
  position: 1,
  created_at: "",
  updated_at: "",
  questionCount: 3,
  hiddenCount: 0,
});

describe("TopicTree", () => {
  it("lets the teacher add khối and dạng toán, and file an old bank into a bài", async () => {
    const onChanged = vi.fn(() => Promise.resolve());
    const onSelect = vi.fn();
    render(
      <TopicTree
        topics={topics}
        banks={[bank("f1", "Dạng 1", "L"), bank("old", "Ngân hàng cũ", null)]}
        selected="f1"
        onSelect={onSelect}
        onChanged={onChanged}
      />,
    );
    expect(screen.getByText("Chưa phân loại", { exact: false })).toBeTruthy();
    // counts roll up the branch
    expect(screen.getByText("Khối 11").parentElement!.textContent).toContain("3");

    fireEvent.click(screen.getByRole("button", { name: "Thêm khối" }));
    fireEvent.change(screen.getByLabelText("Tên khối"), { target: { value: "Khối 12" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    await waitFor(() => expect(addTopic).toHaveBeenCalledWith("grade", "Khối 12", null, 2));

    fireEvent.click(screen.getByRole("button", { name: "Thêm dạng toán vào Bài 11" }));
    fireEvent.change(screen.getByLabelText("Tên dạng toán"), { target: { value: "Dạng 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    await waitFor(() =>
      expect(saveBank).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Dạng 2", topicId: "L", position: 2 }),
      ),
    );
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("f9"));

    fireEvent.click(screen.getByRole("button", { name: "Chuyển Ngân hàng cũ sang bài khác" }));
    fireEvent.click(await screen.findByRole("button", { name: "Chuyển" }));
    await waitFor(() => expect(placeBank).toHaveBeenCalledWith("old", "L", 2));
  });
});
