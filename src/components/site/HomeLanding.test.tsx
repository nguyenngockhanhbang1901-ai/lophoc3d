import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => (
    <a href={to}>{children as never}</a>
  ),
}));
import { HomeLanding } from "./HomeLanding";

describe("HomeLanding for guests", () => {
  it("does not open a lesson: asks for the class code instead", () => {
    render(<HomeLanding joinForm={<input aria-label="Mã lớp" />} focusJoin={false} />);
    fireEvent.click(screen.getByText("Bài 11. Hai đường thẳng song song"));
    expect(screen.getByText("Cần mã lớp để xem bài giảng")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nhập mã lớp" }));
    expect(screen.queryByText("Cần mã lớp để xem bài giảng")).toBeNull();
  });
});
