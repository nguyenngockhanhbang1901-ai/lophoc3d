// Nhật ký trao đổi với phụ huynh: who was contacted, how, what was said, the result, and an
// optional follow-up date that shows up in "Việc cần làm hôm nay".
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Phone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { listProfiles, type StudentProfile } from "@/lib/homeroom/homeroom.functions";
import {
  CHANNEL_LABEL,
  deleteParentContact,
  listParentContacts,
  saveParentContact,
  type Channel,
  type ParentContact,
} from "@/lib/homeroom/records.functions";
import { displayDay, vnToday } from "@/lib/homeroom/periods";
import { byGivenName, isActive, primaryGuardian } from "@/lib/homeroom/profiles";
import { errorText, type HomeroomContext } from "./HomeroomFrame";

export function ParentsPage({ cls }: HomeroomContext) {
  const loadProfiles = useServerFn(listProfiles);
  const loadContacts = useServerFn(listParentContacts);
  const save = useServerFn(saveParentContact);
  const remove = useServerFn(deleteParentContact);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [items, setItems] = useState<ParentContact[] | null>(null);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Partial<ParentContact> | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        loadProfiles({ data: { classId: cls.id } }),
        loadContacts({ data: { classId: cls.id } }),
      ]);
      setStudents(p.sort(byGivenName));
      setItems(c);
      setError("");
    } catch (e) {
      setItems([]);
      setError(errorText(e));
    }
  }, [loadProfiles, loadContacts, cls.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const shown = (items ?? []).filter((c) => !filter || c.studentId === filter);
  const today = vnToday();
  const due = (items ?? []).filter((c) => c.followUp && !c.followUpDone && c.followUp <= today);

  return (
    <div className="grid gap-4">
      <section className="site-card flex flex-wrap items-center gap-2 p-4">
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Lọc theo học sinh"
        >
          <option value="">Tất cả học sinh</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
        <Button
          className="ml-auto"
          size="sm"
          onClick={() =>
            setEditing({
              day: today,
              channel: "dien_thoai",
              ...(filter ? { studentId: filter } : {}),
            })
          }
        >
          <Plus /> Ghi lần trao đổi
        </Button>
      </section>
      {due.length ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          {due.length} việc cần liên hệ lại đã đến hạn:{" "}
          {due.map((d) => byId.get(d.studentId)?.fullName).join(", ")}.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items === null ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : !shown.length ? (
        <p className="text-muted-foreground">Chưa có lần trao đổi nào.</p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((c) => {
            const s = byId.get(c.studentId);
            return (
              <li key={c.id} className="site-card grid gap-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{s?.fullName ?? "?"}</b>
                  <span className="text-muted-foreground">
                    {displayDay(c.day)} · {CHANNEL_LABEL[c.channel]}
                    {c.guardianName ? ` · ${c.guardianName}` : ""}
                  </span>
                  {c.followUp ? (
                    c.followUpDone ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Đã liên hệ lại
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`rounded px-2 py-0.5 text-xs ${c.followUp <= today ? "bg-amber-100 text-amber-800" : "bg-muted"}`}
                        title="Bấm khi đã liên hệ lại"
                        onClick={() =>
                          void save({
                            data: {
                              classId: cls.id,
                              id: c.id,
                              studentId: c.studentId,
                              day: c.day,
                              guardianName: c.guardianName,
                              channel: c.channel,
                              content: c.content,
                              result: c.result,
                              followUp: c.followUp,
                              followUpDone: true,
                            },
                          }).then(load, (e) => setError(errorText(e)))
                        }
                      >
                        Liên hệ lại {displayDay(c.followUp)} ✓
                      </button>
                    )
                  ) : null}
                  <div className="ml-auto flex">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                      Sửa
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Xóa"
                      onClick={() => {
                        if (confirm("Xóa lần trao đổi này?"))
                          void remove({ data: { id: c.id } }).then(load, (e) =>
                            setError(errorText(e)),
                          );
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap">{c.content}</p>
                {c.result ? <p className="text-muted-foreground">Kết quả: {c.result}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <ContactDialog
          classId={cls.id}
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

function ContactDialog({
  classId,
  students,
  value,
  onClose,
  onSaved,
}: {
  classId: string;
  students: StudentProfile[];
  value: Partial<ParentContact>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(saveParentContact);
  const [studentId, setStudentId] = useState(value.studentId ?? "");
  const student = students.find((s) => s.id === studentId);
  const main = student ? primaryGuardian(student.guardians) : null;
  const [guardianName, setGuardianName] = useState(value.guardianName ?? "");
  const [day, setDay] = useState(value.day ?? vnToday());
  const [channel, setChannel] = useState<Channel>(value.channel ?? "dien_thoai");
  const [content, setContent] = useState(value.content ?? "");
  const [result, setResult] = useState(value.result ?? "");
  const [followUp, setFollowUp] = useState(value.followUp ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!value.id && main && !guardianName)
      setGuardianName(`${main.fullName}${main.relation ? ` (${main.relation})` : ""}`);
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogTitle>
          {value.id ? "Sửa lần trao đổi" : "Ghi lần trao đổi với phụ huynh"}
        </DialogTitle>
        <DialogDescription>Nội dung chỉ giáo viên chủ nhiệm xem được.</DialogDescription>
        <div className="grid gap-3 text-sm">
          <div>
            <Label htmlFor="pc-student">Học sinh</Label>
            <select
              id="pc-student"
              className="h-9 w-full rounded-md border bg-background px-2"
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setGuardianName("");
              }}
            >
              <option value="">— Chọn học sinh —</option>
              {students
                .filter((s) => isActive(s.status) || s.id === studentId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
            </select>
            {student?.guardians.length ? (
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {student.guardians.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1">
                    {g.fullName}
                    {g.relation ? ` (${g.relation})` : ""}
                    {g.phone ? (
                      <a
                        className="inline-flex items-center gap-0.5 text-primary"
                        href={`tel:${g.phone}`}
                      >
                        <Phone className="h-3 w-3" />
                        {g.phone}
                      </a>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="pc-day">Ngày</Label>
              <Input id="pc-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pc-channel">Hình thức</Label>
              <select
                id="pc-channel"
                className="h-9 w-full rounded-md border bg-background px-2"
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
              >
                {(Object.entries(CHANNEL_LABEL) as [Channel, string][]).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="pc-guardian">Người được liên hệ</Label>
            <Input
              id="pc-guardian"
              maxLength={100}
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pc-content">Nội dung trao đổi</Label>
            <Textarea
              id="pc-content"
              rows={4}
              maxLength={2000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pc-result">Kết quả xử lý</Label>
            <Textarea
              id="pc-result"
              rows={2}
              maxLength={1000}
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pc-follow">Hẹn liên hệ lại (không bắt buộc)</Label>
            <Input
              id="pc-follow"
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </div>
          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              disabled={busy || !studentId || !content.trim()}
              onClick={() => {
                setBusy(true);
                void save({
                  data: {
                    classId,
                    ...(value.id ? { id: value.id } : {}),
                    studentId,
                    day,
                    guardianName: guardianName.trim(),
                    channel,
                    content: content.trim(),
                    result: result.trim(),
                    followUp: followUp || null,
                    followUpDone:
                      value.followUp === (followUp || null) ? (value.followUpDone ?? false) : false,
                  },
                })
                  .then(onSaved)
                  .catch((e) => {
                    setError(errorText(e));
                    setBusy(false);
                  });
              }}
            >
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
