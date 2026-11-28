// Chuyên cần: tallies per student for a week / month / term / year, compared with the
// previous period of the same kind, with each student's records one tap away.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Download, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  attendanceData,
  type AttendanceData,
  type StudentBasic,
} from "@/lib/homeroom/homeroom.functions";
import {
  KIND_LABEL,
  SESSION_LABEL,
  attendanceAlerts,
  classTotal,
  tallies,
  takenCount,
  type Tally,
} from "@/lib/homeroom/attendance";
import {
  addDays,
  displayDay,
  periodLabel,
  periodRange,
  previousPeriod,
  vnToday,
  weekdayName,
  type PeriodKind,
  type Range,
} from "@/lib/homeroom/periods";
import { byGivenName, isActive, STATUS_LABEL } from "@/lib/homeroom/profiles";
import { errorText, type HomeroomContext } from "./HomeroomFrame";
import { downloadTable, fileSafe, printTable } from "./sheets";

const KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: "week", label: "Tuần" },
  { kind: "month", label: "Tháng" },
  { kind: "term1", label: "Học kỳ I" },
  { kind: "term2", label: "Học kỳ II" },
  { kind: "year", label: "Cả năm" },
];

export function AttendanceStatsPage({ cls }: HomeroomContext) {
  const load = useServerFn(attendanceData);
  const terms = cls.settings;
  const [kind, setKind] = useState<PeriodKind>("week");
  const [anchor, setAnchor] = useState(vnToday());
  const range = useMemo(() => periodRange(kind, anchor, terms), [kind, anchor, terms]);
  const prev = useMemo(() => previousPeriod(kind, range, terms), [kind, range, terms]);
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<StudentBasic | null>(null);

  const fetchRange = useCallback(async () => {
    setError("");
    try {
      // previous period + 30 days before for absence runs that started earlier
      const from = addDays(prev?.from ?? range.from, -30);
      setData(await load({ data: { classId: cls.id, from, to: range.to } }));
    } catch (e) {
      setError(errorText(e));
    }
  }, [load, cls.id, range, prev]);

  useEffect(() => {
    void fetchRange();
  }, [fetchRange]);

  const students = useMemo(() => (data?.students ?? []).slice().sort(byGivenName), [data]);
  const ids = useMemo(() => students.map((s) => s.id), [students]);
  const now = useMemo(
    () => (data ? tallies(ids, data.absences, range) : new Map<string, Tally>()),
    [data, ids, range],
  );
  const before = useMemo(
    () => (data && prev ? tallies(ids, data.absences, prev) : null),
    [data, ids, prev],
  );
  const alerts = useMemo(() => {
    if (!data) return new Map<string, string[]>();
    const today = vnToday();
    const upTo = range.to < today ? range.to : today;
    const out = new Map<string, string[]>();
    for (const a of attendanceAlerts(
      students.filter((s) => isActive(s.status)).map((s) => s.id),
      data.absences,
      data.taken,
      data.settings,
      upTo,
    ))
      out.set(a.studentId, [
        ...(out.get(a.studentId) ?? []),
        a.kind === "consecutive"
          ? `Nghỉ ${a.count} buổi liên tiếp`
          : `${a.count} buổi không phép trong tháng`,
      ]);
    return out;
  }, [data, students, range]);
  const sessions = data ? takenCount(data.taken, range) : 0;
  const total = classTotal(now.values());

  function step(n: number) {
    if (kind === "week") setAnchor(addDays(range.from, 7 * n));
    else if (kind === "month") setAnchor(n < 0 ? addDays(range.from, -1) : addDays(range.to, 1));
    else setAnchor(n < 0 ? addDays(range.from, -1) : addDays(range.to, 1));
  }

  const head = [
    "STT",
    "Họ và tên",
    "Có phép",
    "Không phép",
    "Đi muộn",
    "Tổng vắng",
    "Kỳ trước (vắng)",
    "Ghi chú",
  ];
  const tableRows = students.map((s, i) => {
    const t = now.get(s.id)!;
    return [
      i + 1,
      s.fullName,
      t.coPhep,
      t.khongPhep,
      t.diMuon,
      t.absent,
      before ? (before.get(s.id)?.absent ?? 0) : "",
      [isActive(s.status) ? "" : STATUS_LABEL[s.status], ...(alerts.get(s.id) ?? [])]
        .filter(Boolean)
        .join("; "),
    ];
  });
  const title = `Thống kê chuyên cần lớp ${cls.name}`;

  return (
    <div className="grid gap-4">
      <section className="site-card grid gap-3 p-4">
        <div className="flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm ${kind === k.kind ? "border-primary bg-primary text-primary-foreground" : ""}`}
              onClick={() => {
                setKind(k.kind);
                setAnchor(vnToday());
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Kỳ trước">
            <ChevronLeft />
          </Button>
          <b>{periodLabel(kind, range)}</b>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Kỳ sau">
            <ChevronRight />
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data}
              onClick={() =>
                void downloadTable(
                  `chuyen-can-${fileSafe(cls.name)}-${range.from}.xlsx`,
                  "Chuyên cần",
                  head,
                  tableRows,
                )
              }
            >
              <Download /> Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data}
              onClick={() => {
                if (!printTable(title, periodLabel(kind, range), head, tableRows))
                  setError(
                    "Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.",
                  );
              }}
            >
              <Printer /> In
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>
            Số buổi đã điểm danh: <b>{sessions}</b>
          </span>
          <span className="text-amber-700">Có phép {total.coPhep}</span>
          <span className="text-red-700">Không phép {total.khongPhep}</span>
          <span className="text-sky-700">Đi muộn {total.diMuon}</span>
          <span>
            Cần lưu ý: <b>{alerts.size}</b> em
          </span>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {data === null ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : (
        <div className="site-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                {head.map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {students.map((s, i) => {
                const t = now.get(s.id)!;
                const b = before?.get(s.id)?.absent;
                const warn = alerts.get(s.id);
                return (
                  <tr
                    key={s.id}
                    className={`cursor-pointer hover:bg-muted/40 ${isActive(s.status) ? "" : "text-muted-foreground"}`}
                    onClick={() => setDetail(s)}
                  >
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{s.fullName}</td>
                    <td className="px-3 py-2 text-center">{t.coPhep || ""}</td>
                    <td
                      className={`px-3 py-2 text-center ${t.khongPhep ? "font-bold text-red-700" : ""}`}
                    >
                      {t.khongPhep || ""}
                    </td>
                    <td className="px-3 py-2 text-center">{t.diMuon || ""}</td>
                    <td className="px-3 py-2 text-center font-semibold">{t.absent || ""}</td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {b === undefined ? "" : b}
                      {b !== undefined && t.absent !== b ? (
                        <span className={t.absent > b ? "text-red-700" : "text-emerald-700"}>
                          {" "}
                          ({t.absent > b ? "▲" : "▼"}
                          {Math.abs(t.absent - b)})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {!isActive(s.status) ? <span>{STATUS_LABEL[s.status]} </span> : null}
                      {warn?.map((w) => (
                        <span
                          key={w}
                          className="mr-1 inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700"
                        >
                          <TriangleAlert className="h-3 w-3" />
                          {w}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && data ? (
        <StudentHistory
          student={detail}
          data={data}
          range={range}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

function StudentHistory({
  student,
  data,
  range,
  onClose,
}: {
  student: StudentBasic;
  data: AttendanceData;
  range: Range;
  onClose: () => void;
}) {
  const records = data.absences
    .filter((a) => a.studentId === student.id && a.day >= range.from && a.day <= range.to)
    .sort((a, b) => (a.day < b.day ? 1 : -1));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{student.fullName}</DialogTitle>
        <DialogDescription>
          {displayDay(range.from)} – {displayDay(range.to)}
        </DialogDescription>
        {records.length ? (
          <ul className="divide-y text-sm">
            {records.map((r) => (
              <li key={`${r.day}${r.session}`} className="py-2">
                <b>
                  {weekdayName(r.day)}, {displayDay(r.day)}
                </b>
                {r.session !== "ca_ngay" ? ` · ${SESSION_LABEL[r.session]}` : ""} —{" "}
                <span className={r.kind === "khong_phep" ? "text-red-700" : ""}>
                  {KIND_LABEL[r.kind]}
                </span>
                {r.reason ? <div className="text-muted-foreground">{r.reason}</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Không vắng, không đi muộn trong kỳ này.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
