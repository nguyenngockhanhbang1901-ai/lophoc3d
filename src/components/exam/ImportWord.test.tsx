import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImportWord } from "./ImportWord";

// jsdom has no canvas: picture shrinking is a browser job, stand in for it here
vi.mock("@/components/slides/media-files", () => ({
  imageFileToDataUrl: () => Promise.resolve("data:image/png;base64,AAAA"),
}));

const bytes = readFileSync(resolve(process.cwd(), "src/lib/exam/__fixtures__/de-mau.docx"));

describe("ImportWord", () => {
  it("splits the sample file and saves the chosen questions in order", async () => {
    const onSave = vi.fn();
    render(
      <Dialog open>
        <DialogContent>
          <ImportWord
            userId="u"
            bankTitle="Bài 11"
            defaultTopic="Bài 11"
            busy={false}
            onSave={onSave}
            onClose={() => undefined}
          />
        </DialogContent>
      </Dialog>,
    );
    const file = new File([bytes], "de.docx");
    Object.defineProperty(file, "arrayBuffer", {
      value: () =>
        Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        "Tách được 7 câu: 4 trắc nghiệm, 1 đúng/sai, 2 trả lời ngắn",
      ),
    );
    expect(document.querySelectorAll("img").length).toBe(1); // the figure of question 3
    expect(document.body.textContent).toContain("Không có câu nào cần xem lại");
    // leave out question 2
    fireEvent.click(screen.getByLabelText("Câu 2"));
    fireEvent.click(screen.getByText("Lưu 6 câu vào ngân hàng"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as {
      body: { data: { kind: string } };
      level: string;
      topic: string;
    }[];
    expect(saved).toHaveLength(6);
    expect(saved.map((q) => q.body.data.kind)).toEqual([
      "mcq",
      "mcq",
      "mcq",
      "tf",
      "short",
      "short",
    ]);
    expect(saved[1]!.level).toBe("th");
    expect(saved[0]!.topic).toBe("Bài 11");
  });
});
