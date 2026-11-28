// Teacher-side server functions: classes and student accounts for online exams.
// Every call is tied to the signed-in teacher; student rows are only touched after the
// class is checked to belong to that teacher. Each class has a default password set by the
// teacher; new accounts and "reset to default" use it. Passwords are kept twice: a PBKDF2
// hash for signing in, and an AES-GCM copy the teacher can read back (key on the server).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOwner } from "@/lib/owner-middleware";
import { cleanFullName, makeUsername, passwordProblem } from "./accounts";
import { parseRoster } from "./roster";

const uuid = z.string().uuid();
const ids = z.array(uuid).min(1).max(200);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const password = z
  .string()
  .max(64)
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

export interface ExamClassSummary {
  id: string;
  name: string;
  schoolYear: string;
  subject: string;
  archived: boolean;
  createdAt: string;
  studentCount: number;
  /** null when not set yet (classes made before default passwords existed) */
  defaultPassword: string | null;
}

export interface ExamStudentSummary {
  id: string;
  fullName: string;
  birthDate: string | null;
  studentCode: string | null;
  username: string;
  /** null when it cannot be shown (account made before passwords were kept for teachers) */
  password: string | null;
  passwordByStudent: boolean;
  locked: boolean;
  passwordSetAt: string;
  lastLoginAt: string | null;
}

function randomDigits(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] ?? 0) % 10000;
}

/** Hash + readable copy of one password, computed once and reused for many students. */
async function sealPassword(plain: string) {
  const { hashPassword, encryptSecret } = await import("./secrets");
  const { passwordKey } = await import("./db.server");
  return {
    password_hash: await hashPassword(plain),
    password_enc: await encryptSecret(plain, passwordKey()),
  };
}

async function classDefaultPassword(cls: {
  default_password_enc: string | null;
}): Promise<string | null> {
  const { decryptSecret } = await import("./secrets");
  const { passwordKey } = await import("./db.server");
  return decryptSecret(cls.default_password_enc, passwordKey());
}

/** Put every listed student (already checked to be in the class) on the given password. */
async function applyPassword(studentIds: string[], plain: string) {
  if (!studentIds.length) return;
  const { examDb } = await import("./db.server");
  const db = examDb();
  const sealed = await sealPassword(plain);
  const { error } = await db
    .from("exam_students")
    .update({ ...sealed, password_by_student: false, password_set_at: new Date().toISOString() })
    .in("id", studentIds);
  if (error) throw new Error("Không đặt được mật khẩu");
  // Signed-in devices must log in again with the new password.
  await db.from("exam_student_sessions").delete().in("student_id", studentIds);
}

export const listExamClasses = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .handler(async ({ context }): Promise<ExamClassSummary[]> => {
    const { examDb } = await import("./db.server");
    const db = examDb();
    const { data, error } = await db
      .from("exam_classes")
      .select("*")
      .eq("owner_id", context.userId)
      .order("created_at");
    if (error)
      throw new Error("Không đọc được danh sách lớp. Bảng dữ liệu thi online đã được tạo chưa?");
    const rows = (data ?? []) as import("./db.server").ExamClassRow[];
    const counts = new Map<string, number>();
    if (rows.length) {
      const { data: students } = await db
        .from("exam_students")
        .select("class_id")
        .eq("owner_id", context.userId);
      for (const s of (students ?? []) as { class_id: string }[])
        counts.set(s.class_id, (counts.get(s.class_id) ?? 0) + 1);
    }
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        schoolYear: r.school_year,
        subject: r.subject,
        archived: r.archived,
        createdAt: r.created_at,
        studentCount: counts.get(r.id) ?? 0,
        defaultPassword: await classDefaultPassword(r),
      })),
    );
  });

/**
 * Create or edit a class. A new class needs a default password. Changing it on an existing
 * class affects new accounts only, unless applyToAll is set: then every student in the class
 * (including those who chose their own) goes back to the new default.
 */
export const saveExamClass = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(
    z.object({
      id: uuid.optional(),
      name: z.string().trim().min(1).max(100),
      schoolYear: z.string().trim().max(20).default(""),
      subject: z.string().trim().max(60).default(""),
      archived: z.boolean().optional(),
      defaultPassword: password.optional(),
      applyToAll: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    const { examDb, ownedClass, passwordKey } = await import("./db.server");
    const { encryptSecret } = await import("./secrets");
    const db = examDb();
    const values: Record<string, unknown> = {
      name: data.name,
      school_year: data.schoolYear,
      subject: data.subject,
      ...(data.archived === undefined ? {} : { archived: data.archived }),
      ...(data.defaultPassword === undefined
        ? {}
        : { default_password_enc: await encryptSecret(data.defaultPassword, passwordKey()) }),
    };
    if (data.id) {
      await ownedClass(context.userId, data.id);
      const { error } = await db
        .from("exam_classes")
        .update(values)
        .eq("id", data.id)
        .eq("owner_id", context.userId);
      if (error) throw new Error("Không lưu được lớp học");
      if (data.applyToAll && data.defaultPassword) {
        const { data: rows } = await db.from("exam_students").select("id").eq("class_id", data.id);
        await applyPassword(
          ((rows ?? []) as { id: string }[]).map((r) => r.id),
          data.defaultPassword,
        );
      }
      return { id: data.id };
    }
    if (!data.defaultPassword) throw new Error("Hãy đặt mật khẩu mặc định cho lớp");
    const { data: row, error } = await db
      .from("exam_classes")
      .insert({ ...values, owner_id: context.userId })
      .select("id")
      .single();
    if (error || !row) throw new Error("Không tạo được lớp học");
    return { id: (row as { id: string }).id };
  });

export const deleteExamClass = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(z.object({ id: uuid }))
  .handler(async ({ data, context }) => {
    const { examDb, ownedClass } = await import("./db.server");
    await ownedClass(context.userId, data.id);
    const { error } = await examDb()
      .from("exam_classes")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error("Không xóa được lớp học");
    return { ok: true };
  });

export const listClassStudents = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(z.object({ classId: uuid }))
  .handler(async ({ data, context }): Promise<ExamStudentSummary[]> => {
    const { examDb, ownedClass, passwordKey, STUDENT_PUBLIC_COLUMNS } = await import("./db.server");
    const { decryptSecret } = await import("./secrets");
    await ownedClass(context.userId, data.classId);
    const db = examDb();
    const { data: rows, error } = await db
      .from("exam_students")
      .select(STUDENT_PUBLIC_COLUMNS)
      .eq("class_id", data.classId)
      .order("created_at")
      .order("full_name");
    if (error) throw new Error("Không đọc được danh sách học sinh");
    const students = (rows ?? []) as unknown as Omit<
      import("./db.server").ExamStudentRow,
      "password_hash" | "owner_id"
    >[];
    const lastLogin = new Map<string, string>();
    if (students.length) {
      const { data: logs } = await db
        .from("exam_login_logs")
        .select("student_id,at")
        .eq("success", true)
        .in(
          "student_id",
          students.map((s) => s.id),
        )
        .order("at", { ascending: false })
        .limit(2000);
      for (const l of (logs ?? []) as { student_id: string; at: string }[])
        if (!lastLogin.has(l.student_id)) lastLogin.set(l.student_id, l.at);
    }
    const key = passwordKey();
    return Promise.all(
      students.map(async (s) => ({
        id: s.id,
        fullName: s.full_name,
        birthDate: s.birth_date,
        studentCode: s.student_code,
        username: s.username,
        password: await decryptSecret(s.password_enc, key),
        passwordByStudent: s.password_by_student,
        locked: s.locked,
        passwordSetAt: s.password_set_at,
        lastLoginAt: lastLogin.get(s.id) ?? null,
      })),
    );
  });

/**
 * Create accounts for up to 20 students at a time (the page sends a long list in groups so
 * one slow group never loses the rest), all with the class default password. Duplicates
 * against the class are checked again here.
 */
export const addStudents = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(
    z.object({
      classId: uuid,
      students: z
        .array(
          z.object({
            fullName: z.string().trim().min(1).max(100),
            birthDate: isoDate,
            studentCode: z.string().trim().max(30).nullable(),
          }),
        )
        .min(1)
        .max(20),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ created: number; problems: { fullName: string; message: string }[] }> => {
      const { examDb, ownedClass } = await import("./db.server");
      const cls = await ownedClass(context.userId, data.classId);
      const defaultPassword = await classDefaultPassword(cls);
      if (!defaultPassword)
        throw new Error(
          "Lớp chưa có mật khẩu mặc định. Bấm Sửa lớp để đặt trước khi thêm học sinh.",
        );
      const db = examDb();
      const { data: existingRows, error: readError } = await db
        .from("exam_students")
        .select("full_name,birth_date,student_code")
        .eq("class_id", data.classId);
      if (readError) throw new Error("Không đọc được danh sách học sinh");
      const existing = (
        (existingRows ?? []) as {
          full_name: string;
          birth_date: string | null;
          student_code: string | null;
        }[]
      ).map((r) => ({
        fullName: r.full_name,
        birthDate: r.birth_date,
        studentCode: r.student_code,
      }));
      // Re-run the same import rules on the submitted rows (header row + data rows).
      const check = parseRoster(
        [
          ["Họ và tên", "Ngày sinh", "Mã học sinh"],
          ...data.students.map((s) => [cleanFullName(s.fullName), s.birthDate, s.studentCode]),
        ],
        existing,
      );
      const problems = check.problems.map((p) => ({
        fullName: data.students[p.row - 2]?.fullName ?? "",
        message: p.message,
      }));
      const accepted = check.students.map((s) => ({
        fullName: s.fullName,
        birthDate: s.birthDate,
        studentCode: s.studentCode,
      }));
      if (!accepted.length) return { created: 0, problems };

      const sealed = await sealPassword(defaultPassword);
      let created = 0;
      for (let attempt = 0; attempt < 3 && accepted.length; attempt++) {
        const candidates = accepted.map((s) => makeUsername(s.fullName, randomDigits()));
        const { data: taken } = await db
          .from("exam_students")
          .select("username")
          .in("username", candidates);
        const takenSet = new Set(((taken ?? []) as { username: string }[]).map((t) => t.username));
        const used = new Set<string>();
        const ready: { student: (typeof accepted)[number]; username: string }[] = [];
        for (let i = 0; i < accepted.length; i++) {
          const name = candidates[i] ?? "";
          if (takenSet.has(name) || used.has(name)) continue;
          used.add(name);
          ready.push({ student: accepted[i]!, username: name });
        }
        const { data: inserted, error } = await db
          .from("exam_students")
          .insert(
            ready.map((r) => ({
              class_id: data.classId,
              owner_id: context.userId,
              full_name: r.student.fullName,
              birth_date: r.student.birthDate,
              student_code: r.student.studentCode,
              username: r.username,
              ...sealed,
            })),
          )
          .select("id");
        if (error) {
          if (error.code === "23505") continue; // a username was taken meanwhile: draw new numbers
          throw new Error("Không tạo được tài khoản");
        }
        created += (inserted ?? []).length;
        const done = new Set(ready.map((r) => r.student));
        for (let i = accepted.length - 1; i >= 0; i--)
          if (done.has(accepted[i]!)) accepted.splice(i, 1);
      }
      for (const s of accepted)
        problems.push({
          fullName: s.fullName,
          message: "Không tạo được tên đăng nhập, hãy thử lại",
        });
      return { created, problems };
    },
  );

/** Chosen students go back to the class default password; their open sessions end. */
export const resetToDefaultPassword = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(z.object({ classId: uuid, studentIds: ids }))
  .handler(async ({ data, context }) => {
    const { ownedClass, studentsInClass } = await import("./db.server");
    const cls = await ownedClass(context.userId, data.classId);
    const defaultPassword = await classDefaultPassword(cls);
    if (!defaultPassword) throw new Error("Lớp chưa có mật khẩu mặc định. Bấm Sửa lớp để đặt.");
    const valid = await studentsInClass(data.classId, data.studentIds);
    await applyPassword(valid, defaultPassword);
    return { count: valid.length };
  });

export const setStudentsLocked = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(z.object({ classId: uuid, studentIds: ids, locked: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { examDb, ownedClass, studentsInClass } = await import("./db.server");
    await ownedClass(context.userId, data.classId);
    const valid = await studentsInClass(data.classId, data.studentIds);
    const db = examDb();
    const { error } = await db
      .from("exam_students")
      .update({ locked: data.locked })
      .in("id", valid);
    if (error) throw new Error("Không cập nhật được tài khoản");
    if (data.locked) await db.from("exam_student_sessions").delete().in("student_id", valid);
    return { count: valid.length };
  });

export const moveStudents = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(z.object({ classId: uuid, studentIds: ids, toClassId: uuid }))
  .handler(async ({ data, context }) => {
    const { examDb, ownedClass, studentsInClass } = await import("./db.server");
    await ownedClass(context.userId, data.classId);
    await ownedClass(context.userId, data.toClassId);
    const valid = await studentsInClass(data.classId, data.studentIds);
    const { error } = await examDb()
      .from("exam_students")
      .update({ class_id: data.toClassId })
      .in("id", valid);
    if (error) throw new Error("Không chuyển lớp được");
    return { count: valid.length };
  });

export const deleteStudents = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(z.object({ classId: uuid, studentIds: ids }))
  .handler(async ({ data, context }) => {
    const { examDb, ownedClass, studentsInClass } = await import("./db.server");
    await ownedClass(context.userId, data.classId);
    const valid = await studentsInClass(data.classId, data.studentIds);
    const { error } = await examDb().from("exam_students").delete().in("id", valid);
    if (error) throw new Error("Không xóa được học sinh");
    return { count: valid.length };
  });

export const updateStudent = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(
    z.object({
      classId: uuid,
      studentId: uuid,
      fullName: z.string().trim().min(1).max(100),
      birthDate: isoDate,
      studentCode: z.string().trim().max(30).nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { examDb, ownedClass, studentsInClass } = await import("./db.server");
    await ownedClass(context.userId, data.classId);
    const [id] = await studentsInClass(data.classId, [data.studentId]);
    if (!id) throw new Error("Không tìm thấy học sinh");
    const { error } = await examDb()
      .from("exam_students")
      .update({
        full_name: cleanFullName(data.fullName),
        birth_date: data.birthDate,
        student_code: data.studentCode || null,
      })
      .eq("id", id);
    if (error) throw new Error("Không lưu được thông tin học sinh");
    return { ok: true };
  });

/** Login history of one student (newest first). */
export const studentLoginLog = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(z.object({ classId: uuid, studentId: uuid }))
  .handler(async ({ data, context }) => {
    const { examDb, ownedClass, studentsInClass } = await import("./db.server");
    await ownedClass(context.userId, data.classId);
    const [id] = await studentsInClass(data.classId, [data.studentId]);
    if (!id) throw new Error("Không tìm thấy học sinh");
    const { data: rows } = await examDb()
      .from("exam_login_logs")
      .select("at,success,user_agent")
      .eq("student_id", id)
      .order("at", { ascending: false })
      .limit(50);
    return ((rows ?? []) as { at: string; success: boolean; user_agent: string }[]).map((r) => ({
      at: r.at,
      success: r.success,
      userAgent: r.user_agent,
    }));
  });
