// Tổng quan lớp chủ nhiệm: class size, today's attendance and "việc cần làm hôm nay".
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarCheck,
  CheckCircle2,
  Contact,
  LineChart,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { attendanceData, type AttendanceData } from "@/lib/homeroom/homeroom.functions";
import {
  classBooks,
  listIncidents,
  listParentContacts,
  weeklyData,
  type ParentContact,
} from "@/lib/homeroom/records.functions";
import { learningAlerts, type LearningAlert } from "@/lib/homeroom/evaluation";
import { vnDay } from "@/lib/homeroom/report";
import { attendanceAlerts, classTotal, dayTaken, tallies } from "@/lib/homeroom/attendance";
import {
  addDays,
  displayDay,
  isSchoolDay,
  monthRange,
  termOf,
  vnToday,
  weekRange,
  weekdayName,
} from "@/lib/homeroom/periods";
import { isActive } from "@/lib/homeroom/profiles";
import { errorText, type HomeroomContext } from "./HomeroomFrame";

export function OverviewPage({ cls }: HomeroomContext) {
  const load = useServerFn(attendanceData);
  const today = vnToday();
  const contacts = useServerFn(listParentContacts);
  const books = useServerFn(classBooks);
  const incidentsFn = useServerFn(listIncidents);
  const [learning, setLearning] = useState<LearningAlert[]>([]);
  const [repeated, setRepeated] = useState<{ studentId: string; count: number }[]>([]);
  const [fresh, setFresh] = useState<
    { studentId: string; subject: string; label: string; value: number }[]
  >([]);
  const weekly = useServerFn(weeklyData);
  const [data, setData] = useState<AttendanceData | null>(null);
  const [followUps, setFollowUps] = useState<ParentContact[]>([]);
  const [lastWeekLocked, setLastWeekLocked] = useState(true);
  const [error, setError] = useState("");
  const lastWeek = weekRange(addDays(today, -7)).from;

  const fetchData = useCallback(async () => {
    try {
      setData(await load({ data: { classId: cls.id, from: addDays(today, -60), to: today } }));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
    // later-phase reminders; quietly skipped until their tables exist
    try {
      const [c, w] = await Promise.all([
        contacts({ data: { classId: cls.id } }),
        weekly({ data: { classId: cls.id, from: lastWeek, to: lastWeek } }),
      ]);
      setFollowUps(c.filter((x) => x.followUp && !x.followUpDone && x.followUp <= today));
      setLastWeekLocked(w.results.length > 0);
      const month = monthRange(today);
      const [b, inc] = await Promise.all([
        books({ data: { classId: cls.id } }),
        incidentsFn({ data: { classId: cls.id, ...month } }),
      ]);
      const semester = termOf(today, cls.settings) ?? 1;
      const ids = [...new Set(b.flatMap((x) => x.scores.map((sc) => sc.studentId)))];
      setLearning(learningAlerts(b, ids, semester));
      // single scores under 3.5 entered in the last 7 days
      const since = addDays(today, -7);
      setFresh(
        b.flatMap((book) =>
          book.scores
            .filter((sc) => sc.num !== null && sc.num < 3.5 && vnDay(sc.updatedAt) >= since)
            .map((sc) => ({
              studentId: sc.studentId,
              subject: book.subject,
              label: book.columns.find((c) => c.key === sc.key)?.label ?? sc.key,
              value: sc.num as number,
            })),
        ),
      );
      const counts = new Map<string, number>();
      for (const i of inc)
        if (i.type === "vi_pham") counts.set(i.studentId, (counts.get(i.studentId) ?? 0) + 1);
      setRepeated(
        [...counts].filter(([, n]) => n >= 3).map(([studentId, count]) => ({ studentId, count })),
      );
    } catch {
      /* not set up yet */
    }
  }, [load, contacts, weekly, books, incidentsFn, cls.id, cls.settings, today, lastWeek]);
  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const view = useMemo(() => {
    if (!data) return null;
    const active = data.students.filter((s) => isActive(s.status));
    const ids = active.map((s) => s.id);
    const todayTally = tallies(ids, data.absences, { from: today, to: today });
    let absent = 0;
    let late = 0;
    for (const t of todayTally.values()) {
      if (t.absent) absent++;
      else if (t.diMuon) late++;
    }
    const names = new Map(data.students.map((s) => [s.id, s.fullName]));
    const alerts = attendanceAlerts(ids, data.absences, data.taken, data.settings, today).map(
      (a) => ({
        ...a,
        name: names.get(a.studentId) ?? "",
      }),
    );
    return {
      active,
      male: active.filter((s) => s.gender === "nam").length,
      female: active.filter((s) => s.gender === "nu").length,
      noGender: active.filter((s) => !s.gender).length,
      left: data.students.length - active.length,
      takenToday: dayTaken(today, data.taken, data.settings.twoSessions),
      absent,
      late,
      week: classTotal(tallies(ids, data.absences, weekRange(today)).values()),
      alerts,
    };
  }, [data, today]);

  const term = termOf(today, cls.settings);
  const names = useMemo(
    () => new Map((data?.students ?? []).map((x) => [x.id, x.fullName])),
    [data],
  );

  return (
    <div className="grid gap-4">
      <section className="site-card site-hero p-5">
        <h1 className="site-title text-2xl">Lớp {cls.name}</h1>
        <p className="text-sm text-muted-foreground">
          {weekdayName(today)}, {displayDay(today)}
          {term ? ` · Học kỳ ${term === 1 ? "I" : "II"}` : ""}
          {cls.schoolYear ? ` · Năm học ${cls.schoolYear}` : ""}
        </p>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!view ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={<Users />} label="Sĩ số" value={view.active.length}>
              Nam {view.male} · Nữ {view.female}
              {view.noGender ? ` · chưa ghi ${view.noGender}` : ""}
            </Stat>
            <Stat
              icon={<CalendarCheck />}
              label="Có mặt hôm nay"
              value={view.takenToday ? view.active.length - view.absent : "–"}
            >
              {view.takenToday ? `Vắng ${view.absent} · muộn ${view.late}` : "Chưa điểm danh"}
            </Stat>
            <Stat icon={<LineChart />} label="Lượt vắng tuần này" value={view.week.absent}>
              Không phép {view.week.khongPhep} · muộn {view.week.diMuon}
            </Stat>
            <Stat
              icon={<TriangleAlert />}
              label="Cần lưu ý"
              value={new Set(view.alerts.map((a) => a.studentId)).size}
            >
              về chuyên cần
            </Stat>
          </div>

          <section className="site-card p-4">
            <h2 className="site-section-title mb-3">Việc cần làm hôm nay</h2>
            <ul className="grid gap-2 text-sm">
              {isSchoolDay(today) && !view.takenToday ? (
                <Todo tone="warn">
                  Chưa điểm danh hôm nay.{" "}
                  <Link to="/chu-nhiem/diem-danh" className="font-semibold text-primary underline">
                    Điểm danh ngay
                  </Link>
                </Todo>
              ) : null}
              {view.alerts.map((a) => (
                <Todo key={`${a.kind}${a.studentId}`} tone="alert">
                  <b>{a.name}</b>{" "}
                  {a.kind === "consecutive"
                    ? `đã nghỉ ${a.count} buổi liên tiếp (từ ${displayDay(a.since)}) — nên liên hệ phụ huynh.`
                    : `có ${a.count} buổi nghỉ không phép trong tháng này.`}
                </Todo>
              ))}
              {!lastWeekLocked ? (
                <Todo tone="info">
                  Chưa chốt xếp loại thi đua tuần trước.{" "}
                  <Link to="/chu-nhiem/thi-dua" className="text-primary underline">
                    Chốt tuần
                  </Link>
                </Todo>
              ) : null}
              {learning.map((a) => (
                <Todo key={`${a.kind}${a.studentId}${a.subject}`} tone="alert">
                  <b>{names.get(a.studentId) ?? ""}</b>{" "}
                  {a.kind === "very_low" ? (
                    <>
                      có ĐTB môn {a.subject}{" "}
                      <span className="rounded bg-red-100 px-1 font-bold text-red-900">
                        {String(a.value).replace(".", ",")}
                      </span>{" "}
                      — dưới 3,5, có thể khiến mức học tập bị xếp Chưa đạt.
                    </>
                  ) : a.kind === "low" ? (
                    <>
                      có ĐTB môn {a.subject}{" "}
                      <span className="font-semibold text-red-600">
                        {String(a.value).replace(".", ",")}
                      </span>{" "}
                      (dưới 5).
                    </>
                  ) : a.kind === "drop" ? (
                    `giảm môn ${a.subject} từ ${String(a.from).replace(".", ",")} xuống ${String(a.to).replace(".", ",")}.`
                  ) : null}
                </Todo>
              ))}
              {fresh.map((f) => (
                <Todo key={`f${f.studentId}${f.subject}${f.label}`} tone="alert">
                  <b>{names.get(f.studentId) ?? ""}</b> vừa nhận điểm{" "}
                  <span className="rounded bg-red-100 px-1 font-bold text-red-900">
                    {String(f.value).replace(".", ",")}
                  </span>{" "}
                  môn {f.subject} ({f.label}).
                </Todo>
              ))}
              {repeated.map((r) => (
                <Todo key={`vp${r.studentId}`} tone="alert">
                  <b>{names.get(r.studentId) ?? ""}</b> vi phạm {r.count} lần trong tháng này.
                </Todo>
              ))}
              {followUps.map((c) => (
                <Todo key={c.id} tone="warn">
                  Hẹn liên hệ lại phụ huynh em <b>{names.get(c.studentId) ?? ""}</b> (
                  {displayDay(c.followUp!)}).{" "}
                  <Link to="/chu-nhiem/phu-huynh" className="text-primary underline">
                    Mở nhật ký
                  </Link>
                </Todo>
              ))}
              {view.noGender ? (
                <Todo tone="info">
                  {view.noGender} học sinh chưa ghi giới tính.{" "}
                  <Link to="/chu-nhiem/ho-so" className="text-primary underline">
                    Bổ sung hồ sơ
                  </Link>
                </Todo>
              ) : null}
              {(isSchoolDay(today) ? view.takenToday : true) &&
              !view.alerts.length &&
              !view.noGender ? (
                <li className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Không có việc nào cần xử lý.
                </li>
              ) : null}
            </ul>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/chu-nhiem/ho-so">
                <Contact /> Hồ sơ học sinh
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/chu-nhiem/chuyen-can">
                <LineChart /> Thống kê chuyên cần
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  children: ReactNode;
}) {
  return (
    <div className="site-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-3xl font-bold text-[var(--site-navy)]">{value}</div>
      <div className="text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

function Todo({ tone, children }: { tone: "warn" | "alert" | "info"; children: ReactNode }) {
  const cls =
    tone === "alert"
      ? "border-red-200 bg-red-50"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-sky-200 bg-sky-50";
  return <li className={`rounded-lg border px-3 py-2 ${cls}`}>{children}</li>;
}
