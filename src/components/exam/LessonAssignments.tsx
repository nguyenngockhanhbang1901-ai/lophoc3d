// Teacher: give slide lessons (made in Soạn bài) to exam classes, read-only for students.
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listExamClasses, type ExamClassSummary } from "@/lib/exam/classes.functions";
import { giveLesson, listLessonAssignments, takeBackLesson } from "@/lib/exam/lessons.functions";
import type { TeacherLessonAssignment } from "@/lib/exam/lessons.server";
import { listSlideLessons, type SlideLessonRow } from "@/lib/slides/storage";

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Có lỗi, hãy thử lại";
}
const TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
/** <input type="datetime-local"> in Việt Nam time → ISO. */
function fromLocalInput(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}

export function LessonAssignments({ ownerId }: { ownerId: string }) {
  const loadClasses = useServerFn(listExamClasses);
  const loadItems = useServerFn(listLessonAssignments);
  const give = useServerFn(giveLesson);
  const takeBack = useServerFn(takeBackLesson);
  const [classes, setClasses] = useState<ExamClassSummary[]>([]);
  const [lessons, setLessons] = useState<SlideLessonRow[]>([]);
  const [items, setItems] = useState<TeacherLessonAssignment[] | null>(null);
  const [classId, setClassId] = useState("");
  const [lessonKey, setLessonKey] = useState("");
  const [later, setLater] = useState(false);
  const [opensAt, setOpensAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(() => {
    loadItems()
      .then((r) => setItems(r.items))
      .catch((e) => setError(message(e)));
  }, [loadItems]);
  useEffect(() => {
    refresh();
    loadClasses()
      .then(setClasses)
      .catch(() => undefined);
    listSlideLessons(supabase, ownerId)
      .then((r) => setLessons(r.lessons))
      .catch(() => undefined);
  }, [refresh, loadClasses, ownerId]);

  return (
    <section className="mt-8 grid gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen size={20} />
          Giao bài giảng cho lớp
        </h2>
        <p className="text-sm text-muted-foreground">
          Học sinh mở bài giảng dạng slide (soạn ở mục Soạn bài) trong tab Bài giảng, chỉ xem, không
          sửa được. Bài 11, 11.1, 12 vẫn dùng mã lớp như cũ.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNote("");
          give({
            data: {
              classId,
              lessonKey,
              opensAt: later && opensAt ? fromLocalInput(opensAt) : null,
            },
          })
            .then((r) => {
              setNote(
                r.created ? "Đã giao bài giảng, học sinh nhận được thông báo." : "Đã đổi giờ mở.",
              );
              refresh();
            })
            .catch((err) => setError(message(err)))
            .finally(() => setBusy(false));
        }}
      >
        <label className="grid gap-1 text-sm">
          Lớp
          <select
            className="entry-select"
            required
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">Chọn lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Bài giảng
          <select
            className="entry-select"
            required
            value={lessonKey}
            onChange={(e) => setLessonKey(e.target.value)}
          >
            <option value="">
              {lessons.length ? "Chọn bài giảng" : "Chưa có bài giảng slide"}
            </option>
            {lessons.map((l) => (
              <option key={l.lesson_key} value={l.lesson_key}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} />
          Hẹn giờ mở
        </label>
        {later && (
          <label className="grid gap-1 text-sm">
            Mở lúc (giờ Việt Nam)
            <Input
              type="datetime-local"
              required
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
            />
          </label>
        )}
        <Button disabled={busy || !classId || !lessonKey}>
          {busy ? "Đang giao…" : "Giao bài giảng"}
        </Button>
      </form>
      {error && <p className="error-note">{error}</p>}
      {note && <p className="text-sm text-green-700">{note}</p>}
      {items === null ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : !items.length ? (
        <p className="text-sm text-muted-foreground">Chưa giao bài giảng nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2">Bài giảng</th>
                <th className="p-2">Lớp</th>
                <th className="p-2">Mở từ</th>
                <th className="p-2">Đã xem</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b last:border-0">
                  <td className="p-2 font-medium">{it.title}</td>
                  <td className="p-2">{it.className}</td>
                  <td className="p-2 whitespace-nowrap">{TIME.format(new Date(it.opensAt))}</td>
                  <td className="p-2">
                    {it.viewedCount}/{it.studentCount} em
                  </td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Bỏ giao bài giảng này"
                      onClick={() => {
                        if (!window.confirm(`Bỏ giao "${it.title}" cho lớp ${it.className}?`))
                          return;
                        takeBack({ data: { id: it.id } })
                          .then(refresh)
                          .catch((e) => setError(message(e)));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
