import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { emptyBody } from "@/lib/exam/questions";
import { QuestionEditor } from "./QuestionEditor";

vi.mock("@/components/slides/media-files", () => ({ imageFileToDataUrl: () => Promise.resolve("data:image/png;base64,AAAA") }));

function setup() {
  const onSave = vi.fn();
  render(
    <Dialog open>
      <DialogContent>
        <QuestionEditor userId="u" initial={{ level: "nb", topic: "", body: { ...emptyBody("mcq"), stem: "Đề" } }} busy={false} onSave={onSave} onCancel={() => undefined} />
      </DialogContent>
    </Dialog>,
  );
  return onSave;
}
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "a.png", { type: "image/png" });

describe("QuestionEditor pasting pictures", () => {
  it("Ctrl+V of a picture becomes the figure", async () => {
    const onSave = setup();
    const stem = screen.getAllByRole("textbox")[1]!;
    fireEvent.paste(stem, { clipboardData: { files: [png()], getData: () => "" } });
    await waitFor(() => expect(screen.getByText("Ảnh")).toBeTruthy());
    fireEvent.click(screen.getByText("Lưu câu hỏi"));
    expect(onSave.mock.calls[0]![0].body.media).toEqual({ kind: "image", src: "data:image/png;base64,AAAA" });
  });

  it("text pasted from Word into a text box stays text", () => {
    setup();
    const stem = screen.getAllByRole("textbox")[1]!;
    fireEvent.paste(stem, { clipboardData: { files: [png()], getData: () => "Cho hình chóp" } });
    expect(screen.queryByText("Ảnh")).toBeNull();
  });
});
