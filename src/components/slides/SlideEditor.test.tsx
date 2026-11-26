import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SlideEditor } from "./SlideEditor";
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
    fireEvent.click(within(second).getByRole("button", { name: /Thêm slide/ }));
    fireEvent.click(within(second).getByRole("button", { name: /Thêm slide/ }));
    expect(within(second).getAllByRole("listitem")).toHaveLength(3);
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
