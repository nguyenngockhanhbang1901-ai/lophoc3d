import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const rows = [
  {
    lesson_key: "old-text",
    title: "Bài chữ cũ",
    content: { text: "xin chào" },
    owner_id: "me",
    created_at: "1",
    id: "1",
  },
  {
    lesson_key: "slides:abc",
    title: "Bài slide mới",
    content: { kind: "slides" },
    owner_id: "me",
    created_at: "2",
    id: "2",
  },
];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }),
  },
}));

import { LessonCatalogue } from "./LessonCatalogue";

afterEach(cleanup);

describe("LessonCatalogue (classroom) with slide lessons present", () => {
  it("keeps the built-in lessons and old text lessons, and leaves slide lessons to the slide editor", async () => {
    render(<LessonCatalogue userId="me" value="12" disabled={false} onChange={() => {}} />);
    await waitFor(() =>
      expect(
        within(screen.getByLabelText("Chọn bài học")).getAllByRole("option").length,
      ).toBeGreaterThan(3),
    );
    const labels = within(screen.getByLabelText("Chọn bài học"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual([
      "Bài 11: Hai đường thẳng song song",
      "Bài 11.1: Hai đường thẳng song song",
      "Bài 12: Đường thẳng và mặt phẳng song song",
      "Bài chữ cũ",
    ]);
  });
});
