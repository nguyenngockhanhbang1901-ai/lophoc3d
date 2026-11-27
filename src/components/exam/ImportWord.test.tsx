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

describe("ImportWord for an exam", () => {
  it("blocks creating the exam until every kept question is complete", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
    const u = (t: string) =>
      `<w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
    const docXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[
      p("Câu 1. Một cộng một bằng"),
      p("A. 1"),
      u("B. 2"),
      p("C. 3"),
      p("D. 4"),
      p("Câu 2. Hai cộng hai bằng"),
      p("A. 3"),
      p("B. 4"),
      p("C. 5"),
      p("D. 6"),
    ].join("")}</w:body></w:document>`;
    const docx = zipSync({
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      ),
      "word/document.xml": strToU8(docXml),
    });
    const onSave = vi.fn();
    render(
      <Dialog open>
        <DialogContent>
          <ImportWord
            mode="exam"
            userId="u"
            bankTitle=""
            defaultTopic=""
            busy={false}
            onSave={onSave}
            onClose={() => undefined}
          />
        </DialogContent>
      </Dialog>,
    );
    const file = new File([docx], "kiem-tra.docx");
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.resolve(docx.buffer.slice(0)),
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(document.body.textContent).toContain("Tách được 2 câu"));
    expect(document.body.textContent).toContain("Còn 1 câu chưa nhận dạng được đầy đủ");
    const next = screen.getByText("Tiếp tục với 2 câu").closest("button")!;
    expect(next.disabled).toBe(true);
    // leaving the incomplete question out lets the teacher go on
    fireEvent.click(screen.getByLabelText("Câu 2"));
    const go = screen.getByText("Tiếp tục với 1 câu").closest("button")!;
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    expect(onSave).toHaveBeenCalledWith(expect.any(Array), "kiem-tra.docx");
  });
});
