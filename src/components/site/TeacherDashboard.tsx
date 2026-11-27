import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Hash,
  LayoutList,
  Play,
  Plus,
  Presentation,
  Radio,
  School,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { MEDIA_KEY_PATTERNS, isMediaKey } from "@/lib/slides/media-library";
import { Button } from "@/components/ui/button";
import { HeroArt } from "./brand";
import { TeacherShell, teacherName } from "./TeacherShell";
import { FEATURED_LESSONS, LESSON_TITLES } from "./HomeLanding";
import { LessonThumb } from "./thumbs";

type Room = Tables<"classrooms">;
type Lesson = { key: string; title: string; content: unknown; at: string | null; builtIn: boolean };

const dateLine = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  weekday: "long",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
function longDate(d: Date): string {
  const parts = dateLine.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ngày ${get("day")} tháng ${get("month")} năm ${get("year")}`;
}
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins || 1} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} ngày trước` : shortDate.format(new Date(iso));
}
const MODE_LABEL: Record<string, string> = {
  default: "Thông thường",
  lecture: "Bài giảng",
  presentation: "Trình chiếu",
};

/** Teacher home ("Tổng quan") shown after signing in. */
export function TeacherDashboard({
  user,
  rooms,
  onOpenLesson,
  onOpenRoom,
  onCreateClass,
  onOpenLessons,
}: {
  user: User;
  rooms: Room[];
  onOpenLesson: (key: string, title: string, content: unknown) => void;
  onOpenRoom: (room: Room) => void;
  onCreateClass: () => void;
  onOpenLessons: () => void;
}) {
  const [custom, setCustom] = useState<Tables<"lessons">[]>([]);
  const [examClasses, setExamClasses] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let stop = false;
    void supabase
      .from("lessons")
      .select()
      .not("lesson_key", "like", MEDIA_KEY_PATTERNS[0] as string)
      .not("lesson_key", "like", MEDIA_KEY_PATTERNS[1] as string)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!stop && data)
          setCustom(
            data.filter((l) => !isMediaKey(l.lesson_key) && !(l.lesson_key in LESSON_TITLES)),
          );
      });
    void supabase
      .from("exam_classes")
      .select("id", { count: "exact", head: true })
      .eq("archived", false)
      .then(({ count }) => {
        if (!stop) setExamClasses(count ?? 0);
      });
    return () => {
      stop = true;
    };
  }, [user.id]);

  const lessons: Lesson[] = useMemo(
    () => [
      ...custom.map((l) => ({
        key: l.lesson_key,
        title: l.title,
        content: l.content,
        at: l.created_at,
        builtIn: false,
      })),
      ...FEATURED_LESSONS.map((l) => ({
        key: l.key,
        title: l.title,
        content: {},
        at: null,
        builtIn: true,
      })),
      {
        key: "12.1",
        title: "Bài 12.1. Luyện tập 3 · AI NHANH HƠN",
        content: {},
        at: null,
        builtIn: true,
      },
    ],
    [custom],
  );
  const q = query.trim().toLowerCase();
  const shownLessons = (
    q ? lessons.filter((l) => l.title.toLowerCase().includes(q)) : lessons
  ).slice(0, q ? 8 : 4);
  const openRooms = rooms.filter((r) => !r.closed);
  const shownRooms = (
    q
      ? rooms.filter((r) => `${r.title} ${r.code} ${r.lesson_title}`.toLowerCase().includes(q))
      : openRooms
  ).slice(0, 3);
  const activity = useMemo(
    () =>
      [
        ...rooms.map((r) => ({
          at: r.created_at,
          icon: Users,
          tone: "text-violet-600",
          text: `Tạo lớp học: ${r.title} · mã ${r.code}`,
        })),
        ...custom.map((l) => ({
          at: l.created_at,
          icon: Presentation,
          tone: "text-blue-600",
          text: `Soạn bài giảng: ${l.title}`,
        })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 5),
    [rooms, custom],
  );
  const name = teacherName(user);

  const quick = [
    {
      title: "Tạo lớp học",
      detail: "Bắt đầu lớp học mới",
      icon: Plus,
      tone: "bg-blue-600 text-white",
      onClick: onCreateClass,
    },
    {
      title: "Soạn bài giảng",
      detail: "Thiết kế bài giảng tương tác",
      icon: Play,
      tone: "bg-violet-600 text-white",
      to: "/soan-bai" as const,
    },
    {
      title: "Tạo bài kiểm tra",
      detail: "Giao bài và đánh giá",
      icon: ClipboardCheck,
      tone: "bg-emerald-50 text-emerald-600 border border-emerald-200",
      to: "/giao-bai" as const,
    },
    {
      title: "Tạo đề thi Word",
      detail: "Biên soạn đề thi tự động",
      icon: FileText,
      tone: "bg-amber-50 text-amber-600 border border-amber-200",
      to: "/giao-bai" as const,
      hash: "de-thi-word",
    },
  ];

  return (
    <TeacherShell
      current="overview"
      actions={{ lessons: onOpenLessons, classes: onOpenLessons }}
      search={{ value: query, onChange: setQuery, placeholder: "Tìm kiếm bài giảng, lớp học…" }}
    >
      <div className="mx-auto grid max-w-[1180px] gap-5">
        <section className="site-hero site-card relative grid items-center gap-4 overflow-hidden px-6 py-4 md:grid-cols-[1fr_320px]">
          <div>
            <h1 className="site-title text-2xl md:text-[28px]">Chào mừng trở lại, {name}! 👋</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Cùng khám phá các công cụ hữu ích để tạo nên những giờ học hiệu quả hơn!
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-[color:var(--site-navy)]">
              <CalendarDays size={16} className="text-primary" />
              {longDate(new Date())}
            </p>
          </div>
          <div className="hidden md:block">
            <HeroArt variant="teacher" />
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quick.map((item) => {
            const inner = (
              <>
                <span className={`tool-icon h-10 w-10 rounded-full ${item.tone}`}>
                  <item.icon size={19} />
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm text-[color:var(--site-navy)]">
                    {item.title}
                  </strong>
                  <small className="text-xs text-muted-foreground">{item.detail}</small>
                </span>
                <ChevronRight size={18} className="ml-auto text-muted-foreground" />
              </>
            );
            return item.onClick ? (
              <button
                key={item.title}
                type="button"
                className="site-card tool-tile"
                onClick={item.onClick}
              >
                {inner}
              </button>
            ) : (
              <Link
                key={item.title}
                to={item.to}
                {...(item.hash ? { hash: item.hash } : {})}
                className="site-card tool-tile"
              >
                {inner}
              </Link>
            );
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section className="site-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-[color:var(--site-navy)]">
                <BookOpen size={18} className="text-primary" />
                {q ? "Bài giảng tìm thấy" : "Bài giảng gần đây"}
              </h2>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={onOpenLessons}
              >
                Xem tất cả →
              </button>
            </div>
            {shownLessons.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Không có bài giảng phù hợp.
              </p>
            )}
            <ul className="divide-y">
              {shownLessons.map((l) => (
                <li key={l.key} className="flex items-center gap-3 py-2.5">
                  <span className="lesson-thumb h-12 w-[84px] shrink-0 rounded-lg">
                    <LessonThumb
                      kind={
                        l.builtIn
                          ? (FEATURED_LESSONS.find((f) => f.key === l.key)?.thumb ?? "pyramid")
                          : "pyramid"
                      }
                      className="h-10 w-16"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[color:var(--site-navy)]">
                      {l.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Lớp 11 ·{" "}
                      {l.builtIn
                        ? "Bài học có sẵn"
                        : `Cập nhật: ${shortDate.format(new Date(l.at!))}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-primary/40 text-xs text-primary"
                    onClick={() => onOpenLesson(l.key, LESSON_TITLES[l.key] ?? l.title, l.content)}
                  >
                    <Play />
                    Mở bài giảng
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className="site-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-[color:var(--site-navy)]">
                <Radio size={18} className="text-primary" />
                Lớp học đang hoạt động
              </h2>
              {openRooms.length > 0 && (
                <span className="status-pill bg-emerald-50 text-emerald-700">
                  Đang diễn ra · {openRooms.length}
                </span>
              )}
            </div>
            {shownRooms.length === 0 ? (
              <div className="grid place-items-center gap-3 rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                Chưa có lớp nào đang mở.
                <Button size="sm" onClick={onCreateClass}>
                  <Plus />
                  Tạo lớp học
                </Button>
              </div>
            ) : (
              <ul className="grid gap-3">
                {shownRooms.map((r, i) => (
                  <li
                    key={r.id}
                    className={`flex gap-4 rounded-xl border p-3 ${i === 0 ? "bg-[color:var(--site-wash)]" : ""}`}
                  >
                    {i === 0 && (
                      <span className="lesson-thumb hidden h-24 w-28 shrink-0 rounded-lg sm:grid">
                        <LessonThumb
                          kind={r.lesson_key.startsWith("11") ? "cube" : "plane"}
                          className="h-16 w-24"
                        />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[color:var(--site-navy)]">{r.title}</p>
                      <p className="truncate text-[13px] text-muted-foreground">{r.lesson_title}</p>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Hash size={13} className="text-primary" />
                          Mã lớp <b className="font-mono text-foreground">{r.code}</b>
                        </span>
                        <span className="flex items-center gap-1">
                          <LayoutList size={13} className="text-primary" />
                          {MODE_LABEL[r.lesson_mode] ?? r.lesson_mode}
                        </span>
                      </p>
                    </div>
                    <Button size="sm" className="self-end rounded-lg" onClick={() => onOpenRoom(r)}>
                      Điều khiển lớp
                      <ArrowRight />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section className="site-card p-4">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-[color:var(--site-navy)]">
              <School size={18} className="text-primary" />
              Thống kê nhanh
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Lớp học đã tạo",
                  value: rooms.length,
                  icon: Users,
                  tone: "text-violet-600 bg-violet-50",
                },
                {
                  label: "Đang mở",
                  value: openRooms.length,
                  icon: Radio,
                  tone: "text-emerald-600 bg-emerald-50",
                },
                {
                  label: "Bài giảng tự soạn",
                  value: custom.length,
                  icon: Presentation,
                  tone: "text-blue-600 bg-blue-50",
                },
                {
                  label: "Lớp thi online",
                  value: examClasses,
                  icon: GraduationCap,
                  tone: "text-amber-600 bg-amber-50",
                },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border p-3 text-center">
                  <span
                    className={`mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full ${s.tone}`}
                  >
                    <s.icon size={17} />
                  </span>
                  <p className="text-2xl font-bold text-[color:var(--site-navy)]">
                    {s.value ?? "–"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="site-card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-[color:var(--site-navy)]">
              <CalendarDays size={18} className="text-primary" />
              Hoạt động gần đây
            </h2>
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Chưa có hoạt động nào.
              </p>
            ) : (
              <ul className="grid gap-2.5">
                {activity.map((a, i) => (
                  <li key={i} className="flex items-center gap-3 text-[13px]">
                    <a.icon size={16} className={a.tone} />
                    <span className="min-w-0 flex-1 truncate">{a.text}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{ago(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </TeacherShell>
  );
}
