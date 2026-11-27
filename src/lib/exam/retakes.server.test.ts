import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";

let db: FakeDb;
vi.mock("./db.server", () => ({
  examDb: () => db,
  studentsInClass: async (classId: string, ids: string[]) =>
    db
      .rows("exam_students")
      .filter((s) => s["class_id"] === classId && ids.includes(s["id"] as string))
      .map((s) => s["id"] as string),
}));

const { grantRetakes, revokeGrant, grantsByStudent, notifyNewAssignment, studentNotices } =
  await import("./retakes.server");

const OWNER = "aaaaaaaa-0000-4000-8000-000000000000";
const OTHER = "ffffffff-0000-4000-8000-000000000000";
const CLASS = "eeeeeeee-0000-4000-8000-000000000000";
const A = "dddddddd-0000-4000-8000-000000000000";
const S1 = "cccccccc-0000-4000-8000-000000000001";
const S2 = "cccccccc-0000-4000-8000-000000000002";
const STRANGER = "cccccccc-0000-4000-8000-000000000009";
const T0 = new Date("2026-11-27T08:00:00+07:00").getTime();

beforeEach(() => {
  db = new FakeDb();
  db.rows("exam_assignments").push({
    id: A,
    owner_id: OWNER,
    class_id: CLASS,
    title: "Kiểm tra 15 phút",
    opens_at: new Date(T0).toISOString(),
    closes_at: new Date(T0 + 12 * 3600_000).toISOString(),
  });
  db.rows("exam_students").push(
    { id: S1, class_id: CLASS, locked: false },
    { id: S2, class_id: CLASS, locked: false },
    { id: STRANGER, class_id: "other", locked: false },
  );
});

describe("retake permissions", () => {
  it("grants only to the teacher's own students and tells them", async () => {
    await expect(grantRetakes(OTHER, A, [S1], "", null, T0)).rejects.toThrow("Không tìm thấy");
    const r = await grantRetakes(
      OWNER,
      A,
      [S1, S2, STRANGER],
      "Mất điện",
      new Date(T0 + 3600_000).toISOString(),
      T0,
    );
    expect(r.granted).toBe(2);
    expect(db.rows("exam_retake_grants")).toHaveLength(2);
    const notes = db.rows("exam_notifications");
    expect(notes.map((n) => n["student_id"]).sort()).toEqual([S1, S2]);
    expect(notes[0]!["body"]).toMatch(/Kiểm tra 15 phút.*hạn đến.*Mất điện/);
  });

  it("replaces an unused permission and can take it back", async () => {
    await grantRetakes(OWNER, A, [S1], "", null, T0);
    await grantRetakes(OWNER, A, [S1], "lần hai", null, T0 + 1000);
    const map = await grantsByStudent(A, T0 + 2000);
    expect(map.get(S1)).toMatchObject({ total: 1, active: { reason: "lần hai" } });
    const id = map.get(S1)!.active!.id;
    await expect(revokeGrant(OTHER, id, T0 + 3000)).rejects.toThrow();
    await revokeGrant(OWNER, id, T0 + 3000);
    expect((await grantsByStudent(A, T0 + 4000)).get(S1)?.active).toBeNull();
    await expect(revokeGrant(OWNER, id, T0 + 5000)).rejects.toThrow("đã thu hồi");
    expect(db.rows("exam_notifications").at(-1)!["kind"]).toBe("retake_revoked");
  });

  it("refuses an expiry in the past", async () => {
    await expect(
      grantRetakes(OWNER, A, [S1], "", new Date(T0 - 1).toISOString(), T0),
    ).rejects.toThrow("Hạn dùng");
  });
});

describe("student notices", () => {
  it("announces new assignments and reminds about ones closing soon", async () => {
    await notifyNewAssignment(
      {
        id: A,
        title: "Kiểm tra 15 phút",
        class_id: CLASS,
        owner_id: OWNER,
        opens_at: new Date(T0).toISOString(),
        closes_at: new Date(T0 + 12 * 3600_000).toISOString(),
      },
      T0,
    );
    let list = await studentNotices(S1, CLASS, T0 + 60_000);
    expect(list.map((n) => n.kind)).toEqual(["closing_soon", "new_assignment"]);
    // once started, no reminder
    db.rows("exam_attempts").push({ id: db.id(), student_id: S1, assignment_id: A });
    list = await studentNotices(S1, CLASS, T0 + 60_000);
    expect(list.map((n) => n.kind)).toEqual(["new_assignment"]);
    expect(list[0]!.read).toBe(false);
  });
});
