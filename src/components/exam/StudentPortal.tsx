import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Home,
  KeyRound,
  LogOut,
  Settings,
  SquareCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  studentChangePassword,
  studentLogin,
  studentLogout,
  studentProfile,
  type StudentProfile,
} from "@/lib/exam/student.functions";
import { displayDate } from "@/lib/exam/roster";
import { AssignedList, ExamFlow } from "./StudentExam";
import {
  myAssignments,
  myHistory,
  myNotices,
  readNotices,
  type MyAssignment,
} from "@/lib/exam/attempt.functions";
import type { HistoryEntry } from "@/lib/exam/review.server";
import { formatPoints } from "@/lib/exam/matrix";
import { readStudentToken, writeStudentToken } from "@/lib/exam/student-token";
import { LoginScreen } from "@/components/site/LoginScreen";
import { AuthorCredit, SiteLogo } from "@/components/site/brand";
import { HistoryList } from "./StudentHistory";
import { LessonList } from "./StudentLessons";
import type { Notice } from "@/lib/exam/retakes.server";
import { passwordProblem } from "@/lib/exam/accounts";

const readToken = readStudentToken;
const writeToken = writeStudentToken;

function message(e: unknown): string {
  const text = e instanceof Error ? e.message : "";
  if (text === "SESSION_EXPIRED") return "Phiên đăng nhập đã hết, hãy đăng nhập lại.";
  if (text === "ACCOUNT_LOCKED") return "Tài khoản đang bị khóa. Hãy liên hệ giáo viên.";
  return text || "Có lỗi, hãy thử lại";
}

export function StudentPortal() {
  const login = useServerFn(studentLogin);
  const logout = useServerFn(studentLogout);
  const loadProfile = useServerFn(studentProfile);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [openAssignment, setOpenAssignment] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const loadNotices = useServerFn(myNotices);
  const markRead = useServerFn(readNotices);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [noticesSeen, setNoticesSeen] = useState(0);
  const [tab, setTab] = useState("home");
  const [lessonToOpen, setLessonToOpen] = useState<string | null>(null);

  const signOut = useCallback((why = "") => {
    writeToken("");
    setToken("");
    setProfile(null);
    setNotice(why);
  }, []);

  useEffect(() => {
    const saved = readToken();
    setToken(saved);
    if (!saved) return;
    loadProfile({ data: { token: saved } })
      .then(setProfile)
      .catch((e) => signOut(message(e)));
  }, [loadProfile, signOut]);

  // notices refresh every minute while the portal is open
  const signedIn = !!token && !!profile && !openAssignment;
  useEffect(() => {
    if (!signedIn || !token) return;
    let stop = false;
    const load = () =>
      loadNotices({ data: { token } })
        .then((r) => !stop && setNotices(r.notices))
        .catch(() => undefined);
    void load();
    const t = window.setInterval(load, 60_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [signedIn, token, loadNotices]);
  // opening the tab marks the stored notices as read (reminders stay until acted on)
  useEffect(() => {
    if (!noticesSeen || !token) return;
    void markRead({ data: { token } })
      .then(() =>
        setNotices((list) =>
          list ? list.map((n) => (n.kind === "closing_soon" ? n : { ...n, read: true })) : list,
        ),
      )
      .catch(() => undefined);
  }, [noticesSeen, token, markRead]);
  const unread = (notices ?? []).filter((n) => !n.read).length;

  if (token === null || (token && !profile))
    return <p className="p-6 text-muted-foreground">Đang tải…</p>;

  if (!token || !profile) {
    return (
      <LoginScreen
        initialRole="student"
        notice={notice}
        onStudentLogin={async (username, password) => {
          const r = await login({ data: { username, password } });
          writeToken(r.token);
          setToken(r.token);
          setProfile(r.profile);
          setNotice("");
        }}
      />
    );
  }

  if (openAssignment)
    return (
      <div className="site-page px-4 py-4">
        <ExamFlow
          token={token}
          assignmentId={openAssignment}
          studentName={profile.fullName}
          studentUsername={profile.username}
          onExit={() => setOpenAssignment(null)}
        />
      </div>
    );

  const pick = (v: string) => {
    setTab(v);
    if (v === "notices") setNoticesSeen((n) => n + 1);
  };
  const doLogout = () => {
    void logout({ data: { token } }).catch(() => undefined);
    signOut();
  };
  const nav = [
    { key: "home", label: "Lớp học của tôi", icon: Home, badge: 0 },
    { key: "assigned", label: "Bài thi", icon: SquareCheck, badge: 0 },
    { key: "history", label: "Kết quả học tập", icon: BarChart3, badge: 0 },
    { key: "notices", label: "Thông báo", icon: Bell, badge: unread },
    { key: "me", label: "Cài đặt", icon: Settings, badge: 0 },
  ];
  const current = nav.find((n) => n.key === tab) ?? nav[0]!;

  return (
    <div className="site-page md:grid md:grid-cols-[220px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-card/80 px-4 py-5 backdrop-blur md:flex">
        <SiteLogo compact className="px-1" />
        <div className="mt-5 flex items-center gap-3 rounded-xl border bg-[color:var(--site-wash)] p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {initials(profile.fullName)}
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-[13px] text-[color:var(--site-navy)]">
              {profile.fullName}
            </strong>
            <small className="text-[11px] text-muted-foreground">
              {profile.className ? `Lớp ${profile.className}` : profile.username}
            </small>
          </span>
        </div>
        <nav className="mt-4 grid gap-1" aria-label="Học sinh">
          {nav.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`side-nav-link ${tab === n.key ? "active" : ""}`}
              onClick={() => pick(n.key)}
            >
              <n.icon />
              {n.label}
              {n.badge > 0 && (
                <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">
                  {n.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
        <Button variant="outline" size="sm" className="mt-auto" onClick={doLogout}>
          <LogOut />
          Đăng xuất
        </Button>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <span className="md:hidden">
              <SiteLogo compact />
            </span>
            <h1 className="hidden font-semibold text-[color:var(--site-navy)] md:block">
              {current.label}
            </h1>
            <span className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <CalendarDays size={14} />
              {todayLabel()}
            </span>
            <button
              type="button"
              className="relative rounded-full p-2 hover:bg-muted"
              aria-label="Thông báo"
              onClick={() => pick("notices")}
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={doLogout}
              aria-label="Đăng xuất"
            >
              <LogOut />
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Học sinh">
            {nav.map((n) => (
              <button
                key={n.key}
                type="button"
                onClick={() => pick(n.key)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${tab === n.key ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {n.label}
                {n.badge > 0 ? ` (${n.badge})` : ""}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-5 md:px-6">
          {tab === "home" && (
            <Overview
              token={token}
              profile={profile}
              notices={notices}
              lessonToOpen={lessonToOpen}
              onOpenLesson={setLessonToOpen}
              onOpenExam={setOpenAssignment}
              onShowAll={pick}
            />
          )}
          {tab === "assigned" && <AssignedList token={token} onOpen={setOpenAssignment} />}
          {tab === "history" && <HistoryList token={token} />}
          {tab === "notices" && (
            <NoticeList
              notices={notices}
              onOpen={setOpenAssignment}
              onOpenLesson={(id) => {
                setLessonToOpen(id);
                setTab("home");
              }}
            />
          )}
          {tab === "me" && (
            <ProfileTab profile={profile} token={token} onExpired={(why) => signOut(why)} />
          )}
        </main>
        <footer className="flex justify-end px-6 pb-4">
          <AuthorCredit />
        </footer>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "HS";
  const last = words[words.length - 1]!;
  const before = words.length > 1 ? words[words.length - 2]! : "";
  return `${before.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
function firstName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? words.slice(-2).join(" ") : (words[0] ?? "");
}
function todayLabel(): string {
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const w = get("weekday");
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${get("day")}/${get("month")}/${get("year")}`;
}
const hourMinute = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
});
const dayMonth = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
});
function closesLabel(iso: string): string {
  const d = new Date(iso);
  const same = dayMonth.format(d) === dayMonth.format(new Date());
  return `${hourMinute.format(d)} ${same ? "hôm nay" : dayMonth.format(d)}`;
}

function Overview({
  token,
  profile,
  notices,
  lessonToOpen,
  onOpenLesson,
  onOpenExam,
  onShowAll,
}: {
  token: string;
  profile: StudentProfile;
  notices: Notice[] | null;
  lessonToOpen: string | null;
  onOpenLesson: (id: string | null) => void;
  onOpenExam: (id: string) => void;
  onShowAll: (tab: string) => void;
}) {
  const loadAssignments = useServerFn(myAssignments);
  const loadHistory = useServerFn(myHistory);
  const [rows, setRows] = useState<MyAssignment[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => {
    let stop = false;
    const load = () =>
      loadAssignments({ data: { token } })
        .then((r) => !stop && setRows(r.assignments))
        .catch(() => !stop && setRows([]));
    void load();
    void loadHistory({ data: { token } })
      .then((r) => !stop && setHistory(r.history))
      .catch(() => !stop && setHistory([]));
    const t = window.setInterval(load, 30_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [token, loadAssignments, loadHistory]);
  const now = Date.now();
  const openNow = (rows ?? []).filter(
    (a) =>
      a.inProgressId ||
      (new Date(a.opensAt).getTime() <= now && new Date(a.closesAt).getTime() > now && a.canStart),
  );
  const upcoming = (rows ?? []).filter((a) => new Date(a.opensAt).getTime() > now);
  const featured = openNow[0] ?? upcoming[0] ?? null;
  const featuredOpen = featured ? openNow.includes(featured) : false;
  const recentNotices = (notices ?? []).slice(0, 3);

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="site-title text-2xl">Chào {firstName(profile.fullName)}!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hôm nay em có <b className="text-primary">{openNow.length} bài thi đang mở</b>
          {upcoming.length > 0 && (
            <>
              {" "}
              và <b className="text-primary">{upcoming.length} bài sắp mở</b>
            </>
          )}
          .
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="relative overflow-hidden rounded-[14px] bg-[color:var(--site-blue)] p-5 text-white shadow-lg">
          <svg
            viewBox="0 0 200 80"
            className="pointer-events-none absolute bottom-3 right-4 w-44 opacity-40"
            aria-hidden
          >
            <line
              x1="20"
              y1="12"
              x2="190"
              y2="12"
              stroke="oklch(0.8 0.15 60)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <polygon
              points="40,40 196,40 170,74 14,74"
              fill="none"
              stroke="#fff"
              strokeWidth="1.5"
            />
            <line
              x1="40"
              y1="57"
              x2="170"
              y2="57"
              stroke="#fff"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          </svg>
          {rows === null ? (
            <p className="text-sm opacity-80">Đang tải bài thi…</p>
          ) : featured ? (
            <>
              <span className="status-pill bg-white/20 text-[10px] uppercase tracking-wide text-white">
                ●{" "}
                {featured.inProgressId
                  ? "Đang làm dở"
                  : featuredOpen
                    ? "Bài thi đang mở"
                    : "Bài thi sắp mở"}
              </span>
              <h3 className="mt-3 text-xl font-bold">{featured.title}</h3>
              <p className="text-xs opacity-80">
                {[
                  profile.teacherName && `GV: ${profile.teacherName}`,
                  profile.className && `Lớp ${profile.className}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <dl className="mt-4 grid max-w-md grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                {[
                  ["Thời gian", `${featured.durationMinutes} phút`],
                  ["Số câu", `${featured.questionCount} câu`],
                  ["Lượt đã làm", `${featured.attemptsUsed} / ${featured.maxAttempts}`],
                  [
                    featuredOpen ? "Đóng lúc" : "Mở lúc",
                    closesLabel(featuredOpen ? featured.closesAt : featured.opensAt),
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="opacity-75">{k}</dt>
                    <dd className="text-sm font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  className="rounded-lg font-semibold text-primary"
                  onClick={() => onOpenExam(featured.id)}
                >
                  {featured.inProgressId
                    ? "Làm tiếp"
                    : featuredOpen
                      ? "Vào làm bài"
                      : "Xem bài thi"}
                  <ArrowRight />
                </Button>
                <span className="text-[11px] opacity-80">
                  Đồng hồ bắt đầu khi em bấm Vào làm bài
                </span>
              </div>
            </>
          ) : (
            <>
              <span className="status-pill bg-white/20 text-[10px] uppercase tracking-wide text-white">
                Bài thi
              </span>
              <h3 className="mt-3 text-xl font-bold">Chưa có bài thi đang mở</h3>
              <p className="mt-1 max-w-sm text-sm opacity-85">
                Khi thầy cô giao bài, bài thi sẽ hiện ở đây.
              </p>
            </>
          )}
        </section>

        <section className="site-card p-4">
          <h3 className="flex items-center gap-2 font-bold text-[color:var(--site-navy)]">
            <KeyRound size={17} className="text-amber-500" />
            Vào lớp bằng mã lớp
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Dùng khi thầy cô cho mã lớp trên màn hình chung
          </p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const c = code.trim().toUpperCase();
              if (c) window.location.href = `/?code=${encodeURIComponent(c)}&vao=ma-lop`;
            }}
          >
            <Input
              aria-label="Mã lớp"
              className="code-input h-11"
              placeholder="MÃ LỚP"
              minLength={4}
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button className="h-11 rounded-lg">
              Vào lớp
              <ArrowRight />
            </Button>
          </form>
          {recentNotices.length > 0 && (
            <ul className="mt-4 grid gap-2 border-t pt-3">
              {recentNotices.map((n) => (
                <li key={n.id} className="flex items-start gap-2 text-xs">
                  <Bell size={14} className="mt-0.5 shrink-0 text-primary" />
                  <span className={n.read ? "text-muted-foreground" : "font-medium"}>
                    {!n.read && <b>Thông báo mới: </b>}
                    {n.body}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className={`grid gap-5 ${lessonToOpen ? "" : "lg:grid-cols-[1.5fr_1fr]"}`}>
        <section className="site-card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-[color:var(--site-navy)]">
            <BookOpen size={18} className="text-primary" />
            Bài học của lớp {profile.className}
          </h3>
          <LessonList token={token} openId={lessonToOpen} onOpen={onOpenLesson} />
        </section>
        {!lessonToOpen && (
          <section className="site-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-[color:var(--site-navy)]">
                <BarChart3 size={18} className="text-primary" />
                Kết quả gần đây
              </h3>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => onShowAll("history")}
              >
                Xem tất cả →
              </button>
            </div>
            {history === null ? (
              <p className="text-sm text-muted-foreground">Đang tải…</p>
            ) : history.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Em chưa làm bài thi nào.
              </p>
            ) : (
              <ul className="divide-y">
                {history.slice(0, 4).map((h) => (
                  <li key={h.attemptId} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <strong className="block truncate text-[13px] text-[color:var(--site-navy)]">
                        {h.title}
                      </strong>
                      <small className="text-[11px] text-muted-foreground">
                        {dayMonth.format(new Date(h.finishedAt ?? h.startedAt))}
                      </small>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-emerald-600">
                      {h.score !== null ? `${formatPoints(h.score)}/${h.scale} điểm` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

const NOTICE_TONE: Record<Notice["kind"], string> = {
  new_assignment: "border-l-blue-500",
  retake_granted: "border-l-green-600",
  retake_revoked: "border-l-muted-foreground",
  new_lesson: "border-l-violet-500",
  closing_soon: "border-l-amber-500",
};
const noticeTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});

function NoticeList({
  notices,
  onOpen,
  onOpenLesson,
}: {
  notices: Notice[] | null;
  onOpen: (assignmentId: string) => void;
  onOpenLesson: (lessonId: string) => void;
}) {
  if (notices === null) return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  if (!notices.length) return <Empty text="Không có thông báo mới." />;
  return (
    <ul className="grid gap-2">
      {notices.map((n) => (
        <li
          key={n.id}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-l-4 bg-card p-3 ${NOTICE_TONE[n.kind]}`}
        >
          <div>
            <p className={n.read ? "" : "font-medium"}>{n.body}</p>
            {n.kind !== "closing_soon" && (
              <p className="text-xs text-muted-foreground">{noticeTime.format(new Date(n.at))}</p>
            )}
          </div>
          {n.assignmentId && n.kind !== "retake_revoked" && (
            <Button size="sm" variant="outline" onClick={() => onOpen(n.assignmentId!)}>
              Mở bài
            </Button>
          )}
          {n.lessonId && (
            <Button size="sm" variant="outline" onClick={() => onOpenLesson(n.lessonId!)}>
              Mở bài giảng
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function ProfileTab({
  profile,
  token,
  onExpired,
}: {
  profile: StudentProfile;
  token: string;
  onExpired: (why: string) => void;
}) {
  const change = useServerFn(studentChangePassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const rows: [string, string][] = [
    ["Họ và tên", profile.fullName],
    ["Ngày sinh", displayDate(profile.birthDate)],
    ["Mã học sinh", profile.studentCode ?? ""],
    ["Lớp", profile.className],
    ["Năm học", profile.schoolYear],
    ["Môn", profile.subject],
    ["Giáo viên", profile.teacherName],
    ["Tên đăng nhập", profile.username],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-semibold">Thông tin</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={k === "Tên đăng nhập" ? "font-mono" : ""}>{v}</dd>
              </div>
            ))}
        </dl>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-semibold">Đổi mật khẩu</h2>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const problem =
              passwordProblem(next) ??
              (next !== again ? "Hai lần nhập mật khẩu mới không khớp" : null);
            if (problem) {
              setStatus({ ok: false, text: problem });
              return;
            }
            setBusy(true);
            setStatus(null);
            change({ data: { token, current, next } })
              .then(() => {
                setStatus({
                  ok: true,
                  text: "Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.",
                });
                setCurrent("");
                setNext("");
                setAgain("");
              })
              .catch((err) => {
                const text = message(err);
                if (
                  err instanceof Error &&
                  (err.message === "SESSION_EXPIRED" || err.message === "ACCOUNT_LOCKED")
                )
                  onExpired(text);
                else setStatus({ ok: false, text });
              })
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Mật khẩu hiện tại
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            Mật khẩu mới (ít nhất 6 ký tự)
            <Input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <label>
            Nhập lại mật khẩu mới
            <Input
              type="password"
              required
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </label>
          {status && (
            <p className={status.ok ? "text-sm text-green-700" : "error-note"} role="status">
              {status.text}
            </p>
          )}
          <Button disabled={busy}>{busy ? "Đang đổi…" : "Đổi mật khẩu"}</Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Không bắt buộc đổi. Giáo viên xem được mật khẩu của em; nếu quên, nhờ giáo viên xem lại
          hoặc đặt lại về mật khẩu mặc định của lớp.
        </p>
      </div>
    </div>
  );
}
