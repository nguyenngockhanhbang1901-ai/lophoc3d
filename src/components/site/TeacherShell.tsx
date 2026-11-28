import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import {
  Award,
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  ChevronDown,
  Contact,
  LayoutDashboard,
  LineChart,
  ClipboardCheck,
  Database,
  FileBarChart,
  FileText,
  GraduationCap,
  Grid2x2,
  Home,
  LogOut,
  Menu,
  MessagesSquare,
  MonitorPlay,
  NotebookPen,
  PenLine,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeacher } from "@/components/slides/use-teacher";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AuthorCredit, SiteLogo } from "./brand";

export type TeacherNavKey =
  | "overview"
  | "lessons"
  | "classes"
  | "compose"
  | "exams"
  | "bank"
  | "matrix"
  | "word"
  | "accounts"
  | "stats"
  | "gradebook"
  | "hr-overview"
  | "hr-profiles"
  | "hr-attendance"
  | "hr-stats"
  | "hr-merit"
  | "hr-grades"
  | "hr-parents"
  | "hr-reports";

type Item = { key: TeacherNavKey; label: string; icon: typeof Home; href: string };
const GROUPS: { title?: string; items: Item[] }[] = [
  { items: [{ key: "overview", label: "Tổng quan", icon: Home, href: "/" }] },
  {
    title: "Giảng dạy",
    items: [
      { key: "lessons", label: "Bài giảng", icon: MonitorPlay, href: "/?vao=bai-giang" },
      { key: "classes", label: "Lớp học", icon: Users, href: "/?vao=lop-hoc" },
      { key: "compose", label: "Soạn bài giảng", icon: PenLine, href: "/soan-bai" },
    ],
  },
  {
    title: "Kiểm tra – Đánh giá",
    items: [
      { key: "exams", label: "Thi trực tuyến", icon: ClipboardCheck, href: "/giao-bai" },
      { key: "bank", label: "Ngân hàng đề", icon: Database, href: "/ngan-hang-de" },
      { key: "matrix", label: "Ma trận đề", icon: Grid2x2, href: "/ma-tran-de" },
      { key: "word", label: "Tạo đề thi Word", icon: FileText, href: "/giao-bai#de-thi-word" },
      { key: "gradebook", label: "Sổ điểm cá nhân", icon: NotebookPen, href: "/so-diem" },
    ],
  },
  {
    title: "Chủ nhiệm",
    items: [
      { key: "hr-overview", label: "Lớp chủ nhiệm", icon: LayoutDashboard, href: "/chu-nhiem" },
      { key: "hr-profiles", label: "Hồ sơ học sinh", icon: Contact, href: "/chu-nhiem/ho-so" },
      {
        key: "hr-attendance",
        label: "Điểm danh",
        icon: CalendarCheck,
        href: "/chu-nhiem/diem-danh",
      },
      { key: "hr-stats", label: "Chuyên cần", icon: LineChart, href: "/chu-nhiem/chuyen-can" },
      { key: "hr-merit", label: "Thi đua – Khen thưởng", icon: Award, href: "/chu-nhiem/thi-dua" },
      {
        key: "hr-grades",
        label: "Điểm & đánh giá",
        icon: GraduationCap,
        href: "/chu-nhiem/danh-gia",
      },
      { key: "hr-parents", label: "Phụ huynh", icon: MessagesSquare, href: "/chu-nhiem/phu-huynh" },
      { key: "hr-reports", label: "Báo cáo", icon: FileBarChart, href: "/chu-nhiem/bao-cao" },
    ],
  },
  {
    title: "Quản lý",
    items: [
      { key: "accounts", label: "Tài khoản học sinh", icon: BookOpenCheck, href: "/lop-thi" },
      { key: "stats", label: "Thống kê", icon: BarChart3, href: "/giao-bai" },
    ],
  },
];

export function teacherName(user: User | null | undefined): string {
  if (!user) return "";
  const meta = user.user_metadata ?? {};
  const name = (meta["full_name"] || meta["name"] || "") as string;
  return name.trim() || (user.email ?? "").split("@")[0] || "Giáo viên";
}

function SideNav({
  current,
  actions,
  onPick,
}: {
  current: TeacherNavKey;
  actions?: Partial<Record<TeacherNavKey, () => void>> | undefined;
  onPick?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-2 pt-5">
        <SiteLogo />
      </div>
      <nav className="flex-1 overflow-y-auto px-4 pb-4" aria-label="Điều hướng giáo viên">
        {GROUPS.map((g, gi) => (
          <div key={gi}>
            {g.title ? <p className="side-nav-group">{g.title}</p> : <div className="h-3" />}
            {g.items.map((it) => {
              const Icon = it.icon;
              const cls = `side-nav-link ${current === it.key ? "active" : ""}`;
              const action = actions?.[it.key];
              const body = (
                <>
                  <Icon />
                  {it.label}
                </>
              );
              return action ? (
                <button
                  key={it.key}
                  type="button"
                  className={cls}
                  onClick={() => {
                    onPick?.();
                    action();
                  }}
                >
                  {body}
                </button>
              ) : it.href.includes("?") ? (
                <a key={it.key} href={it.href} className={cls}>
                  {body}
                </a>
              ) : (
                <Link
                  key={it.key}
                  to={it.href.split("#")[0] as "/"}
                  {...(it.href.includes("#") ? { hash: it.href.split("#")[1]! } : {})}
                  className={cls}
                  onClick={onPick}
                  aria-current={current === it.key ? "page" : undefined}
                >
                  {body}
                </Link>
              );
            })}
          </div>
        ))}
        <p className="side-nav-group">Cá nhân</p>
        <button
          type="button"
          className="side-nav-link"
          onClick={() => {
            void (async () => {
              await queryClient.cancelQueries();
              queryClient.clear();
              await supabase.auth.signOut();
              await navigate({ to: "/auth", replace: true });
            })();
          }}
        >
          <LogOut />
          Đăng xuất
        </button>
      </nav>
      <div className="mx-4 mb-5 flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span>
          Phiên bản v1.0.0
          <br />
          <span className="font-medium text-emerald-700">Đang hoạt động</span>
        </span>
      </div>
    </div>
  );
}

/** Sidebar layout for every signed-in teacher page (Lớp Học Số style). */
export function TeacherShell({
  current,
  children,
  actions,
  search,
  title,
}: {
  current: TeacherNavKey;
  children: ReactNode;
  title?: string;
  /** Replace a sidebar link with an in-page action (used on the dashboard itself). */
  actions?: Partial<Record<TeacherNavKey, () => void>>;
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
}) {
  const user = useTeacher();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const name = teacherName(user);
  const avatar = (user?.user_metadata?.["avatar_url"] || user?.user_metadata?.["picture"]) as
    string | undefined;
  return (
    <div className="site-page lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r bg-card/80 backdrop-blur lg:block">
        <SideNav current={current} actions={actions} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[260px] p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SideNav current={current} actions={actions} onPick={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur md:px-6">
          <button
            type="button"
            className="rounded-md p-2 hover:bg-muted lg:hidden"
            aria-label="Mở menu"
            onClick={() => setOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="lg:hidden">
            <SiteLogo compact />
          </div>
          {search ? (
            <label className="relative mx-auto hidden w-full max-w-md md:block">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? "Tìm kiếm bài giảng, lớp học…"}
                className="h-10 w-full rounded-full border bg-background pl-9 pr-4 text-sm outline-none focus:border-primary"
              />
            </label>
          ) : (
            <div className="flex-1" />
          )}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-auto flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm hover:bg-muted">
                {avatar ? (
                  <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                    <UserRound size={16} />
                  </span>
                )}
                <span className="hidden max-w-[180px] truncate font-medium sm:inline">{name}</span>
                <ChevronDown size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <div className="truncate">{name}</div>
                  <div className="truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    void supabase.auth
                      .signOut()
                      .then(() => navigate({ to: "/auth", replace: true }));
                  }}
                >
                  <LogOut />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        <main className="flex-1 px-4 py-5 md:px-6">
          {title && <h1 className="site-title mb-4 text-xl md:text-2xl">{title}</h1>}
          {children}
        </main>
        <footer className="flex justify-end px-6 pb-4">
          <AuthorCredit />
        </footer>
      </div>
    </div>
  );
}
