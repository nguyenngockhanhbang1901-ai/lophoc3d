import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";
import { newSlideContent, newSlideLessonKey } from "@/lib/slides/model";

let db: FakeDb;
vi.mock("./db.server", () => ({
  examDb: () => db,
  ownedClass: async (owner: string, classId: string) => {
    const c = db.rows("exam_classes").find((r) => r["id"] === classId && r["owner_id"] === owner);
    if (!c) throw new Error("Không tìm thấy lớp học");
    return c;
  },
}));

const {
  assignLesson,
  teacherLessonAssignments,
  studentLessons,
  openLessonForStudent,
  unassignLesson,
} = await import("./lessons.server");

const OWNER = "aaaaaaaa-0000-4000-8000-000000000000";
const CLASS = "eeeeeeee-0000-4000-8000-000000000000";
const S1 = "cccccccc-0000-4000-8000-000000000001";
const KEY = newSlideLessonKey(() => "hinhchop");
const T0 = new Date("2026-11-27T08:00:00+07:00").getTime();

beforeEach(() => {
  db = new FakeDb();
  db.rows("exam_classes").push({ id: CLASS, owner_id: OWNER, name: "11A1" });
  db.rows("exam_students").push({ id: S1, class_id: CLASS, locked: false });
  db.rows("lessons").push({
    owner_id: OWNER,
    lesson_key: KEY,
    title: "Hình chóp",
    content: newSlideContent(),
  });
  db.rows("lessons").push({ owner_id: OWNER, lesson_key: "bai12", title: "Bài 12", content: {} });
});

describe("lessons for exam classes", () => {
  it("gives a slide lesson, tells the students and counts who opened it", async () => {
    await expect(assignLesson(OWNER, CLASS, "bai12", null, T0)).rejects.toThrow("dạng slide");
    await expect(assignLesson("x", CLASS, KEY, null, T0)).rejects.toThrow();
    const later = new Date(T0 + 3600_000).toISOString();
    const r = await assignLesson(OWNER, CLASS, KEY, later, T0);
    expect(r.created).toBe(true);
    expect(db.rows("exam_notifications")[0]).toMatchObject({ kind: "new_lesson", student_id: S1 });

    let list = await studentLessons(S1, CLASS, T0);
    expect(list[0]).toMatchObject({ title: "Hình chóp", open: false, viewed: false });
    await expect(openLessonForStudent(S1, CLASS, r.id, T0)).rejects.toThrow("mở lúc");
    await expect(openLessonForStudent(S1, "other", r.id, T0 + 4000_000)).rejects.toThrow();
    const opened = await openLessonForStudent(S1, CLASS, r.id, T0 + 4000_000);
    expect(opened.title).toBe("Hình chóp");
    await openLessonForStudent(S1, CLASS, r.id, T0 + 4100_000);
    expect(db.rows("exam_lesson_views")[0]).toMatchObject({ open_count: 2 });
    list = await studentLessons(S1, CLASS, T0 + 4200_000);
    expect(list[0]).toMatchObject({ open: true, viewed: true });

    const again = await assignLesson(OWNER, CLASS, KEY, null, T0 + 5000_000);
    expect(again).toEqual({ id: r.id, created: false });
    const teacher = await teacherLessonAssignments(OWNER);
    expect(teacher[0]).toMatchObject({ className: "11A1", viewedCount: 1, studentCount: 1 });
    await unassignLesson(OWNER, r.id);
    expect(await teacherLessonAssignments(OWNER)).toEqual([]);
  });
});
