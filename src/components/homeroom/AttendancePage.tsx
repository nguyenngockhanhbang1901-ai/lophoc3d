// Daily roll call, built for phones: everyone starts "có mặt"; tap P / K / M for the few who
// are not, add a reason, save. Saving again replaces that session's record.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  attendanceData,
  saveAttendance,
  type AttendanceData,
} from "@/lib/homeroom/homeroom.functions";
import {
  KIND_LABEL,
  KIND_SHORT,
  SESSION_LABEL,
  sessionsFor,
  type AbsenceKind,
  type Session,
} from "@/lib/homeroom/attendance";
import { addDays, displayDay, isSchoolDay, vnToday, weekdayName } from "@/lib/homeroom/periods";
import { byGivenName, isActive } from "@/lib/homeroom/profiles";
import { errorText, type HomeroomContext } from "./HomeroomFrame";

type Mark = { kind: AbsenceKind | null; reason: string };

const KIND_STYLE: Record<AbsenceKind, string> = {
  co_phep: "bg-amber-500 text-white border-amber-500",
  khong_phep: "bg-red-600 text-white border-red-600",
  di_muon: "bg-sky-600 text-white border-sky-600",
};

export function AttendancePage({ cls }: HomeroomContext) {
  const load = useServerFn(attendanceData);
  const save = useServerFn(saveAttendance);
  const [day, setDay] = useState(vnToday());
  const sessions = useMemo(() => sessionsFor(cls.settings.twoSessions), [cls.settings.twoSessions]);
  const [session, setSession] = useState<Session>(sessions[0]!);
  const [data, setData] = useState<AttendanceData | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!sessions.includes(session)) setSession(sessions[0]!);
  }, [sessions, session]);

  const fetchDay = useCallback(async () => {
    setError("");
    setNotice("");
    try {
      const d = await load({ data: { classId: cls.id, from: day, to: day } });
      setData(d);
      const m: Record<string, Mark> = {};
      for (const a of d.absences)
        if (a.session === session) m[a.studentId] = { kind: a.kind, reason: a.reason };
      setMarks(m);
      setDirty(false);
    } catch (e) {
      setError(errorText(e));
    }
  }, [load, cls.id, day, session]);

  useEffect(() => {
    void fetchDay();
  }, [fetchDay]);

  const students = useMemo(
    () => (data?.students ?? []).filter((s) => isActive(s.status)).sort(byGivenName),
    [data],
  );
  const taken = data?.taken.some((t) => t.day === day && t.session === session) ?? false;
  const counts = useMemo(() => {
    const c = { co_phep: 0, khong_phep: 0, di_muon: 0 };
    for (const s of students) {
      const k = marks[s.id]?.kind;
      if (k) c[k]++;
    }
    return c;
  }, [marks, students]);
  const present = students.length - counts.co_phep - counts.khong_phep;

  function setKind(id: string, kind: AbsenceKind | null) {
    setMarks((m) => ({
      ...m,
      [id]: { kind: m[id]?.kind === kind ? null : kind, reason: m[id]?.reason ?? "" },
    }));
    setDirty(true);
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await save({
        data: {
          classId: cls.id,
          day,
          session,
          entries: students
            .filter((s) => marks[s.id]?.kind)
            .map((s) => ({
              studentId: s.id,
              kind: marks[s.id]!.kind!,
              reason: marks[s.id]!.reason.trim(),
            })),
        },
      });
      await fetchDay();
      setNotice(`Đã lưu điểm danh ${weekdayName(day).toLowerCase()}, ${displayDay(day)}.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function move(n: number) {
    let d = addDays(day, n);
    while (!isSchoolDay(d)) d = addDays(d, n);
    setDay(d);
  }

  return (
    <div className="grid gap-4 pb-24">
      <section className="site-card grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label="Ngày trước">
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            className="w-auto"
            value={day}
            max={vnToday()}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => move(1)}
            disabled={day >= vnToday()}
            aria-label="Ngày sau"
          >
            <ChevronRight />
          </Button>
          <span className="font-semibold">{weekdayName(day)}</span>
          {sessions.length > 1 ? (
            <div className="ml-auto flex rounded-lg border p-0.5">
              {sessions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`rounded-md px-3 py-1 text-sm ${s === session ? "bg-primary text-primary-foreground" : ""}`}
                  onClick={() => {
                    if (dirty && !confirm("Chưa lưu điểm danh buổi này. Vẫn chuyển?")) return;
                    setSession(s);
                  }}
                >
                  {SESSION_LABEL[s]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            Có mặt <b>{present}</b>/{students.length}
          </span>
          <span className="text-amber-700">Có phép {counts.co_phep}</span>
          <span className="text-red-700">Không phép {counts.khong_phep}</span>
          <span className="text-sky-700">Đi muộn {counts.di_muon}</span>
          {taken && !dirty ? (
            <span className="ml-auto inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Đã điểm danh
            </span>
          ) : (
            <span className="ml-auto text-muted-foreground">
              {dirty ? "Chưa lưu" : "Chưa điểm danh"}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Mặc định tất cả có mặt. Chạm P (có phép), K (không phép) hoặc M (đi muộn) cho em không có
          mặt; chạm lại để bỏ.
        </p>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      {data === null ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : students.length === 0 ? (
        <p className="text-muted-foreground">Lớp chưa có học sinh đang học.</p>
      ) : (
        <ol className="site-card divide-y">
          {students.map((s, i) => {
            const m = marks[s.id];
            return (
              <li key={s.id} className={`grid gap-2 px-3 py-2.5 ${m?.kind ? "bg-muted/40" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}</span>
                  <span className="flex-1 font-medium">{s.fullName}</span>
                  <div className="flex gap-1">
                    {(["co_phep", "khong_phep", "di_muon"] as AbsenceKind[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        title={KIND_LABEL[k]}
                        aria-label={`${KIND_LABEL[k]} – ${s.fullName}`}
                        aria-pressed={m?.kind === k}
                        className={`h-9 w-9 rounded-lg border text-sm font-bold ${m?.kind === k ? KIND_STYLE[k] : "bg-background"}`}
                        onClick={() => setKind(s.id, k)}
                      >
                        {KIND_SHORT[k]}
                      </button>
                    ))}
                  </div>
                </div>
                {m?.kind ? (
                  <Input
                    className="ml-8 h-8 w-auto text-sm"
                    placeholder="Lý do (không bắt buộc)"
                    maxLength={200}
                    value={m.reason}
                    onChange={(e) => {
                      const reason = e.target.value;
                      setMarks((x) => ({ ...x, [s.id]: { kind: m.kind, reason } }));
                      setDirty(true);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {students.length ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 p-3 backdrop-blur lg:left-[240px]">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <span className="flex-1 text-sm">
              {SESSION_LABEL[session]} · {displayDay(day)} · vắng{" "}
              {counts.co_phep + counts.khong_phep}, muộn {counts.di_muon}
            </span>
            <Button onClick={() => void submit()} disabled={busy}>
              <Save />
              {busy ? "Đang lưu…" : taken ? "Lưu lại" : "Lưu điểm danh"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
