// Student-side server functions. Students have no Supabase account: they sign in with the
// username and password the teacher issued, receive a random session token, and send it
// with every call. Only the token's hash is stored, so a database leak reveals no sessions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeLoginName, passwordProblem } from "./accounts";

const token = z.string().regex(/^[0-9a-f]{64}$/);
const FAILED_LIMIT = 10;
const FAILED_WINDOW_MS = 10 * 60_000;

export interface StudentProfile {
  fullName: string;
  username: string;
  birthDate: string | null;
  studentCode: string | null;
  className: string;
  schoolYear: string;
  subject: string;
  teacherName: string;
}

async function profileOf(student: import("./db.server").ExamStudentRow): Promise<StudentProfile> {
  const { examDb } = await import("./db.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cls } = await examDb()
    .from("exam_classes")
    .select("name,school_year,subject")
    .eq("id", student.class_id)
    .maybeSingle();
  let teacherName = "";
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(student.owner_id);
    const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    teacherName = String(meta["full_name"] ?? meta["name"] ?? "");
  } catch {
    teacherName = "";
  }
  const c = (cls ?? { name: "", school_year: "", subject: "" }) as {
    name: string;
    school_year: string;
    subject: string;
  };
  return {
    fullName: student.full_name,
    username: student.username,
    birthDate: student.birth_date,
    studentCode: student.student_code,
    className: c.name,
    schoolYear: c.school_year,
    subject: c.subject,
    teacherName,
  };
}

export const studentLogin = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(64) }),
  )
  .handler(async ({ data }): Promise<{ token: string; profile: StudentProfile }> => {
    const { examDb, requestUserAgent } = await import("./db.server");
    const { verifyPassword, newSessionToken, hashToken, SESSION_DAYS } = await import("./secrets");
    const db = examDb();
    const username = normalizeLoginName(data.username).slice(0, 64);
    const userAgent = requestUserAgent();
    const since = new Date(Date.now() - FAILED_WINDOW_MS).toISOString();
    const { count } = await db
      .from("exam_login_logs")
      .select("id", { count: "exact", head: true })
      .eq("username", username)
      .eq("success", false)
      .gte("at", since);
    if ((count ?? 0) >= FAILED_LIMIT)
      throw new Error(
        "Đăng nhập sai quá nhiều lần. Hãy thử lại sau 10 phút hoặc nhờ giáo viên cấp lại mật khẩu.",
      );

    const { data: row } = await db
      .from("exam_students")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    const student = row as import("./db.server").ExamStudentRow | null;
    const ok = student ? await verifyPassword(data.password, student.password_hash) : false;
    await db.from("exam_login_logs").insert({
      student_id: student?.id ?? null,
      username,
      success: ok && !student?.locked,
      user_agent: userAgent,
    });
    if (!student || !ok) throw new Error("Tên đăng nhập hoặc mật khẩu không đúng");
    if (student.locked) throw new Error("Tài khoản đang bị khóa. Hãy liên hệ giáo viên.");

    const sessionToken = newSessionToken();
    const { error } = await db.from("exam_student_sessions").insert({
      token_hash: await hashToken(sessionToken),
      student_id: student.id,
      user_agent: userAgent,
      expires_at: new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString(),
    });
    if (error) throw new Error("Không đăng nhập được, hãy thử lại");
    // Drop expired sessions of this student while we are here.
    await db
      .from("exam_student_sessions")
      .delete()
      .eq("student_id", student.id)
      .lt("expires_at", new Date().toISOString());
    return { token: sessionToken, profile: await profileOf(student) };
  });

export const studentLogout = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const { examDb } = await import("./db.server");
    const { hashToken } = await import("./secrets");
    await examDb()
      .from("exam_student_sessions")
      .delete()
      .eq("token_hash", await hashToken(data.token));
    return { ok: true };
  });

export const studentProfile = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }): Promise<StudentProfile> => {
    const { sessionStudent } = await import("./db.server");
    const { student } = await sessionStudent(data.token);
    return profileOf(student);
  });

/** The student changes their own password; other devices are signed out. */
export const studentChangePassword = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, current: z.string().min(1).max(64), next: z.string().max(64) }))
  .handler(async ({ data }) => {
    const { sessionStudent, examDb } = await import("./db.server");
    const { verifyPassword, hashPassword } = await import("./secrets");
    const problem = passwordProblem(data.next);
    if (problem) throw new Error(problem);
    const { student, tokenHash } = await sessionStudent(data.token);
    if (!(await verifyPassword(data.current, student.password_hash)))
      throw new Error("Mật khẩu hiện tại không đúng");
    if (data.current === data.next) throw new Error("Mật khẩu mới phải khác mật khẩu cũ");
    const db = examDb();
    const { error } = await db
      .from("exam_students")
      .update({
        password_hash: await hashPassword(data.next),
        password_set_at: new Date().toISOString(),
      })
      .eq("id", student.id);
    if (error) throw new Error("Không đổi được mật khẩu");
    await db
      .from("exam_student_sessions")
      .delete()
      .eq("student_id", student.id)
      .neq("token_hash", tokenHash);
    return { ok: true };
  });
