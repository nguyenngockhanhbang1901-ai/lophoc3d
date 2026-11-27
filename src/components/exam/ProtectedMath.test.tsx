import { expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("html-to-image", () => ({
  getFontEmbedCSS: vi.fn(async () => "@font-face{font-family:KaTeX_Main;src:url(a),url(b)}"),
  toPng: vi.fn(async () => "data:image/png;base64,AAAA"),
}));

const { ProtectedMath } = await import("./ExamMath");

it("shows the text normally, or only a picture of it in high anti-copy mode", async () => {
  const { rerender, container } = render(<ProtectedMath text="Câu hỏi $x^2$" protect={false} />);
  expect(screen.getByText(/Câu hỏi/)).toBeTruthy();
  rerender(<ProtectedMath text="Câu hỏi $x^2$" protect />);
  await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
  expect(container.querySelector("img")!.getAttribute("src")).toMatch(/^data:image\/png/);
  expect(screen.queryByText(/Câu hỏi/)).toBeNull();
  const { toPng } = await import("html-to-image");
  expect(vi.mocked(toPng).mock.calls[0]![1]!.fontEmbedCSS).toBe(
    "@font-face{font-family:KaTeX_Main;src: url(a)}",
  );
});
