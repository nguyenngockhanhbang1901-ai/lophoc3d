import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newSlideContent } from "@/lib/slides/model";

type Row = {
  lesson_key: string;
  title: string;
  content: unknown;
  owner_id: string;
  created_at: string;
  id: string;
};
const rows: Row[] = [
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
    content: newSlideContent(),
    owner_id: "me",
    created_at: "2",
    id: "2",
  },
];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [...rows], error: null }) }),
    }),
  },
}));

import { LessonCatalogue } from "./LessonCatalogue";

afterEach(() => {
  cleanup();
  rows.splice(2);
});
const labels = () =>
  within(screen.getByLabelText("Chọn bài học"))
    .getAllByRole("option")
    .map((o) => o.textContent);

describe("LessonCatalogue (Bài học page)", () => {
  it("lists the built-in lessons, old text lessons and the slide lessons from the database", async () => {
    render(<LessonCatalogue userId="me" value="12" disabled={false} onChange={() => {}} />);
    await waitFor(() => expect(labels()).toHaveLength(5));
    expect(labels()).toEqual([
      "Bài 11: Hai đường thẳng song song",
      "Bài 11.1: Hai đường thẳng song song",
      "Bài 12: Đường thẳng và mặt phẳng song song",
      "Bài chữ cũ",
      "Bài slide mới",
    ]);
  });

  it("passes the stored slide content to the classroom when the lesson is chosen", async () => {
    const onChange = vi.fn();
    render(<LessonCatalogue userId="me" value="12" disabled={false} onChange={onChange} />);
    await waitFor(() => expect(labels()).toHaveLength(5));
    fireEvent.change(screen.getByLabelText("Chọn bài học"), { target: { value: "slides:abc" } });
    expect(onChange).toHaveBeenCalledWith("slides:abc", "Bài slide mới", rows[1]!.content);
  });

  it("a lesson saved in Soạn bài giảng appears when this page regains focus, without a reload", async () => {
    render(<LessonCatalogue userId="me" value="12" disabled={false} onChange={() => {}} />);
    await waitFor(() => expect(labels()).toHaveLength(5));
    rows.push({
      lesson_key: "slides:new",
      title: "Bài vừa soạn",
      content: newSlideContent(),
      owner_id: "me",
      created_at: "3",
      id: "3",
    });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(labels()).toContain("Bài vừa soạn"));
  });

  it("the pencil for a slide lesson opens Soạn bài giảng, never the plain-text editor", async () => {
    render(<LessonCatalogue userId="me" value="slides:abc" disabled={false} onChange={() => {}} />);
    await waitFor(() => expect(labels()).toHaveLength(5));
    const pencil = screen.getByLabelText("Sửa bài học");
    expect(pencil.tagName).toBe("A");
    expect(pencil.getAttribute("href")).toBe("/soan-bai?lesson=slides%3Aabc");
  });

  it("the pencil for an old text lesson still opens the text editor", async () => {
    render(<LessonCatalogue userId="me" value="old-text" disabled={false} onChange={() => {}} />);
    await waitFor(() => expect(labels()).toHaveLength(5));
    fireEvent.click(screen.getByLabelText("Sửa bài học"));
    expect(await screen.findByText("Sửa bài học", { selector: "h2" })).toBeTruthy();
    expect((screen.getByLabelText("Nội dung bài học") as HTMLTextAreaElement).value).toBe(
      "xin chào",
    );
  });

  it("shows only the built-in lessons to a signed-out visitor (no database read)", () => {
    render(<LessonCatalogue disabled={false} value="12" onChange={() => {}} />);
    expect(labels()).toEqual([
      "Bài 11: Hai đường thẳng song song",
      "Bài 11.1: Hai đường thẳng song song",
      "Bài 12: Đường thẳng và mặt phẳng song song",
    ]);
  });
});
