import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Box,
  ChevronDown,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Home,
  KeyRound,
  Lightbulb,
  LogIn,
  MonitorCheck,
  Play,
  Presentation,
  Rocket,
  SquareCheckBig,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AuthorCredit, HeroArt, SLOGAN, SiteLogo } from "./brand";
import { LessonThumb } from "./thumbs";

type Tool = {
  title: string;
  detail: string;
  icon: typeof Box;
  tone: string;
  href?: string;
  action?: "model";
};
const TOOLS: Tool[] = [
  {
    title: "Soạn bài giảng",
    detail: "Thiết kế bài giảng tương tác",
    icon: Presentation,
    tone: "bg-blue-50 text-blue-600",
    href: "/soan-bai",
  },
  {
    title: "Lớp học trực tuyến",
    detail: "Tổ chức và quản lý lớp học",
    icon: Users,
    tone: "bg-violet-50 text-violet-600",
    href: "/?vao=lop-hoc",
  },
  {
    title: "Kiểm tra trực tuyến",
    detail: "Giao bài và đánh giá học sinh",
    icon: SquareCheckBig,
    tone: "bg-emerald-50 text-emerald-600",
    href: "/giao-bai",
  },
  {
    title: "Ngân hàng đề",
    detail: "Quản lý câu hỏi và đề thi",
    icon: Database,
    tone: "bg-amber-50 text-amber-600",
    href: "/ngan-hang-de",
  },
  {
    title: "Tạo đề thi Word",
    detail: "Biên soạn đề thi tự động",
    icon: FileSpreadsheet,
    tone: "bg-green-50 text-green-700",
    href: "/giao-bai#de-thi-word",
  },
  {
    title: "Mô hình 3D",
    detail: "Khám phá hình học không gian",
    icon: Box,
    tone: "bg-indigo-50 text-indigo-600",
    action: "model",
  },
];

export const FEATURED_LESSONS = [
  {
    key: "11",
    title: "Bài 11. Hai đường thẳng song song",
    short: "Hai đường thẳng song song",
    thumb: "lines" as const,
    note: "Hoạt động theo tổ",
  },
  {
    key: "12",
    title: "Bài 12. Đường thẳng và mặt phẳng song song",
    short: "Đường thẳng và mặt phẳng song song",
    thumb: "plane" as const,
    note: "Mô hình 3D · 6 phần",
  },
  {
    key: "11.1",
    title: "Bài 11.1. Luyện tập hình lập phương",
    short: "Luyện tập hình lập phương",
    thumb: "cube" as const,
    note: "Từng học sinh",
  },
];
export const LESSON_TITLES: Record<string, string> = {
  "11": "Bài 11: Hai đường thẳng song song",
  "11.1": "Bài 11.1: Hai đường thẳng song song",
  "12": "Bài 12: Đường thẳng và mặt phẳng song song",
  "12.1": "Bài 12.1: Đường thẳng và mặt phẳng song song",
};

/** Public home page (signed-out visitors and students). */
export function HomeLanding({
  joinForm,
  focusJoin,
  onPreviewLesson,
}: {
  /** The class-code form students use to enter a live lesson. */
  joinForm: ReactNode;
  focusJoin: boolean;
  onPreviewLesson: (key: string, title: string) => void;
}) {
  const [help, setHelp] = useState(false);
  const joinRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusJoin) return;
    joinRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    joinRef.current?.querySelector("input")?.focus();
  }, [focusJoin]);
  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const openTool = (t: Tool) => {
    if (t.action === "model") onPreviewLesson("12", LESSON_TITLES["12"]!);
    else if (t.href) window.location.href = t.href.startsWith("/?") ? "/auth" : t.href;
  };

  return (
    <div className="site-page flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-8">
          <SiteLogo compact />
          <span className="hidden h-7 w-px bg-border xl:block" />
          <span className="hidden text-xs italic text-muted-foreground xl:block">{SLOGAN}</span>
          <nav
            className="ml-auto hidden items-center gap-1 text-sm md:flex"
            aria-label="Điều hướng chính"
          >
            <button
              type="button"
              className="flex items-center gap-1.5 border-b-2 border-primary px-3 py-5 font-semibold text-primary"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <Home size={15} />
              Trang chủ
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 px-3 py-5 text-foreground/80 hover:text-foreground">
                Công cụ
                <ChevronDown size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {TOOLS.map((t) => (
                  <DropdownMenuItem key={t.title} onClick={() => openTool(t)}>
                    <t.icon />
                    {t.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              className="px-3 py-5 text-foreground/80 hover:text-foreground"
              onClick={() => scrollTo("bai-giang")}
            >
              Bài giảng
            </button>
            <button
              type="button"
              className="px-3 py-5 text-foreground/80 hover:text-foreground"
              onClick={() => setHelp(true)}
            >
              Hướng dẫn
            </button>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-4">
            <Button variant="outline" size="sm" asChild className="rounded-lg">
              <a href="/auth?vai-tro=hoc-sinh">
                <UserRound />
                Đăng nhập
              </a>
            </Button>
            <Button size="sm" asChild className="hidden rounded-lg sm:inline-flex">
              <Link to="/auth">
                <MonitorCheck />
                Đăng nhập giáo viên
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="site-hero border-b">
        <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 py-10 md:grid-cols-[1.05fr_1fr] md:px-8 md:py-12">
          <div>
            <h1 className="site-title text-[44px] leading-none md:text-[60px]">LỚP HỌC SỐ</h1>
            <p className="mt-3 text-xl font-semibold italic text-[color:var(--site-blue)] md:text-[26px]">
              {SLOGAN}.
            </p>
            <p className="mt-4 max-w-md text-[15px] text-muted-foreground">
              Nền tảng giáo dục hiện đại, tích hợp đa dạng công cụ hỗ trợ dạy và học hiệu quả.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" className="rounded-full px-6" onClick={() => scrollTo("cong-cu")}>
                <Rocket />
                Khám phá công cụ
                <ArrowRight />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-primary/40 bg-card/60 px-6 text-primary"
                onClick={() => scrollTo("vao-lop")}
              >
                <Play />
                Bắt đầu sử dụng
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[560px]">
            <HeroArt variant="home" />
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8">
        <div id="cong-cu" className="mb-4 flex items-center justify-between">
          <h2 className="site-section-title text-lg uppercase tracking-wide">
            Hệ sinh thái công cụ
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <button
              key={t.title}
              type="button"
              className="site-card tool-tile"
              onClick={() => openTool(t)}
            >
              <span className={`tool-icon ${t.tone}`}>
                <t.icon size={22} />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm text-[color:var(--site-navy)]">{t.title}</strong>
                <small className="text-xs text-muted-foreground">{t.detail}</small>
              </span>
              <span className="tool-chevron">
                <ChevronRight size={16} />
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.55fr_1fr_0.8fr]">
          <section id="bai-giang" className="site-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="site-section-title">Bài giảng nổi bật</h2>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => onPreviewLesson("12", LESSON_TITLES["12"]!)}
              >
                Xem tất cả →
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {FEATURED_LESSONS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  className="overflow-hidden rounded-xl border text-left transition hover:border-primary/40"
                  onClick={() => onPreviewLesson(l.key, LESSON_TITLES[l.key]!)}
                >
                  <div className="lesson-thumb h-24">
                    <LessonThumb kind={l.thumb} className="h-20 w-32" />
                  </div>
                  <div className="p-3">
                    <p className="text-[13px] font-semibold leading-snug text-[color:var(--site-navy)]">
                      {l.title}
                    </p>
                    <p className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      {l.note}
                      <span className="tool-chevron h-6 w-6">
                        <ChevronRight size={13} />
                      </span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section id="vao-lop" ref={joinRef} className="site-card order-first scroll-mt-24 p-4 lg:order-none">
            <h2 className="mb-1 flex items-center gap-2 font-bold text-[color:var(--site-navy)]">
              <KeyRound size={17} className="text-amber-500" />
              Vào lớp bằng mã lớp
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Dùng khi thầy cô cho mã lớp trên màn hình chung.
            </p>
            {joinForm}
            <Button variant="ghost" size="sm" className="mt-2 w-full text-primary" asChild>
              <a href="/auth?vai-tro=hoc-sinh">
                <LogIn />
                Có tài khoản thi online? Đăng nhập
              </a>
            </Button>
          </section>

          <section className="relative overflow-hidden rounded-[14px] bg-[color:var(--site-blue)] p-5 text-white shadow-lg">
            <Lightbulb className="text-amber-300" size={30} />
            <p className="mt-3 text-lg font-bold leading-snug">
              Cùng khám phá thế giới tri thức với Lớp Học Số!
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4 rounded-full text-primary"
              asChild
            >
              <Link to="/auth">
                Bắt đầu ngay
                <ArrowRight />
              </Link>
            </Button>
            <svg
              viewBox="0 0 120 80"
              className="absolute -bottom-2 -right-3 w-32 opacity-25"
              aria-hidden
            >
              <path
                d="M10 60 Q35 45 60 58 L60 76 Q35 64 10 78Z M110 60 Q85 45 60 58 L60 76 Q85 64 110 78Z"
                fill="#fff"
              />
            </svg>
          </section>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-7xl justify-end px-4 pb-5 md:px-8">
        <AuthorCredit />
      </footer>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Hướng dẫn sử dụng</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-3 text-sm">
              <p>
                <b>Học sinh vào tiết học:</b> nhập mã lớp thầy cô chiếu trên màn hình ở ô{" "}
                <i>Vào lớp bằng mã lớp</i>, chọn tổ (hoặc ghi họ tên) rồi bấm <i>Vào lớp học</i>.
                Không cần tài khoản.
              </p>
              <p>
                <b>Học sinh thi online:</b> bấm <i>Đăng nhập</i>, chọn thẻ Học sinh và dùng tài
                khoản thầy cô đã phát.
              </p>
              <p>
                <b>Giáo viên:</b> bấm <i>Đăng nhập giáo viên</i>, đăng nhập bằng email hoặc Google
                để tạo lớp, soạn bài giảng và giao bài kiểm tra.
              </p>
            </div>
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </div>
  );
}
