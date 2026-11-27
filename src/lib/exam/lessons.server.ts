// Slide lessons given to an exam class to read. The lesson itself stays in the teacher's
// `lessons` table; students get its content only through these server functions, read-only,
// and only once it is open. Bài 11, 11.1, 12 (built-in lessons) are never touched here.
import { examDb, ownedClass } from "./db.server";
import { isSlideLessonKey, parseSlideContent } from "@/lib/slides/model";
import type { SlideContent } from "@/lib/slides/types";
import { noticeTime } from "./retakes.server";

export interface TeacherLessonAssignment {
  id: string;
  classId: string;
  className: string;
  lessonKey: string;
  title: string;
  opensAt: string;
  studentCount: number;
  viewedCount: number;
}

async function lessonTitle(ownerId: string, lessonKey: string): Promise<string | null> {
  const { data } = await examDb()
    .from("lessons")
    .select("title")
    .eq("owner_id", ownerId)
    .eq("lesson_key", lessonKey)
    .maybeSingle();
  return data ? (data as { title: string }).title : null;
}

/** Give a slide lesson to a class (again: only the opening time changes). */
export async function assignLesson(
  ownerId: string,
  classId: string,
  lessonKey: string,
  opensAt: string | null,
  now = Date.now(),
): Promise<{ id: string; created: boolean }> {
  if (!isSlideLessonKey(lessonKey)) throw new Error("Chỉ giao được bài giảng dạng slide");
  await ownedClass(ownerId, classId);
  const title = await lessonTitle(ownerId, lessonKey);
  if (title === null) throw new Error("Không tìm thấy bài giảng");
  const db = examDb();
  const at = opensAt ?? new Date(now).toISOString();
  const { data: existing } = await db
    .from("exam_lesson_assignments")
    .select("id")
    .eq("class_id", classId)
    .eq("lesson_key", lessonKey)
    .maybeSingle();
  if (existing) {
    const id = (existing as { id: string }).id;
    await db.from("exam_lesson_assignments").update({ opens_at: at }).eq("id", id);
    return { id, created: false };
  }
  const { data: row, error } = await db
    .from("exam_lesson_assignments")
    .insert({ class_id: classId, owner_id: ownerId, lesson_key: lessonKey, opens_at: at })
    .select("id")
    .single();
  if (error || !row) throw new Error("Không giao được bài giảng");
  const id = (row as { id: string }).id;
  const { data: students } = await db
    .from("exam_students")
    .select("id")
    .eq("class_id", classId)
    .eq("locked", false);
  const ids = ((students ?? []) as { id: string }[]).map((s) => s.id);
  const body = (
    `Bài giảng mới "${title}"` +
    (new Date(at).getTime() > now + 60_000 ? `, mở lúc ${noticeTime(at)}` : "") +
    "."
  ).slice(0, 500);
  for (let i = 0; i < ids.length; i += 200)
    await db.from("exam_notifications").insert(
      ids.slice(i, i + 200).map((student_id) => ({
        student_id,
        owner_id: ownerId,
        lesson_assignment_id: id,
        kind: "new_lesson",
        body,
        created_at: new Date(now).toISOString(),
      })),
    );
  return { id, created: true };
}

export async function unassignLesson(ownerId: string, id: string) {
  const { error } = await examDb()
    .from("exam_lesson_assignments")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);
  if (error) throw new Error("Không bỏ giao được bài giảng");
  return { ok: true };
}

export async function teacherLessonAssignments(
  ownerId: string,
): Promise<TeacherLessonAssignment[]> {
  const db = examDb();
  const { data } = await db
    .from("exam_lesson_assignments")
    .select("id,class_id,lesson_key,opens_at")
    .eq("owner_id", ownerId)
    .order("opens_at", { ascending: false });
  const rows = (data ?? []) as {
    id: string;
    class_id: string;
    lesson_key: string;
    opens_at: string;
  }[];
  if (!rows.length) return [];
  const [{ data: classes }, { data: lessons }, { data: students }, { data: views }] =
    await Promise.all([
      db.from("exam_classes").select("id,name").eq("owner_id", ownerId),
      db
        .from("lessons")
        .select("lesson_key,title")
        .eq("owner_id", ownerId)
        .in(
          "lesson_key",
          rows.map((r) => r.lesson_key),
        ),
      db
        .from("exam_students")
        .select("class_id")
        .in(
          "class_id",
          rows.map((r) => r.class_id),
        ),
      db.from("exam_lesson_views").select("lesson_assignment_id").eq("owner_id", ownerId),
    ]);
  const className = new Map(
    ((classes ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );
  const title = new Map(
    ((lessons ?? []) as { lesson_key: string; title: string }[]).map((l) => [
      l.lesson_key,
      l.title,
    ]),
  );
  const count = (list: unknown[] | null, key: string) => {
    const m = new Map<string, number>();
    for (const r of (list ?? []) as Record<string, string>[])
      m.set(r[key]!, (m.get(r[key]!) ?? 0) + 1);
    return m;
  };
  const perClass = count(students, "class_id");
  const perLesson = count(views, "lesson_assignment_id");
  return rows.map((r) => ({
    id: r.id,
    classId: r.class_id,
    className: className.get(r.class_id) ?? "",
    lessonKey: r.lesson_key,
    title: title.get(r.lesson_key) ?? "(Bài giảng đã bị xóa)",
    opensAt: r.opens_at,
    studentCount: perClass.get(r.class_id) ?? 0,
    viewedCount: perLesson.get(r.id) ?? 0,
  }));
}

export interface StudentLesson {
  id: string;
  title: string;
  opensAt: string;
  open: boolean;
  viewed: boolean;
  lastOpenedAt: string | null;
}

export async function studentLessons(
  studentId: string,
  classId: string,
  now = Date.now(),
): Promise<StudentLesson[]> {
  const db = examDb();
  const { data } = await db
    .from("exam_lesson_assignments")
    .select("id,owner_id,lesson_key,opens_at")
    .eq("class_id", classId)
    .order("opens_at", { ascending: false });
  const rows = (data ?? []) as {
    id: string;
    owner_id: string;
    lesson_key: string;
    opens_at: string;
  }[];
  if (!rows.length) return [];
  const [{ data: lessons }, { data: views }] = await Promise.all([
    db
      .from("lessons")
      .select("lesson_key,title")
      .eq("owner_id", rows[0]!.owner_id)
      .in(
        "lesson_key",
        rows.map((r) => r.lesson_key),
      ),
    db
      .from("exam_lesson_views")
      .select("lesson_assignment_id,last_opened_at")
      .eq("student_id", studentId),
  ]);
  const title = new Map(
    ((lessons ?? []) as { lesson_key: string; title: string }[]).map((l) => [
      l.lesson_key,
      l.title,
    ]),
  );
  const seen = new Map(
    ((views ?? []) as { lesson_assignment_id: string; last_opened_at: string }[]).map((v) => [
      v.lesson_assignment_id,
      v.last_opened_at,
    ]),
  );
  return rows
    .filter((r) => title.has(r.lesson_key))
    .map((r) => ({
      id: r.id,
      title: title.get(r.lesson_key)!,
      opensAt: r.opens_at,
      open: new Date(r.opens_at).getTime() <= now,
      viewed: seen.has(r.id),
      lastOpenedAt: seen.get(r.id) ?? null,
    }));
}

/** The lesson's slides for one of the class's students, and a note that it was opened. */
export async function openLessonForStudent(
  studentId: string,
  classId: string,
  id: string,
  now = Date.now(),
): Promise<{ title: string; content: SlideContent }> {
  const db = examDb();
  const { data } = await db
    .from("exam_lesson_assignments")
    .select("id,owner_id,lesson_key,opens_at,class_id")
    .eq("id", id)
    .eq("class_id", classId)
    .maybeSingle();
  if (!data) throw new Error("Không tìm thấy bài giảng");
  const a = data as { id: string; owner_id: string; lesson_key: string; opens_at: string };
  if (new Date(a.opens_at).getTime() > now)
    throw new Error(`Bài giảng mở lúc ${noticeTime(a.opens_at)}`);
  const { data: lesson } = await db
    .from("lessons")
    .select("title,content")
    .eq("owner_id", a.owner_id)
    .eq("lesson_key", a.lesson_key)
    .maybeSingle();
  const l = lesson as { title: string; content: unknown } | null;
  const content = l ? parseSlideContent(l.content) : null;
  if (!l || !content) throw new Error("Bài giảng không còn nữa");
  const at = new Date(now).toISOString();
  const { data: seen } = await db
    .from("exam_lesson_views")
    .select("open_count")
    .eq("lesson_assignment_id", a.id)
    .eq("student_id", studentId)
    .maybeSingle();
  if (seen)
    await db
      .from("exam_lesson_views")
      .update({ last_opened_at: at, open_count: (seen as { open_count: number }).open_count + 1 })
      .eq("lesson_assignment_id", a.id)
      .eq("student_id", studentId);
  else
    await db.from("exam_lesson_views").insert({
      lesson_assignment_id: a.id,
      student_id: studentId,
      owner_id: a.owner_id,
      first_opened_at: at,
      last_opened_at: at,
      open_count: 1,
    });
  return { title: l.title, content };
}
