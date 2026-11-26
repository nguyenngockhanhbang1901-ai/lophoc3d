import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OVERFLOW_MESSAGE, SlideEditor } from "./SlideEditor";
import type { Measure } from "@/lib/slides/fit";

// 3D scenes need WebGL; the editor only needs to know a model was chosen.
vi.mock("./ModelView", () => ({
  ModelView: ({ id, src }: { id?: string; src?: string }) => (
    <div data-testid="model" data-model={id ?? src} />
  ),
}));
import { newSlideContent, parseSlideContent, type SlideContent } from "@/lib/slides/model";
import type { SlideStore } from "@/lib/slides/storage";

type Row = {
  owner_id: string;
  lesson_key: string;
  title: string;
  content: unknown;
  created_at: string;
};

/** In-memory stand-in for the `lessons` table that honours the eq/like filters the editor sends. */
function makeStore(rows: Row[]) {
  const writes: string[] = [];
  const store = {
    rows,
    writes,
    from(table: string) {
      if (table !== "lessons") throw new Error(`unexpected table ${table}`);
      const filters: Array<(r: Row) => boolean> = [];
      const chain = {
        select() {
          return chain;
        },
        eq(col: keyof Row, val: string) {
          filters.push((r) => r[col] === val);
          return chain;
        },
        like(col: keyof Row, pattern: string) {
          const prefix = pattern.replace("%", "");
          filters.push((r) => String(r[col]).startsWith(prefix));
          return chain;
        },
        order() {
          return chain;
        },
        then(resolve: (v: { data: Row[]; error: null }) => unknown) {
          return Promise.resolve({
            data: rows.filter((r) => filters.every((f) => f(r))),
            error: null,
          }).then(resolve);
        },
        upsert(row: Omit<Row, "created_at">) {
          writes.push(`upsert:${row.lesson_key}`);
          const i = rows.findIndex(
            (r) => r.owner_id === row.owner_id && r.lesson_key === row.lesson_key,
          );
          if (i >= 0) rows[i] = { ...(rows[i] as Row), ...row };
          else rows.push({ ...row, created_at: new Date().toISOString() });
          return Promise.resolve({ error: null });
        },
        delete() {
          writes.push("delete");
          const del = {
            eq(col: keyof Row, val: string) {
              filters.push((r) => r[col] === val);
              return del;
            },
            then(resolve: (v: { error: null }) => unknown) {
              for (let i = rows.length - 1; i >= 0; i--)
                if (filters.every((f) => f(rows[i] as Row))) rows.splice(i, 1);
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return del;
        },
      };
      return chain;
    },
  };
  return store;
}
const asStore = (s: ReturnType<typeof makeStore>) => s as unknown as SlideStore;
function slideRow(
  owner: string,
  key: string,
  title: string,
  content: SlideContent = newSlideContent(),
): Row {
  return { owner_id: owner, lesson_key: key, title, content, created_at: "2026-01-01" };
}

afterEach(cleanup);
// jsdom has no PointerEvent; a MouseEvent carries the same button and coordinates.
if (!("PointerEvent" in window))
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class extends (
    MouseEvent
  ) {};
/** The n-th element drawn on the stage. */
function stageEl(n: number): HTMLElement {
  const els = document.querySelectorAll<HTMLElement>(".slide-stage [data-el-id]");
  return els[n] as HTMLElement;
}

describe("SlideEditor", () => {
  it("lists only the signed-in teacher's slide lessons and leaves old lessons alone", async () => {
    const store = makeStore([
      slideRow("me", "slides:a", "Bài của tôi"),
      slideRow("other", "slides:b", "Bài của người khác"),
      { owner_id: "me", lesson_key: "11", title: "Bài 11", content: {}, created_at: "2026-01-01" },
      {
        owner_id: "me",
        lesson_key: "old-uuid",
        title: "Bài chữ cũ",
        content: { text: "xin chào" },
        created_at: "2026-01-01",
      },
    ]);
    render(<SlideEditor userId="me" client={asStore(store)} />);
    const select = await screen.findByLabelText("Chọn bài học");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Bài của tôi"]);
    expect(store.writes).toEqual([]);
  });

  it("shows an empty state for a teacher with no slide lessons", async () => {
    render(
      <SlideEditor userId="me" client={asStore(makeStore([slideRow("other", "slides:b", "x")]))} />,
    );
    expect(await screen.findByText(/Chưa có bài học dạng slide/)).toBeTruthy();
  });

  it("creates a lesson, adds an activity with several slides, saves, and a fresh editor reads it back", async () => {
    const store = makeStore([]);
    const first = render(<SlideEditor userId="me" client={asStore(store)} />);
    fireEvent.click(await screen.findByRole("button", { name: /Thêm bài học/ }));
    await screen.findByLabelText("Tên bài học");
    await waitFor(() => expect(store.rows).toHaveLength(1));
    expect(store.rows[0]?.lesson_key.startsWith("slides:")).toBe(true);
    expect(store.rows[0]?.owner_id).toBe("me");

    fireEvent.change(screen.getByLabelText("Tên bài học"), { target: { value: "Bài 13" } });
    fireEvent.click(screen.getByRole("button", { name: /Thêm hoạt động/ }));
    const second = screen.getByRole("region", { name: "Hoạt động 2" });
    fireEvent.change(within(second).getByLabelText("Tên hoạt động 2"), {
      target: { value: "Khám phá" },
    });
    for (let i = 0; i < 2; i++) {
      fireEvent.click(within(second).getByRole("button", { name: /Thêm slide/ }));
      fireEvent.click(await screen.findByRole("button", { name: "Layout Tiêu đề + nội dung" }));
    }
    expect(within(second).getAllByRole("listitem")).toHaveLength(3);
    fireEvent.pointerDown(stageEl(0), { button: 0 });
    fireEvent.pointerUp(window);
    fireEvent.change(screen.getByLabelText("Nội dung tiêu đề"), {
      target: { value: "Cho $ABCD$" },
    });

    await waitFor(
      () => {
        const saved = parseSlideContent(store.rows[0]?.content);
        expect(store.rows[0]?.title).toBe("Bài 13");
        expect(saved?.activities.map((a) => [a.title, a.slides.length])).toEqual([
          ["Hoạt động 1", 1],
          ["Khám phá", 3],
        ]);
        expect(saved?.activities[1]?.slides[2]?.elements[0]?.text).toBe("Cho $ABCD$");
      },
      { timeout: 3000 },
    );
    expect(store.writes.every((w) => w.startsWith("upsert:slides:"))).toBe(true);

    first.unmount();
    render(<SlideEditor userId="me" client={asStore(store)} />);
    const outline = await screen.findByRole("region", { name: "Hoạt động 2" });
    expect(within(outline).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByLabelText("Tên bài học")).toHaveProperty("value", "Bài 13");
  });

  it("undo and redo step through edits and are saved", async () => {
    const store = makeStore([slideRow("me", "slides:a", "Bài A")]);
    render(<SlideEditor userId="me" client={asStore(store)} />);
    fireEvent.click(await screen.findByRole("button", { name: /Thêm hoạt động/ }));
    expect(screen.getAllByRole("region", { name: /Hoạt động \d/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    expect(screen.getAllByRole("region", { name: /Hoạt động \d/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Hoàn tác" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Làm lại" }));
    expect(screen.getAllByRole("region", { name: /Hoạt động \d/ })).toHaveLength(2);
    await waitFor(
      () => expect(parseSlideContent(store.rows[0]?.content)?.activities).toHaveLength(2),
      { timeout: 3000 },
    );
  });

  it("reorders activities and slides, duplicates and deletes a slide, but keeps the last one", async () => {
    const store = makeStore([slideRow("me", "slides:a", "Bài A")]);
    render(<SlideEditor userId="me" client={asStore(store)} />);
    await screen.findByTestId("slide-editor");
    fireEvent.click(screen.getByRole("button", { name: /Thêm hoạt động/ }));
    const names = () =>
      screen.getAllByLabelText(/^Tên hoạt động/).map((i) => (i as HTMLInputElement).value);
    expect(names()).toEqual(["Hoạt động 1", "Hoạt động 2"]);
    fireEvent.click(screen.getByRole("button", { name: "Đưa hoạt động 2 lên" }));
    expect(names()).toEqual(["Hoạt động 2", "Hoạt động 1"]);

    const only = screen.getByRole("region", { name: "Hoạt động 1" });
    expect(within(only).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Xóa slide" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Nhân đôi slide" }));
    expect(within(only).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Xóa slide" }));
    expect(within(only).getAllByRole("listitem")).toHaveLength(1);
  });

  it("deleting a lesson removes only that teacher's slide row", async () => {
    const store = makeStore([
      slideRow("me", "slides:a", "Bài A"),
      slideRow("other", "slides:a", "Bài A của người khác"),
      { owner_id: "me", lesson_key: "12", title: "Bài 12", content: {}, created_at: "2026-01-01" },
    ]);
    render(<SlideEditor userId="me" client={asStore(store)} />);
    fireEvent.click(await screen.findByRole("button", { name: "Xóa bài học" }));
    fireEvent.click(await screen.findByRole("button", { name: "Đồng ý" }));
    await waitFor(() => expect(store.rows).toHaveLength(2));
    expect(store.rows.map((r) => `${r.owner_id}:${r.lesson_key}`).sort()).toEqual([
      "me:12",
      "other:slides:a",
    ]);
  });

  it("keeps the edits and offers a retry when saving fails", async () => {
    const store = makeStore([slideRow("me", "slides:a", "Bài A")]);
    const real = store.from.bind(store);
    let failing = true;
    store.from = ((t: string) => {
      const c = real(t);
      const up = c.upsert;
      c.upsert = ((row: never) =>
        failing ? Promise.resolve({ error: { message: "x" } }) : up(row)) as typeof c.upsert;
      return c;
    }) as typeof store.from;
    render(<SlideEditor userId="me" client={asStore(store)} />);
    fireEvent.click(await screen.findByRole("button", { name: /Thêm hoạt động/ }));
    const retry = await screen.findByRole("button", { name: /Chưa lưu được/ }, { timeout: 3000 });
    expect(screen.getAllByRole("region", { name: /Hoạt động \d/ })).toHaveLength(2);
    failing = false;
    fireEvent.click(retry);
    await waitFor(
      () => expect(parseSlideContent(store.rows[0]?.content)?.activities).toHaveLength(2),
      { timeout: 3000 },
    );
  });
});

/** Fake text measuring: about 2.6 % of slide height per line, ~60 characters per full-width line at 24 px. */
const fakeMeasure: Measure = (el) => {
  const size = (el.fontSize ?? 24) * (el.fit ?? 1);
  const perLine = Math.max(1, Math.floor((el.w * 60 * 24) / (90 * size)));
  const lines = el.text
    .split("\n")
    .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return lines * (size / 24) * 4.5 + 1.5;
};

async function openEditor(measure: Measure = fakeMeasure) {
  const store = makeStore([slideRow("me", "slides:a", "Bài A")]);
  render(<SlideEditor userId="me" client={asStore(store)} measure={measure} />);
  await screen.findByTestId("slide-editor");
  const canvas = document.querySelector(".slide-stage .slide-canvas") as HTMLElement;
  // whole pixels (jsdom rounds mouse positions): 10 px = 1 % across, 6 px = 1 % down
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 1000,
      height: 600,
      right: 1000,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  return store;
}
const boxOf = (el: HTMLElement) => {
  const st = el.style;
  return [st.left, st.top, st.width, st.height].map((v) => parseFloat(v));
};
function drag(
  target: Element,
  from: [number, number],
  to: [number, number],
  opts: MouseEventInit = {},
) {
  fireEvent.pointerDown(target, { button: 0, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1], ...opts });
  fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] });
}
const saved = (store: ReturnType<typeof makeStore>) =>
  parseSlideContent(store.rows[0]?.content)?.activities[0]?.slides[0];

describe("SlideEditor stage (PowerPoint-like editing)", () => {
  it("click selects an element with a blue frame and 8 handles; clicking empty space clears it", async () => {
    await openEditor();
    fireEvent.pointerDown(stageEl(0), { button: 0 });
    fireEvent.pointerUp(window);
    const frame = screen.getByTestId("slide-selection");
    expect(frame.querySelectorAll("[data-handle]")).toHaveLength(8);
    expect(screen.getByLabelText("Nội dung tiêu đề")).toBeTruthy();
    fireEvent.pointerDown(document.querySelector(".slide-stage .slide-canvas") as Element, {
      button: 0,
    });
    expect(screen.queryByTestId("slide-selection")).toBeNull();
  });

  it("dragging a free text box moves it, one drag is one undo step, and it is saved", async () => {
    const store = await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Văn bản" }));
    const box = stageEl(2);
    const before = boxOf(box);
    drag(box, [400, 300], [500, 360], { altKey: true }); // +10 % across, +10 % down
    expect(boxOf(stageEl(2))).toEqual([before[0]! + 10, before[1]! + 10, before[2], before[3]]);
    await waitFor(() => expect(saved(store)?.elements[2]?.x).toBe(before[0]! + 10), {
      timeout: 3000,
    });
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    expect(boxOf(stageEl(2))).toEqual(before);
  });

  it("dragging the bottom-right handle resizes; arrow keys nudge; Delete removes", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Văn bản" }));
    // a new text box opens for typing straight away; Escape leaves typing
    fireEvent.keyDown(screen.getByLabelText("Sửa chữ trên slide"), { key: "Escape" });
    const before = boxOf(stageEl(2));
    const se = screen.getByTestId("slide-selection").querySelector('[data-handle="se"]') as Element;
    drag(se, [0, 0], [50, 30], { altKey: true }); // +5 % wide, +5 % tall
    expect(boxOf(stageEl(2))).toEqual([before[0], before[1], before[2]! + 5, before[3]! + 5]);
    const stage = document.querySelector(".slide-stage") as HTMLElement;
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    fireEvent.keyDown(stage, { key: "ArrowDown", shiftKey: true });
    expect(boxOf(stageEl(2)).slice(0, 2)).toEqual([before[0]! + 0.5, before[1]! + 5]);
    fireEvent.keyDown(stage, { key: "Delete" });
    expect(document.querySelectorAll(".slide-stage [data-el-id]")).toHaveLength(2);
  });

  it("snaps to the slide centre while dragging and shows a guide", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Văn bản" }));
    const [x, , w] = boxOf(stageEl(2)) as [number, number, number, number];
    const toCentre = (50 - (x + w / 2)) * 10 + 4; // 0.4 % past the centre
    drag(stageEl(2), [0, 0], [toCentre, 0]);
    const [nx, , nw] = boxOf(stageEl(2)) as [number, number, number, number];
    expect(nx + nw / 2).toBeCloseTo(50, 1);
  });

  it("double-click on text edits it in place; Escape cancels", async () => {
    const store = await openEditor();
    fireEvent.doubleClick(stageEl(0));
    const inline = screen.getByLabelText("Sửa chữ trên slide");
    fireEvent.change(inline, { target: { value: "Hai đường thẳng $a \\ss b$" } });
    fireEvent.blur(inline);
    expect(stageEl(0).textContent).toContain("Hai đường thẳng");
    await waitFor(
      () => expect(saved(store)?.elements[0]?.text).toBe("Hai đường thẳng $a \\ss b$"),
      { timeout: 3000 },
    );
    fireEvent.doubleClick(stageEl(0));
    fireEvent.change(screen.getByLabelText("Sửa chữ trên slide"), { target: { value: "bỏ" } });
    fireEvent.keyDown(screen.getByLabelText("Sửa chữ trên slide"), { key: "Escape" });
    expect(stageEl(0).textContent).toContain("Hai đường thẳng");
  });

  it("text that does not fit a layout box shrinks a little first", async () => {
    await openEditor();
    fireEvent.pointerDown(stageEl(1), { button: 0 });
    fireEvent.pointerUp(window);
    fireEvent.change(screen.getByLabelText("Nội dung văn bản"), {
      target: { value: "dòng\n".repeat(15) },
    });
    expect(screen.queryByText(OVERFLOW_MESSAGE)).toBeNull();
    expect(screen.getByText(/Chữ đang tự thu nhỏ còn \d+%/)).toBeTruthy();
  });

  it("too much text for a layout box warns: Hủy undoes the change, Đồng ý keeps it as a custom box", async () => {
    const store = await openEditor();
    fireEvent.pointerDown(stageEl(1), { button: 0 });
    fireEvent.pointerUp(window);
    const area = screen.getByLabelText("Nội dung văn bản");
    fireEvent.change(area, { target: { value: "ngắn" } });
    fireEvent.change(area, { target: { value: "dòng\n".repeat(40) } });
    expect(await screen.findByText(OVERFLOW_MESSAGE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect((screen.getByLabelText("Nội dung văn bản") as HTMLTextAreaElement).value).toBe("ngắn");
    fireEvent.change(screen.getByLabelText("Nội dung văn bản"), {
      target: { value: "dòng\n".repeat(40) },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Đồng ý" }));
    expect(screen.getByText(/đã được chỉnh ra ngoài layout/)).toBeTruthy();
    expect(document.querySelector(".slide-custom-mark")).toBeTruthy();
    await waitFor(() => expect(saved(store)?.elements[1]?.custom).toBe(true), { timeout: 3000 });
    // once custom, more text does not ask again
    fireEvent.change(screen.getByLabelText("Nội dung văn bản"), {
      target: { value: "dòng\n".repeat(45) },
    });
    expect(screen.queryByText(OVERFLOW_MESSAGE)).toBeNull();
    // Khôi phục layout mặc định puts it back
    fireEvent.click(screen.getByRole("button", { name: /Khôi phục layout mặc định/ }));
    expect(document.querySelector(".slide-custom-mark")).toBeNull();
    expect(boxOf(stageEl(1))).toEqual([5, 25, 90, 65]);
  });

  it("dragging the title out of its layout box warns; Hủy puts it back", async () => {
    await openEditor();
    const before = boxOf(stageEl(0));
    drag(stageEl(0), [500, 50], [500, 400]);
    expect(await screen.findByText(OVERFLOW_MESSAGE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(boxOf(stageEl(0))).toEqual(before);
    drag(stageEl(0), [500, 50], [500, 400]);
    fireEvent.click(await screen.findByRole("button", { name: "Đồng ý" }));
    expect(boxOf(stageEl(0))[1]).toBeGreaterThan(before[1]! + 50);
  });

  it("a free text box grows to fit its text instead of warning", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Văn bản" }));
    const h = boxOf(stageEl(2))[3]!;
    fireEvent.change(screen.getByLabelText("Nội dung văn bản"), {
      target: { value: "a\nb\nc\nd\ne" },
    });
    expect(screen.queryByText(OVERFLOW_MESSAGE)).toBeNull();
    expect(boxOf(stageEl(2))[3]).toBeGreaterThan(h);
  });

  it("font size, bold, colour, alignment and numeric position change the element", async () => {
    await openEditor();
    fireEvent.pointerDown(stageEl(1), { button: 0 });
    fireEvent.pointerUp(window);
    fireEvent.change(screen.getByLabelText("Nội dung văn bản"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Cỡ chữ"), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("button", { name: "Chữ đậm" }));
    fireEvent.click(screen.getByRole("button", { name: "Căn giữa" }));
    fireEvent.change(screen.getByLabelText("Màu chữ"), { target: { value: "#ff0000" } });
    const text = stageEl(1).querySelector(".slide-text") as HTMLElement;
    expect((screen.getByLabelText("Cỡ chữ") as HTMLInputElement).value).toBe("32");
    expect(text.style.fontWeight).toBe("700");
    expect(text.style.textAlign).toBe("center");
    expect(text.style.color).toBe("rgb(255, 0, 0)");
    fireEvent.change(screen.getByLabelText("Cao"), { target: { value: "40" } });
    expect(boxOf(stageEl(1))[3]).toBe(40);
  });
});

it("a new text box is ready to type into", async () => {
  const store = await openEditor();
  fireEvent.click(screen.getByRole("button", { name: "Văn bản" }));
  const inline = screen.getByLabelText("Sửa chữ trên slide");
  expect(document.activeElement).toBe(inline);
  fireEvent.change(inline, { target: { value: "Ví dụ 1" } });
  fireEvent.blur(inline);
  await waitFor(() => expect(saved(store)?.elements[2]?.text).toBe("Ví dụ 1"), { timeout: 3000 });
});

describe("SlideEditor Hiệu ứng tab", () => {
  const rows = () => screen.getAllByTestId("anim-row");
  const steps = () => rows().map((r) => r.getAttribute("data-step"));

  it("lists elements in appearance order, merges a step, reorders, and resets automatically", async () => {
    const store = await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Văn bản" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Hiệu ứng" }));
    fireEvent.click(screen.getByRole("tab", { name: "Hiệu ứng" }));
    expect(await screen.findAllByTestId("anim-row")).toHaveLength(3);
    expect(steps()).toEqual(["1", "2", "3"]);
    const badges = () =>
      [...document.querySelectorAll(".slide-stage .slide-order-badge")].map((b) => b.textContent);
    expect(badges()).toEqual(["1", "2", "3"]);

    // two texts on one Enter
    fireEvent.change(within(rows()[2]!).getByRole("combobox"), { target: { value: "with" } });
    expect(steps()).toEqual(["1", "2", "2"]);
    // the new text first
    fireEvent.click(within(rows()[2]!).getByRole("button", { name: /lên trước/ }));
    fireEvent.click(within(rows()[1]!).getByRole("button", { name: /lên trước/ }));
    expect(rows()[0]!.textContent).toContain("Văn bản (trống)");
    // shown at once
    fireEvent.change(within(rows()[0]!).getByRole("combobox"), { target: { value: "immediate" } });
    expect(steps()[0]).toBe("0");
    await waitFor(() => expect(saved(store)?.elements[2]?.anim).toBe("immediate"), {
      timeout: 3000,
    });

    fireEvent.click(screen.getByRole("button", { name: "Đặt lại tự động" }));
    expect(steps()).toEqual(["1", "2", "3"]);
    expect(rows()[0]!.textContent).toContain("Tiêu đề");
  });

  it("drag and drop reorders the list", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("tab", { name: "Hiệu ứng" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Hiệu ứng" }));
    const list = await screen.findAllByTestId("anim-row");
    const dt = { effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(list[1]!, { dataTransfer: dt });
    fireEvent.dragOver(list[0]!, { dataTransfer: dt });
    fireEvent.drop(list[0]!, { dataTransfer: dt });
    expect(rows()[0]!.textContent).toContain("Văn bản");
  });

  it("Xem thử plays the steps on the slide and stops by itself", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await openEditor();
      fireEvent.click(screen.getByRole("button", { name: "Xem thử" }));
      const hidden = () =>
        [...document.querySelectorAll(".slide-preview [data-el-id]")].map((e) =>
          e.getAttribute("data-hidden"),
        );
      expect(hidden()).toEqual(["true", "true"]);
      await act(() => vi.advanceTimersByTimeAsync(950));
      expect(hidden()).toEqual([null, "true"]);
      await act(() => vi.advanceTimersByTimeAsync(950));
      expect(hidden()).toEqual([null, null]);
      await act(() => vi.advanceTimersByTimeAsync(1600));
      expect(document.querySelector(".slide-preview")).toBeNull();
      expect(document.querySelector(".slide-stage")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SlideEditor layouts and media", () => {
  it("changing the layout keeps every piece of content, and a new slide can start from any layout", async () => {
    const store = await openEditor();
    fireEvent.doubleClick(stageEl(0));
    fireEvent.change(screen.getByLabelText("Sửa chữ trên slide"), {
      target: { value: "Tiêu đề A" },
    });
    fireEvent.blur(screen.getByLabelText("Sửa chữ trên slide"));
    fireEvent.doubleClick(stageEl(1));
    fireEvent.change(screen.getByLabelText("Sửa chữ trên slide"), {
      target: { value: "Nội dung B" },
    });
    fireEvent.blur(screen.getByLabelText("Sửa chữ trên slide"));

    fireEvent.click(screen.getByRole("button", { name: /Layout: Tiêu đề \+ nội dung/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Layout Hai cột" }));
    expect(screen.getByRole("button", { name: /Layout: Hai cột/ })).toBeTruthy();
    const texts = () =>
      [...document.querySelectorAll(".slide-stage .slide-text")].map((t) => t.textContent);
    expect(texts()).toContain("Tiêu đề A");
    expect(texts()).toContain("Nội dung B");
    fireEvent.click(screen.getByRole("button", { name: /Layout: Hai cột/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Layout Trống" }));
    expect(texts()).toContain("Tiêu đề A");
    expect(texts()).toContain("Nội dung B");
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    expect(screen.getByRole("button", { name: /Layout: Hai cột/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Thêm slide/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Layout Trang bìa" }));
    expect(screen.getByRole("button", { name: /Layout: Trang bìa/ })).toBeTruthy();
    await waitFor(
      () =>
        expect(parseSlideContent(store.rows[0]?.content)?.activities[0]?.slides[1]?.layout).toBe(
          "cover",
        ),
      { timeout: 3000 },
    );
  });

  it("inserts a picture from a link, at the end of the appearance order", async () => {
    const store = await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Hình ảnh" }));
    fireEvent.change(await screen.findByLabelText("Đường link ảnh"), {
      target: { value: "https://example.com/a.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dùng link" }));
    const img = document.querySelector(".slide-stage img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://example.com/a.png");
    await waitFor(
      () => {
        const s = saved(store);
        expect(s?.elements[2]?.type).toBe("image");
        expect(s?.order[2]).toBe(s?.elements[2]?.id);
      },
      { timeout: 3000 },
    );
  });

  it("rejects a link that is not a web address", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Hình ảnh" }));
    fireEvent.change(await screen.findByLabelText("Đường link ảnh"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dùng link" }));
    expect(screen.getByRole("alert").textContent).toMatch(/https/);
  });

  it("inserts a model from the web's library, or the teacher's own .glb by link", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Mô hình 3D" }));
    fireEvent.click(await screen.findByRole("button", { name: /Hai đường thẳng chéo nhau/ }));
    expect(screen.getByTestId("model").getAttribute("data-model")).toBe("pair-skew");
    fireEvent.click(screen.getByRole("button", { name: "Mô hình 3D" }));
    fireEvent.change(await screen.findByLabelText(/Đường link tệp \.glb/), {
      target: { value: "https://example.com/m.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dùng link" }));
    expect(screen.getByRole("alert").textContent).toMatch(/\.glb/);
    fireEvent.change(screen.getByLabelText(/Đường link tệp \.glb/), {
      target: { value: "https://example.com/m.glb" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dùng link" }));
    expect(screen.getAllByTestId("model").map((m) => m.getAttribute("data-model"))).toEqual([
      "pair-skew",
      "https://example.com/m.glb",
    ]);
  });

  it("an empty picture box of a layout can be filled with a 3D model instead", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: /Layout: / }));
    fireEvent.click(await screen.findByRole("button", { name: "Layout Văn bản + hình/3D" }));
    const placeholder = screen.getByText("Chọn hình ảnh");
    fireEvent.doubleClick(placeholder);
    fireEvent.click(await screen.findByRole("button", { name: "Mô hình 3D", pressed: false }));
    fireEvent.click(screen.getByRole("button", { name: /Hình lập phương/ }));
    expect(screen.getByTestId("model").getAttribute("data-model")).toBe("cube");
  });
});
