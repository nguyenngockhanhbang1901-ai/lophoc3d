// "Ghi nhận trong tiết": one tap per event (phát biểu, lên bảng, không làm bài…), with today's
// counts per student and an undo for the last tap. Records feed the bonus suggestion.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  behaviorOfDay,
  recordBehavior,
  undoBehavior,
  type BehaviorEvent,
} from "@/lib/gradebook/gradebook.functions";
import {
  BEHAVIOR_KINDS,
  BEHAVIOR_LABEL,
  BEHAVIOR_POSITIVE,
  type BehaviorKind,
} from "@/lib/gradebook/scores";
import { displayDay, vnToday, weekdayName } from "@/lib/homeroom/periods";
import { byGivenName, isActive, type StudentStatus } from "@/lib/homeroom/profiles";
import { errorText } from "./files";

const SHORT: Record<BehaviorKind, string> = {
  phat_bieu: "Phát biểu",
  len_bang: "Lên bảng",
  lam_tot: "Làm tốt",
  khong_lam_bai: "Không làm BT",
  khong_chuan_bi: "Không chuẩn bị",
  mat_trat_tu: "Mất trật tự",
};

export function BehaviorPanel({
  classId,
  subject,
  roster,
  note,
  onRecorded,
}: {
  classId: string;
  subject: string;
  roster: { id: string; fullName: string; status: StudentStatus }[];
  note?: string;
  onRecorded?: () => void;
}) {
  const load = useServerFn(behaviorOfDay);
  const record = useServerFn(recordBehavior);
  const undo = useServerFn(undoBehavior);
  const [day, setDay] = useState(vnToday());
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [last, setLast] = useState<(BehaviorEvent & { name: string }) | null>(null);
  const [error, setError] = useState("");
  const students = useMemo(
    () => roster.filter((s) => isActive(s.status)).sort(byGivenName),
    [roster],
  );

  const fetchDay = useCallback(async () => {
    try {
      setEvents(await load({ data: { classId, subject, day } }));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [load, classId, subject, day]);
  useEffect(() => {
    void fetchDay();
  }, [fetchDay]);

  const counts = useMemo(() => {
    const m = new Map<string, Partial<Record<BehaviorKind, number>>>();
    for (const e of events) {
      const c = m.get(e.studentId) ?? {};
      c[e.kind] = (c[e.kind] ?? 0) + 1;
      m.set(e.studentId, c);
    }
    return m;
  }, [events]);

  async function tap(studentId: string, name: string, kind: BehaviorKind) {
    try {
      const ev = await record({ data: { classId, studentId, kind, subject, day } });
      setEvents((x) => [...x, ev]);
      setLast({ ...ev, name });
      onRecorded?.();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="grid gap-3 pb-20">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          className="w-auto"
          value={day}
          max={vnToday()}
          onChange={(e) => e.target.value && setDay(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">
          {weekdayName(day)}, {displayDay(day)} · môn {subject} · {events.length} lượt ghi nhận
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Chạm một lần = một lần ghi nhận. Ban cán sự báo lại các tiết khác thì giáo viên chủ nhiệm
        ghi ở trang của lớp chủ nhiệm (đợt sau).
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ol className="site-card divide-y">
        {students.map((s, i) => {
          const c = counts.get(s.id) ?? {};
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}</span>
              <span className="min-w-[150px] flex-1 font-medium">{s.fullName}</span>
              <div className="flex flex-wrap gap-1">
                {BEHAVIOR_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-label={`${BEHAVIOR_LABEL[k]} – ${s.fullName}`}
                    className={`relative rounded-lg border px-2 py-1 text-xs ${BEHAVIOR_POSITIVE[k] ? "border-emerald-300 text-emerald-800 hover:bg-emerald-50" : "border-red-200 text-red-700 hover:bg-red-50"} ${c[k] ? (BEHAVIOR_POSITIVE[k] ? "bg-emerald-100" : "bg-red-100") : ""}`}
                    onClick={() => void tap(s.id, s.fullName, k)}
                  >
                    {SHORT[k]}
                    {c[k] ? <b className="ml-1">{c[k]}</b> : null}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      {last ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 p-3 backdrop-blur lg:left-[240px]">
          <div className="mx-auto flex max-w-3xl items-center gap-3 text-sm">
            <span className="flex-1">
              Đã ghi: <b>{last.name}</b> – {BEHAVIOR_LABEL[last.kind]}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const id = last.id;
                setLast(null);
                void undo({ data: { id } })
                  .then(() => {
                    setEvents((x) => x.filter((e) => e.id !== id));
                    onRecorded?.();
                  })
                  .catch((e) => setError(errorText(e)));
              }}
            >
              <Undo2 /> Hoàn tác
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
