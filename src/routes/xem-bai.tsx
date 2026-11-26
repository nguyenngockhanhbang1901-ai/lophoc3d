import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SlideLessonView } from "@/components/slides/SlideLessonView";
import { useTeacher } from "@/components/slides/use-teacher";
import { loadSlideLesson, type SlideLessonRow } from "@/lib/slides/storage";

export const Route = createFileRoute("/xem-bai")({
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): { lesson?: string; mode?: "lecture" | "presentation" } => ({
    ...(typeof search["lesson"] === "string" && search["lesson"]
      ? { lesson: search["lesson"] }
      : {}),
    ...(search["mode"] === "presentation" ? { mode: "presentation" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Xem bài giảng · Lớp học Hình học 3D" },
      {
        name: "description",
        content: "Xem nhanh bài đang soạn ở chế độ bài giảng hoặc trình chiếu.",
      },
    ],
  }),
  component: ViewPage,
});

function ViewPage() {
  const { lesson: key = "", mode = "lecture" } = Route.useSearch();
  const user = useTeacher();
  const [row, setRow] = useState<SlideLessonRow | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [presenting, setPresenting] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadSlideLesson(supabase, user.id, key)
      .then((r) => {
        if (!cancelled) setRow(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không tải được bài học");
      });
    return () => {
      cancelled = true;
    };
  }, [user, key]);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresenting(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const start = useCallback(async () => {
    setPresenting(true);
    try {
      await stage.current?.requestFullscreen?.();
    } catch {
      /* the full-window layout below still works */
    }
  }, []);
  const stop = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) void document.exitFullscreen?.();
  }, []);

  const back = (
    <Button variant="ghost" size="sm" asChild>
      <Link to="/soan-bai" search={{ lesson: key }}>
        <ArrowLeft />
        Soạn bài giảng
      </Link>
    </Button>
  );
  if (user === undefined)
    return (
      <main className="mx-auto max-w-5xl p-4">
        <p role="status">Đang kiểm tra đăng nhập…</p>
      </main>
    );
  if (user === null)
    return (
      <main className="mx-auto max-w-5xl p-4">
        <p className="mb-3">Đăng nhập tài khoản giáo viên để xem bài.</p>
        <Button asChild>
          <Link to="/auth">Đăng nhập giáo viên</Link>
        </Button>
      </main>
    );
  if (error)
    return (
      <main className="mx-auto max-w-5xl p-4">
        {back}
        <p className="error-note" role="alert">
          {error}
        </p>
      </main>
    );
  if (row === undefined)
    return (
      <main className="mx-auto max-w-5xl p-4">
        <p role="status">Đang tải bài học…</p>
      </main>
    );
  if (row === null)
    return (
      <main className="mx-auto max-w-5xl p-4">
        {back}
        <p>Không tìm thấy bài học dạng slide này.</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-3">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        {back}
        <h1 className="mr-auto text-lg font-semibold">{row.title}</h1>
        <Button variant={mode === "lecture" ? "default" : "outline"} size="sm" asChild>
          <Link to="/xem-bai" search={{ lesson: key, mode: "lecture" }}>
            Bài giảng
          </Link>
        </Button>
        <Button variant={mode === "presentation" ? "default" : "outline"} size="sm" asChild>
          <Link to="/xem-bai" search={{ lesson: key, mode: "presentation" }}>
            Trình chiếu
          </Link>
        </Button>
      </header>
      <div
        ref={stage}
        className={
          presenting ? "fixed inset-0 z-50 flex items-center justify-center bg-black" : undefined
        }
        data-presenting={presenting || undefined}
      >
        {presenting && (
          <Button
            className="absolute right-3 top-3 z-10 opacity-40 hover:opacity-100"
            variant="secondary"
            size="icon"
            aria-label="Thoát trình chiếu"
            onClick={stop}
          >
            <X />
          </Button>
        )}
        {mode === "presentation" && !presenting ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p>
              Trình chiếu toàn màn hình: Enter hoặc → hiện bước kế tiếp, ← lùi một bước, Esc để
              thoát.
            </p>
            <Button
              size="lg"
              onClick={() => {
                void start();
              }}
            >
              <Maximize />
              Bắt đầu trình chiếu
            </Button>
          </div>
        ) : (
          <div className="w-full">
            <SlideLessonView
              content={row.content}
              bare={presenting}
              reserve={presenting ? 8 : 200}
            />
          </div>
        )}
      </div>
    </main>
  );
}
