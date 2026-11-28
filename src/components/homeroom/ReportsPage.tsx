// Báo cáo – Thống kê: for a week, month, term or year — the whole class at a glance, or one
// student's progress sheet compared with the previous period (printable for every student).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attendanceData, type StudentBasic } from "@/lib/homeroom/homeroom.functions";
import {
  behaviorRange,
  classBooks,
  listIncidents,
  weeklyData,
} from "@/lib/homeroom/records.functions";
import {
  addDays,
  displayDay,
  periodLabel,
  periodRange,
  previousPeriod,
  vnToday,
  type PeriodKind,
  type Range,
} from "@/lib/homeroom/periods";
import { byGivenName, isActive } from "@/lib/homeroom/profiles";
import { LEVEL_LABEL, type Level } from "@/lib/homeroom/evaluation";
import { BEHAVIOR_LABEL, type BehaviorKind } from "@/lib/gradebook/scores";
import { speakText, summarize, type ReportInput, type StudentSummary } from "@/lib/homeroom/report";
import { errorText, type HomeroomContext } from "./HomeroomFrame";
import { downloadTable, fileSafe, printPages, printTable } from "./sheets";

const KINDS: { kind: PeriodKind; label: string }[] = [
  { kind: "week", label: "Tuần" },
  { kind: "month", label: "Tháng" },
  { kind: "term1", label: "Học kỳ I" },
  { kind: "term2", label: "Học kỳ II" },
  { kind: "year", label: "Cả năm" },
];

function weeksText(s: StudentSummary): string {
  if (!s.weeks.length) return "";
  if (s.weeks.length === 1) return `${LEVEL_LABEL[s.weeks[0]!.level]} (${s.weeks[0]!.points} điểm)`;
  const n = (l: Level) => s.weeks.filter((w) => w.level === l).length;
  return `Tốt ${n("tot")} · Khá ${n("kha")} · Đạt ${n("dat")} · Chưa đạt ${n("chua_dat")}`;
}

function process(s: StudentSummary): string {
  const kinds = (Object.entries(s.kinds) as [BehaviorKind, number][]).filter(
    ([k]) => k !== "phat_bieu",
  );
  return kinds.length
    ? kinds.map(([k, n]) => `${BEHAVIOR_LABEL[k]} ${n}`).join("; ")
    : "Không có ghi nhận";
}

function absenceText(s: StudentSummary): string {
  const parts = [
    s.coPhep ? `vắng có phép ${s.coPhep}` : "",
    s.khongPhep ? `vắng không phép ${s.khongPhep}` : "",
    s.diMuon ? `đi muộn ${s.diMuon}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Đủ buổi";
}

/** The progress sheet rows of one student: this period vs. the previous one. */
export function sheetRows(now: StudentSummary, before: StudentSummary | undefined): string[][] {
  const b = before;
  return [
    ["Chuyên cần", absenceText(now), b ? absenceText(b) : ""],
    ["Phát biểu", speakText(now), b ? speakText(b) : ""],
    ["Quá trình học tập", process(now), b ? process(b) : ""],
    [
      "Vi phạm nội quy",
      now.viPham.length ? now.viPham.join("; ") : "0",
      b ? String(b.viPham.length) : "",
    ],
    ["Khen thưởng", now.khen.length ? now.khen.join("; ") : "0", b ? String(b.khen.length) : ""],
    [
      "Điểm mới",
      now.scores.length
        ? now.scores.map((x) => `${x.subject} ${x.label}: ${x.value}`).join("; ")
        : "Không có",
      b
        ? b.scores.length
          ? b.scores.map((x) => `${x.subject} ${x.label}: ${x.value}`).join("; ")
          : "Không có"
        : "",
    ],
    ["Thi đua tuần", weeksText(now) || "Chưa chốt", b ? weeksText(b) || "Chưa chốt" : ""],
  ];
}

export function ReportsPage({ cls }: HomeroomContext) {
  const att = useServerFn(attendanceData);
  const beh = useServerFn(behaviorRange);
  const inc = useServerFn(listIncidents);
  const wk = useServerFn(weeklyData);
  const books = useServerFn(classBooks);
  const [kind, setKind] = useState<PeriodKind>("week");
  const [anchor, setAnchor] = useState(vnToday());
  const [mode, setMode] = useState<"class" | "student">("class");
  const [studentId, setStudentId] = useState("");
  const range = useMemo(
    () => periodRange(kind, anchor, cls.settings),
    [kind, anchor, cls.settings],
  );
  const prev = useMemo(
    () => previousPeriod(kind, range, cls.settings),
    [kind, range, cls.settings],
  );
  const [students, setStudents] = useState<StudentBasic[]>([]);
  const [input, setInput] = useState<ReportInput | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setInput(null);
    const span: Range = { from: prev?.from ?? range.from, to: range.to };
    try {
      const [a, b, i, w, bk] = await Promise.all([
        att({ data: { classId: cls.id, ...span } }),
        beh({ data: { classId: cls.id, ...span } }),
        inc({ data: { classId: cls.id, ...span } }),
        wk({ data: { classId: cls.id, ...span } }),
        books({ data: { classId: cls.id } }),
      ]);
      setStudents(a.students.slice().sort(byGivenName));
      setInput({ absences: a.absences, events: b, incidents: i, weekly: w.results, books: bk });
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [att, beh, inc, wk, books, cls.id, range, prev]);
  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => students.filter((s) => isActive(s.status)), [students]);
  const ids = useMemo(() => active.map((s) => s.id), [active]);
  const now = useMemo(() => (input ? summarize(ids, input, range) : null), [input, ids, range]);
  const before = useMemo(
    () => (input && prev ? summarize(ids, input, prev) : null),
    [input, ids, prev],
  );

  function step(n: number) {
    if (kind === "week") setAnchor(addDays(range.from, 7 * n));
    else setAnchor(n < 0 ? addDays(range.from, -1) : addDays(range.to, 1));
  }

  const label = periodLabel(kind, range);
  const head = [
    "STT",
    "Họ và tên",
    "Có phép",
    "Không phép",
    "Đi muộn",
    "Phát biểu",
    "Tích cực",
    "Chưa tốt",
    "Khen",
    "Vi phạm",
    "Điểm mới",
    "Thi đua",
  ];
  const rows = active.map((s, i) => {
    const x = now?.get(s.id);
    return [
      i + 1,
      s.fullName,
      x?.coPhep ?? 0,
      x?.khongPhep ?? 0,
      x?.diMuon ?? 0,
      x?.speak ?? 0,
      x?.good ?? 0,
      x?.bad ?? 0,
      x?.khen.length ?? 0,
      x?.viPham.length ?? 0,
      x?.scores.length ?? 0,
      x ? weeksText(x) : "",
    ];
  });
  const sheetHead = ["Mục", label, prev ? "Kỳ trước" : ""].filter(Boolean);
  const pageOf = (s: StudentBasic) => {
    const r = sheetRows(now!.get(s.id)!, before?.get(s.id));
    return {
      heading: `Phiếu theo dõi – ${s.fullName}`,
      subtitle: `Lớp ${cls.name} · ${label}`,
      head: sheetHead,
      rows: prev ? r : r.map((x) => x.slice(0, 2)),
    };
  };
  const picked = active.find((s) => s.id === studentId) ?? active[0];

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
          <div className="ml-auto flex rounded-lg border p-0.5">
            {(["class", "student"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`rounded-md px-3 py-1 text-sm ${m === mode ? "bg-primary text-primary-foreground" : ""}`}
                onClick={() => setMode(m)}
              >
                {m === "class" ? "Cả lớp" : "Từng học sinh"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Kỳ trước" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <b>{label}</b>
          <Button variant="outline" size="icon" aria-label="Kỳ sau" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
          <div className="ml-auto flex gap-2">
            {mode === "class" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!now}
                  onClick={() =>
                    void downloadTable(
                      `bao-cao-${fileSafe(cls.name)}-${range.from}.xlsx`,
                      "Báo cáo",
                      head,
                      rows,
                    )
                  }
                >
                  <Download /> Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!now}
                  onClick={() => {
                    if (!printTable(`Báo cáo lớp ${cls.name}`, label, head, rows))
                      setError("Trình duyệt đã chặn cửa sổ in.");
                  }}
                >
                  <Printer /> In
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={!now}
                onClick={() => {
                  if (!printPages(`Phiếu theo dõi lớp ${cls.name}`, active.map(pageOf)))
                    setError("Trình duyệt đã chặn cửa sổ in.");
                }}
              >
                <Printer /> In phiếu cả lớp
              </Button>
            )}
          </div>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!now ? (
        <p className="text-muted-foreground">Đang tổng hợp…</p>
      ) : mode === "class" ? (
        <div className="site-card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                {head.map((h) => (
                  <th key={h} className="px-2 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr
                  key={active[i]!.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    setStudentId(active[i]!.id);
                    setMode("student");
                  }}
                >
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className={`px-2 py-1.5 ${j === 1 ? "font-medium" : j >= 2 && j <= 10 ? "text-center" : ""} ${(j === 3 || j === 9 || j === 7) && Number(c) > 0 ? "font-semibold text-red-700" : ""}`}
                    >
                      {j >= 2 && j <= 10 && c === 0 ? "" : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : picked ? (
        <section className="site-card grid gap-3 p-4">
          <select
            className="h-9 w-fit rounded-md border bg-background px-3 font-semibold"
            value={picked.id}
            onChange={(e) => setStudentId(e.target.value)}
            aria-label="Chọn học sinh"
          >
            {active.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {sheetHead.map((h) => (
                    <th key={h} className="px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageOf(picked).rows.map((r) => (
                  <tr key={r[0]}>
                    <td className="px-3 py-2 font-medium">{r[0]}</td>
                    <td className="px-3 py-2">{r[1]}</td>
                    {prev ? <td className="px-3 py-2 text-muted-foreground">{r[2]}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {displayDay(range.from)} – {displayDay(range.to)}. Nhận xét của GVCN và gợi ý của AI sẽ
            thêm ở đợt 3.
          </p>
        </section>
      ) : (
        <p className="text-muted-foreground">Lớp chưa có học sinh.</p>
      )}
    </div>
  );
}
