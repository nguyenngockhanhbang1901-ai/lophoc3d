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
import { attendanceAlerts, classTotal, dayTaken, tallies } from "@/lib/homeroom/attendance";
import {
  addDays,
  displayDay,
  isSchoolDay,
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
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setData(await load({ data: { classId: cls.id, from: addDays(today, -60), to: today } }));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [load, cls.id, today]);
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
