// Ghi nhận & thi đua: in-class records reported by class officers (per subject), khen thưởng –
// vi phạm, and the weekly competition score the homeroom teacher locks each week.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Lock, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BehaviorPanel } from "@/components/gradebook/BehaviorPanel";
import { attendanceData, type StudentBasic } from "@/lib/homeroom/homeroom.functions";
import {
  INCIDENT_CATEGORIES,
  behaviorRange,
  deleteIncident,
  listIncidents,
  lockWeek,
  saveIncident,
  saveWeeklyRule,
  weeklyData,
  type Incident,
  type WeeklyResult,
} from "@/lib/homeroom/records.functions";
import {
  addDays,
  displayDay,
  monthRange,
  vnToday,
  weekRange,
  type Range,
} from "@/lib/homeroom/periods";
import { byGivenName, isActive } from "@/lib/homeroom/profiles";
import { LEVELS, LEVEL_LABEL, type Level } from "@/lib/homeroom/evaluation";
import {
  DEFAULT_INCIDENT_POINTS,
  DEFAULT_WEEKLY_RULE,
  weekScore,
  type WeekScore,
  type WeeklyRule,
} from "@/lib/homeroom/weekly";
import { errorText, type HomeroomContext } from "./HomeroomFrame";

export const SUBJECTS = [
  "Toán",
  "Ngữ văn",
  "Tiếng Anh",
  "Vật lí",
  "Hóa học",
  "Sinh học",
  "Lịch sử",
  "Địa lí",
  "GD Kinh tế và Pháp luật",
  "Tin học",
  "Công nghệ",
  "Giáo dục thể chất",
  "GD Quốc phòng và An ninh",
  "HĐ trải nghiệm, hướng nghiệp",
  "Nội dung GD địa phương",
  "Chào cờ – Sinh hoạt lớp",
];

function useStudents(classId: string) {
  const load = useServerFn(attendanceData);
  const [students, setStudents] = useState<StudentBasic[] | null>(null);
  useEffect(() => {
    const t = vnToday();
    void load({ data: { classId, from: t, to: t } }).then(
      (d) => setStudents(d.students.slice().sort(byGivenName)),
      () => setStudents([]),
    );
  }, [load, classId]);
  return students;
}

export function MeritPage({ cls }: HomeroomContext) {
  const students = useStudents(cls.id);
  const [subject, setSubject] = useState(SUBJECTS[0]!);
  if (!students) return <p className="text-muted-foreground">Đang tải…</p>;
  return (
    <Tabs defaultValue="ghi-nhan">
      <TabsList>
        <TabsTrigger value="ghi-nhan">Ghi nhận theo tiết</TabsTrigger>
        <TabsTrigger value="khen-vi-pham">Khen thưởng – Vi phạm</TabsTrigger>
        <TabsTrigger value="tuan">Xếp loại tuần</TabsTrigger>
      </TabsList>
      <TabsContent value="ghi-nhan" className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="mr-subject">Tiết / môn</Label>
          <Input
            id="mr-subject"
            list="mr-subjects"
            className="w-64"
            value={subject}
            maxLength={60}
            onChange={(e) => setSubject(e.target.value)}
          />
          <datalist id="mr-subjects">
            {SUBJECTS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        {subject.trim() ? (
          <BehaviorPanel
            key={subject}
            classId={cls.id}
            subject={subject.trim()}
            roster={students}
            note="Ban cán sự báo lại sau mỗi tiết: chọn môn rồi chạm vào ghi nhận của từng em. Ghi nhận được tính vào điểm thi đua tuần."
          />
        ) : null}
      </TabsContent>
      <TabsContent value="khen-vi-pham">
        <Incidents classId={cls.id} students={students} />
      </TabsContent>
      <TabsContent value="tuan">
        <Weekly classId={cls.id} students={students} />
      </TabsContent>
    </Tabs>
  );
}

// ---------- incidents ----------

function Incidents({ classId, students }: { classId: string; students: StudentBasic[] }) {
  const list = useServerFn(listIncidents);
  const remove = useServerFn(deleteIncident);
  const [range, setRange] = useState<Range>(monthRange(vnToday()));
  const [items, setItems] = useState<Incident[] | null>(null);
  const [editing, setEditing] = useState<Partial<Incident> | null>(null);
  const [error, setError] = useState("");
  const names = useMemo(() => new Map(students.map((s) => [s.id, s.fullName])), [students]);

  const load = useCallback(async () => {
    try {
      setItems(await list({ data: { classId, ...range } }));
      setError("");
    } catch (e) {
      setItems([]);
      setError(errorText(e));
    }
  }, [list, classId, range]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Tháng trước"
          onClick={() => setRange(monthRange(addDays(range.from, -1)))}
        >
          <ChevronLeft />
        </Button>
        <b>
          Tháng {range.from.slice(5, 7)}/{range.from.slice(0, 4)}
        </b>
        <Button
          variant="outline"
          size="icon"
          aria-label="Tháng sau"
          onClick={() => setRange(monthRange(addDays(range.to, 1)))}
        >
          <ChevronRight />
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => setEditing({ type: "khen", day: vnToday() })}>
            <Plus /> Khen thưởng
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setEditing({ type: "vi_pham", day: vnToday() })}
          >
            <Plus /> Vi phạm
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Nghỉ học không phép không cần ghi ở đây: hệ thống lấy từ điểm danh khi tính điểm thi đua và
        báo cáo.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items === null ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : !items.length ? (
        <p className="text-muted-foreground">Chưa có khen thưởng hay vi phạm trong tháng này.</p>
      ) : (
        <ul className="site-card divide-y">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-start gap-3 px-3 py-2 text-sm">
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${it.type === "khen" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
              >
                {it.type === "khen" ? "Khen" : "Vi phạm"}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setEditing(it)}
              >
                <b>{names.get(it.studentId) ?? "?"}</b> · {displayDay(it.day)} ·{" "}
                {(INCIDENT_CATEGORIES[it.type] as Record<string, string>)[it.category] ??
                  it.category}
                <div>{it.content}</div>
                {it.action ? (
                  <div className="text-muted-foreground">
                    {it.type === "khen" ? "Hình thức" : "Xử lý"}: {it.action}
                  </div>
                ) : null}
              </button>
              <span
                className={`font-semibold ${it.points >= 0 ? "text-emerald-700" : "text-red-700"}`}
              >
                {it.points > 0 ? `+${it.points}` : it.points}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Xóa"
                onClick={() => {
                  if (!confirm("Xóa ghi nhận này?")) return;
                  void remove({ data: { id: it.id } }).then(load, (e) => setError(errorText(e)));
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <IncidentDialog
          classId={classId}
          students={students}
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function IncidentDialog({
  classId,
  students,
  value,
  onClose,
  onSaved,
}: {
  classId: string;
  students: StudentBasic[];
  value: Partial<Incident>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(saveIncident);
  const type = value.type ?? "khen";
  const cats = Object.entries(INCIDENT_CATEGORIES[type]) as [string, string][];
  const [picked, setPicked] = useState<Set<string>>(
    new Set(value.studentId ? [value.studentId] : []),
  );
  const [day, setDay] = useState(value.day ?? vnToday());
  const [category, setCategory] = useState(value.category ?? cats[0]![0]);
  const [content, setContent] = useState(value.content ?? "");
  const [action, setAction] = useState(value.action ?? "");
  const [points, setPoints] = useState(value.points ?? DEFAULT_INCIDENT_POINTS[type]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = !!value.id;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogTitle>{type === "khen" ? "Khen thưởng" : "Vi phạm"}</DialogTitle>
        <DialogDescription>
          {editing ? "Sửa ghi nhận." : "Chọn một hoặc nhiều học sinh (ví dụ cả tổ được khen)."}
        </DialogDescription>
        <div className="grid gap-3 text-sm">
          <div className="max-h-40 overflow-y-auto rounded-lg border p-2">
            {students
              .filter((s) => isActive(s.status) || picked.has(s.id))
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-0.5">
                  <input
                    type={editing ? "radio" : "checkbox"}
                    name="inc-student"
                    checked={picked.has(s.id)}
                    onChange={(e) =>
                      setPicked((p) => {
                        if (editing) return new Set([s.id]);
                        const n = new Set(p);
                        if (e.target.checked) n.add(s.id);
                        else n.delete(s.id);
                        return n;
                      })
                    }
                  />
                  {s.fullName}
                </label>
              ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="inc-day">Ngày</Label>
              <Input
                id="inc-day"
                type="date"
                value={day}
                max={vnToday()}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="inc-cat">Loại</Label>
              <select
                id="inc-cat"
                className="h-9 w-full rounded-md border bg-background px-2"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {cats.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="inc-content">Nội dung</Label>
            <Input
              id="inc-content"
              maxLength={500}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <div>
              <Label htmlFor="inc-action">
                {type === "khen" ? "Hình thức khen" : "Biện pháp xử lý"}
              </Label>
              <Input
                id="inc-action"
                maxLength={300}
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="inc-points">Điểm thi đua</Label>
              <Input
                id="inc-points"
                type="number"
                min={-100}
                max={100}
                value={points}
                onChange={(e) =>
                  setPoints(Math.max(-100, Math.min(100, Math.round(Number(e.target.value) || 0))))
                }
              />
            </div>
          </div>
          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              disabled={busy || !picked.size || !content.trim()}
              onClick={() => {
                setBusy(true);
                void save({
                  data: {
                    classId,
                    ...(value.id ? { id: value.id } : {}),
                    studentIds: [...picked],
                    day,
                    type,
                    category,
                    content: content.trim(),
                    action: action.trim(),
                    points,
                  },
                })
                  .then(onSaved)
                  .catch((e) => {
                    setError(errorText(e));
                    setBusy(false);
                  });
              }}
            >
              Lưu{picked.size > 1 ? ` cho ${picked.size} em` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- weekly ----------

export interface WeekInput {
  rule: WeeklyRule;
  results: WeeklyResult[];
  scores: Map<string, WeekScore>;
}

/** Load everything a week's competition score needs and compute it per student. */
export function useWeekScores(classId: string, students: StudentBasic[], week: Range) {
  const att = useServerFn(attendanceData);
  const beh = useServerFn(behaviorRange);
  const inc = useServerFn(listIncidents);
  const wk = useServerFn(weeklyData);
  const [state, setState] = useState<WeekInput | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [a, b, i, w] = await Promise.all([
        att({ data: { classId, ...week } }),
        beh({ data: { classId, ...week } }),
        inc({ data: { classId, ...week } }),
        wk({ data: { classId, from: week.from, to: week.from } }),
      ]);
      const scores = new Map<string, WeekScore>();
      for (const s of students)
        scores.set(
          s.id,
          weekScore(
            b.filter((e) => e.studentId === s.id).map((e) => e.kind),
            a.absences.filter((x) => x.studentId === s.id),
            i.filter((x) => x.studentId === s.id),
            w.rule,
          ),
        );
      setState({ rule: w.rule, results: w.results, scores });
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [att, beh, inc, wk, classId, students, week]);
  useEffect(() => {
    void load();
  }, [load]);
  return { state, error, reload: load };
}

function Weekly({ classId, students }: { classId: string; students: StudentBasic[] }) {
  const lock = useServerFn(lockWeek);
  const [week, setWeek] = useState<Range>(weekRange(vnToday()));
  const active = useMemo(() => students.filter((s) => isActive(s.status)), [students]);
  const { state, error, reload } = useWeekScores(classId, active, week);
  const [chosen, setChosen] = useState<Record<string, Level>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ruleOpen, setRuleOpen] = useState(false);
  const saved = useMemo(
    () => new Map((state?.results ?? []).map((r) => [r.studentId, r])),
    [state],
  );

  useEffect(() => setChosen({}), [week]);

  const levelOf = (id: string): Level =>
    chosen[id] ?? saved.get(id)?.level ?? state?.scores.get(id)?.level ?? "dat";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Tuần trước"
          onClick={() => setWeek(weekRange(addDays(week.from, -7)))}
        >
          <ChevronLeft />
        </Button>
        <b>
          Tuần {displayDay(week.from)} – {displayDay(week.to)}
        </b>
        <Button
          variant="outline"
          size="icon"
          aria-label="Tuần sau"
          disabled={week.to >= vnToday()}
          onClick={() => setWeek(weekRange(addDays(week.from, 7)))}
        >
          <ChevronRight />
        </Button>
        {saved.size ? (
          <span className="text-sm text-emerald-700">Đã chốt {saved.size} em</span>
        ) : (
          <span className="text-sm text-muted-foreground">Chưa chốt</span>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRuleOpen(true)} disabled={!state}>
            <Settings2 /> Bảng điểm thi đua
          </Button>
          <Button
            size="sm"
            disabled={busy || !state}
            onClick={() => {
              if (!state) return;
              setBusy(true);
              void lock({
                data: {
                  classId,
                  weekStart: week.from,
                  rows: active.map((s) => ({
                    studentId: s.id,
                    points: state.scores.get(s.id)?.points ?? state.rule.start,
                    level: levelOf(s.id),
                    note: "",
                  })),
                },
              })
                .then(() => {
                  setMsg("Đã chốt xếp loại tuần.");
                  return reload();
                })
                .catch((e) => setMsg(errorText(e)))
                .finally(() => setBusy(false));
            }}
          >
            <Lock /> {saved.size ? "Chốt lại" : "Chốt tuần"}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {!state ? (
        <p className="text-muted-foreground">Đang tính điểm thi đua…</p>
      ) : (
        <div className="site-card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">STT</th>
                <th className="px-3 py-2">Họ và tên</th>
                <th className="px-3 py-2">Cộng / trừ trong tuần</th>
                <th className="px-3 py-2 text-center">Điểm</th>
                <th className="px-3 py-2">Xếp loại</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.map((s, i) => {
                const sc = state.scores.get(s.id);
                const sv = saved.get(s.id);
                return (
                  <tr key={s.id}>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{s.fullName}</td>
                    <td className="px-3 py-2 text-xs">
                      {sc?.lines.length ? (
                        sc.lines.map((l, j) => (
                          <span
                            key={j}
                            className={`mr-2 inline-block ${l.points >= 0 ? "text-emerald-700" : "text-red-700"}`}
                          >
                            {l.label}
                            {l.count > 1 ? ` ×${l.count}` : ""} ({l.points > 0 ? "+" : ""}
                            {l.points})
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold">
                      {sc?.points}
                      {sv && sv.points !== sc?.points ? (
                        <div className="text-[10px] font-normal text-muted-foreground">
                          đã chốt {sv.points}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Xếp loại tuần – ${s.fullName}`}
                        className={`h-8 rounded-md border bg-background px-2 ${levelOf(s.id) === "chua_dat" ? "text-red-700" : ""}`}
                        value={levelOf(s.id)}
                        onChange={(e) =>
                          setChosen((c) => ({ ...c, [s.id]: e.target.value as Level }))
                        }
                      >
                        {LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {LEVEL_LABEL[l]}
                            {l === sc?.level ? " (gợi ý)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Điểm tính từ ghi nhận theo tiết, điểm danh và khen thưởng – vi phạm của tuần. Giáo viên có
        thể đổi mức rồi bấm Chốt tuần; kết quả các tuần được cộng dồn ở trang Báo cáo và gợi ý khi
        đánh giá rèn luyện.
      </p>
      {ruleOpen && state ? (
        <RuleDialog
          classId={classId}
          rule={state.rule}
          onClose={() => setRuleOpen(false)}
          onSaved={() => {
            setRuleOpen(false);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

const RULE_FIELDS: [keyof WeeklyRule, string][] = [
  ["start", "Điểm đầu tuần"],
  ["phat_bieu", "Mỗi lần phát biểu"],
  ["phat_bieu_cap", "Phát biểu: cộng tối đa/tuần"],
  ["len_bang", "Mỗi lần lên bảng"],
  ["lam_tot", "Làm tốt nhiệm vụ"],
  ["khong_lam_bai", "Không làm bài tập"],
  ["khong_chuan_bi", "Không chuẩn bị bài"],
  ["mat_trat_tu", "Mất trật tự"],
  ["di_muon", "Đi muộn"],
  ["co_phep", "Nghỉ có phép"],
  ["khong_phep", "Nghỉ không phép"],
  ["tot", "Mốc Tốt (từ)"],
  ["kha", "Mốc Khá (từ)"],
  ["dat", "Mốc Đạt (từ)"],
];

function RuleDialog({
  classId,
  rule,
  onClose,
  onSaved,
}: {
  classId: string;
  rule: WeeklyRule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(saveWeeklyRule);
  const [r, setR] = useState<WeeklyRule>(rule);
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogTitle>Bảng điểm thi đua tuần</DialogTitle>
        <DialogDescription>Số âm là trừ điểm. Áp dụng cho các tuần chưa chốt.</DialogDescription>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {RULE_FIELDS.map(([k, label]) => (
            <label key={k} className="grid gap-1">
              <span>{label}</span>
              <Input
                type="number"
                value={r[k]}
                onChange={(e) => setR({ ...r, [k]: Math.round(Number(e.target.value) || 0) })}
              />
            </label>
          ))}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => setR(DEFAULT_WEEKLY_RULE)}>
            Về mặc định
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              onClick={() =>
                void save({ data: { classId, rule: r } }).then(onSaved, (e) =>
                  setError(errorText(e)),
                )
              }
            >
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
