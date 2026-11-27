// Student: slide lessons the teacher gave the class, opened read-only.
import { lazy, Suspense, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { myLessons, openLesson } from "@/lib/exam/lessons.functions";
import type { StudentLesson } from "@/lib/exam/lessons.server";

const SlideLessonView = lazy(() =>
  import("@/components/slides/SlideLessonView").then((m) => ({ default: m.SlideLessonView })),
);

const TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});
function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}

export function LessonList({
  token,
  openId,
  onOpen,
}: {
  token: string;
  /** a lesson to open right away (from a notice) */
  openId?: string | null;
  onOpen?: (id: string | null) => void;
}) {
  const load = useServerFn(myLessons);
  const [list, setList] = useState<StudentLesson[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(openId ?? null);
  useEffect(() => {
    if (openId) setOpen(openId);
  }, [openId]);
  useEffect(() => {
    if (open) return;
    load({ data: { token } })
      .then((r) => setList(r.lessons))
      .catch((e) => setError(message(e)));
  }, [load, token, open]);
  const close = () => {
    setOpen(null);
    onOpen?.(null);
  };
  if (open) return <LessonReader token={token} id={open} onBack={close} />;
  if (error) return <p className="error-note">{error}</p>;
  if (!list) return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  if (!list.length)
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chưa có bài giảng nào được giao cho lớp.
      </p>
    );
  return (
    <ul className="grid gap-2">
      {list.map((l) => (
        <li
          key={l.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3"
        >
          <div>
            <p className="font-medium">{l.title}</p>
            <p className="text-xs text-muted-foreground">
              {l.open
                ? `Mở từ ${TIME.format(new Date(l.opensAt))}`
                : `Mở lúc ${TIME.format(new Date(l.opensAt))}`}
              {l.viewed && (
                <span className="ml-2 inline-flex items-center gap-1 text-green-700">
                  <CheckCircle2 size={12} />
                  Đã xem
                </span>
              )}
            </p>
          </div>
          <Button
            size="sm"
            variant={l.viewed ? "outline" : "default"}
            disabled={!l.open}
            onClick={() => setOpen(l.id)}
          >
            <BookOpen />
            {l.viewed ? "Xem lại" : "Mở bài giảng"}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function LessonReader({ token, id, onBack }: { token: string; id: string; onBack: () => void }) {
  const open = useServerFn(openLesson);
  const [data, setData] = useState<{ title: string; content: unknown } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    open({ data: { token, id } })
      .then(setData)
      .catch((e) => setError(message(e)));
  }, [open, token, id]);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Danh sách bài giảng
        </Button>
        {data && <h2 className="text-lg font-semibold">{data.title}</h2>}
      </div>
      {error && <p className="error-note">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Đang tải bài giảng…</p>}
      {data && (
        <Suspense fallback={<p className="text-sm text-muted-foreground">Đang tải bài giảng…</p>}>
          <SlideLessonView content={data.content} reserve={260} />
        </Suspense>
      )}
    </div>
  );
}
