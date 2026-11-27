// Teacher permissions to retake an assignment, and the notices students see about them and
// about new assignments. Server-only: every write goes through the service role after the
// caller's ownership has been checked here.
import { examDb, studentsInClass } from "./db.server";
import { grantActive, type GrantRow } from "./attempt.server";

export type NoticeKind = "new_assignment" | "retake_granted" | "retake_revoked";

interface AssignmentLite {
  id: string;
  title: string;
  class_id: string;
  owner_id: string;
}

async function ownedAssignment(ownerId: string, assignmentId: string): Promise<AssignmentLite> {
  const { data } = await examDb()
    .from("exam_assignments")
    .select("id,title,class_id,owner_id")
    .eq("id", assignmentId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data) throw new Error("Không tìm thấy bài giao");
  return data as AssignmentLite;
}

const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
});
export function noticeTime(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/**
 * Give the chosen students one more attempt each. An unused permission they already hold is
 * replaced, so a student never holds two at once.
 */
export async function grantRetakes(
  ownerId: string,
  assignmentId: string,
  studentIds: string[],
  reason: string,
  expiresAt: string | null,
  now = Date.now(),
): Promise<{ granted: number }> {
  if (expiresAt && new Date(expiresAt).getTime() <= now)
    throw new Error("Hạn dùng phải sau thời điểm hiện tại");
  const assignment = await ownedAssignment(ownerId, assignmentId);
  const ids = await studentsInClass(assignment.class_id, [...new Set(studentIds)]);
  if (!ids.length) throw new Error("Chưa chọn học sinh nào trong lớp này");
  const db = examDb();
  const at = new Date(now).toISOString();
  await db
    .from("exam_retake_grants")
    .update({ revoked_at: at })
    .eq("assignment_id", assignment.id)
    .in("student_id", ids)
    .is("used_at", null)
    .is("revoked_at", null);
  const cleanReason = reason.trim().slice(0, 300);
  const { error } = await db.from("exam_retake_grants").insert(
    ids.map((student_id) => ({
      assignment_id: assignment.id,
      student_id,
      owner_id: ownerId,
      reason: cleanReason,
      expires_at: expiresAt,
      created_at: at,
    })),
  );
  if (error) throw new Error("Không cấp được quyền thi lại");
  const body =
    `Em được làm lại bài "${assignment.title}"` +
    (expiresAt ? `, hạn đến ${noticeTime(expiresAt)}` : "") +
    (cleanReason ? `. Lý do: ${cleanReason}` : "") +
    ".";
  await db.from("exam_notifications").insert(
    ids.map((student_id) => ({
      student_id,
      owner_id: ownerId,
      assignment_id: assignment.id,
      kind: "retake_granted",
      body: body.slice(0, 500),
      created_at: at,
    })),
  );
  return { granted: ids.length };
}

/** Take back a permission that has not been used yet. */
export async function revokeGrant(ownerId: string, grantId: string, now = Date.now()) {
  const db = examDb();
  const { data } = await db
    .from("exam_retake_grants")
    .update({ revoked_at: new Date(now).toISOString() })
    .eq("id", grantId)
    .eq("owner_id", ownerId)
    .is("used_at", null)
    .is("revoked_at", null)
    .select("*")
    .maybeSingle();
  if (!data) throw new Error("Quyền này đã được dùng hoặc đã thu hồi");
  const g = data as GrantRow & { owner_id: string };
  const { data: a } = await db
    .from("exam_assignments")
    .select("title")
    .eq("id", g.assignment_id)
    .maybeSingle();
  await db.from("exam_notifications").insert({
    student_id: g.student_id,
    owner_id: ownerId,
    assignment_id: g.assignment_id,
    kind: "retake_revoked",
    body: `Quyền làm lại bài "${(a as { title: string } | null)?.title ?? ""}" đã được thu hồi.`,
    created_at: new Date(now).toISOString(),
  });
  return { ok: true };
}

/** Grants of one assignment, keyed by student: the usable one and how many were given. */
export async function grantsByStudent(
  assignmentId: string,
  now = Date.now(),
): Promise<Map<string, { active: GrantRow | null; total: number }>> {
  const { data } = await examDb()
    .from("exam_retake_grants")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("created_at");
  const map = new Map<string, { active: GrantRow | null; total: number }>();
  for (const g of (data ?? []) as GrantRow[]) {
    const entry = map.get(g.student_id) ?? { active: null, total: 0 };
    if (!g.revoked_at) entry.total++;
    if (!entry.active && grantActive(g, now)) entry.active = g;
    map.set(g.student_id, entry);
  }
  return map;
}

/** Tell every student of the class that a new assignment is waiting. */
export async function notifyNewAssignment(
  assignment: AssignmentLite & { opens_at: string; closes_at: string },
  now = Date.now(),
) {
  const db = examDb();
  const { data } = await db
    .from("exam_students")
    .select("id")
    .eq("class_id", assignment.class_id)
    .eq("locked", false);
  const ids = ((data ?? []) as { id: string }[]).map((s) => s.id);
  if (!ids.length) return;
  const body = `Bài mới "${assignment.title}": mở ${noticeTime(assignment.opens_at)}, đóng ${noticeTime(assignment.closes_at)}.`;
  const at = new Date(now).toISOString();
  for (let i = 0; i < ids.length; i += 200)
    await db.from("exam_notifications").insert(
      ids.slice(i, i + 200).map((student_id) => ({
        student_id,
        owner_id: assignment.owner_id,
        assignment_id: assignment.id,
        kind: "new_assignment",
        body: body.slice(0, 500),
        created_at: at,
      })),
    );
}

export interface Notice {
  id: string;
  kind: NoticeKind | "closing_soon";
  assignmentId: string | null;
  body: string;
  at: string;
  read: boolean;
}

/** How long before closing an untouched assignment is flagged. */
export const CLOSING_SOON_MS = 24 * 3600_000;

/**
 * The student's notices, newest first: the stored ones, plus a reminder for each open
 * assignment closing within a day that the student has not started yet.
 */
export async function studentNotices(
  studentId: string,
  classId: string,
  now = Date.now(),
): Promise<Notice[]> {
  const db = examDb();
  const [{ data: stored }, { data: open }] = await Promise.all([
    db
      .from("exam_notifications")
      .select("id,kind,assignment_id,body,created_at,read_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("exam_assignments")
      .select("id,title,opens_at,closes_at")
      .eq("class_id", classId)
      .lt("opens_at", new Date(now).toISOString())
      .gte("closes_at", new Date(now).toISOString()),
  ]);
  const soon = ((open ?? []) as { id: string; title: string; closes_at: string }[]).filter(
    (a) => new Date(a.closes_at).getTime() - now <= CLOSING_SOON_MS,
  );
  let started = new Set<string>();
  if (soon.length) {
    const { data: tried } = await db
      .from("exam_attempts")
      .select("assignment_id")
      .eq("student_id", studentId)
      .in(
        "assignment_id",
        soon.map((a) => a.id),
      );
    started = new Set(((tried ?? []) as { assignment_id: string }[]).map((t) => t.assignment_id));
  }
  const reminders: Notice[] = soon
    .filter((a) => !started.has(a.id))
    .map((a) => ({
      id: `soon-${a.id}`,
      kind: "closing_soon",
      assignmentId: a.id,
      body: `Bài "${a.title}" sắp đóng lúc ${noticeTime(a.closes_at)} mà em chưa làm.`,
      at: a.closes_at,
      read: false,
    }));
  const list = (
    (stored ?? []) as {
      id: number;
      kind: NoticeKind;
      assignment_id: string | null;
      body: string;
      created_at: string;
      read_at: string | null;
    }[]
  ).map((n) => ({
    id: String(n.id),
    kind: n.kind,
    assignmentId: n.assignment_id,
    body: n.body,
    at: n.created_at,
    read: n.read_at !== null,
  }));
  return [...reminders, ...list];
}

export async function markNoticesRead(studentId: string, now = Date.now()) {
  await examDb()
    .from("exam_notifications")
    .update({ read_at: new Date(now).toISOString() })
    .eq("student_id", studentId)
    .is("read_at", null);
}
