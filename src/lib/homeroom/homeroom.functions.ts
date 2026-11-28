// Teacher-side server functions for the homeroom module (quản lý học sinh của GVCN).
// Students are the exam_students rows of the teacher's own class (one record shared with
// exam accounts). Every call checks the class belongs to the signed-in teacher, then reads or
// writes the hr_* tables with the service role; the browser never reads them directly.
// Tables come from docs/quan-ly-hoc-sinh/01-dot-1-co-ban.sql (applied through Lovable).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AbsenceKind, AbsenceRecord, Session, TakenSession } from "./attendance";
import { guardianSchema, normalizeGuardians, profileSchema, emptyProfile } from "./profiles";
import type { Guardian, Profile, StudentStatus } from "./profiles";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const session = z.enum(["ca_ngay", "sang", "chieu"]);
const NOT_READY =
  "Chưa có bảng dữ liệu quản lý học sinh. Hãy nhờ Lovable áp dụng docs/quan-ly-hoc-sinh/01-dot-1-co-ban.sql.";

export interface HomeroomSettings {
  yearStart: string | null;
  term2Start: string | null;
  yearEnd: string | null;
  twoSessions: boolean;
  alertConsecutive: number;
  alertUnexcusedMonth: number;
}

export interface HomeroomClass {
  id: string;
  name: string;
  schoolYear: string;
  studentCount: number;
  /** null = not a homeroom class */
  settings: HomeroomSettings | null;
}

export interface StudentBasic {
  id: string;
  fullName: string;
  birthDate: string | null;
  studentCode: string | null;
  gender: "nam" | "nu" | null;
  status: StudentStatus;
}

export interface StudentProfile extends StudentBasic {
  profile: Profile;
  guardians: (Guardian & { id: string })[];
  photo: string | null;
}

export interface AttendanceData {
  settings: HomeroomSettings;
  students: StudentBasic[];
  absences: AbsenceRecord[];
  taken: TakenSession[];
}

interface SettingsRow {
  class_id: string;
  year_start: string | null;
  term2_start: string | null;
  year_end: string | null;
  two_sessions: boolean;
  alert_consecutive: number;
  alert_unexcused_month: number;
}
interface ProfileRow {
  student_id: string;
  gender: "nam" | "nu" | null;
  ethnicity: string;
  permanent_address: string;
  current_address: string;
  class_role: string;
  group_name: string;
  seat: string;
  care_note: string;
  private_note: string;
  photo: string | null;
  status: StudentStatus;
  status_date: string | null;
}
interface GuardianRow {
  id: string;
  student_id: string;
  full_name: string;
  relation: string;
  phone: string;
  zalo: string;
  is_primary: boolean;
  position: number;
}
interface StudentRow {
  id: string;
  full_name: string;
  birth_date: string | null;
  student_code: string | null;
}

const DEFAULT_SETTINGS: HomeroomSettings = {
  yearStart: null,
  term2Start: null,
  yearEnd: null,
  twoSessions: false,
  alertConsecutive: 3,
  alertUnexcusedMonth: 2,
};

function settingsOf(r: SettingsRow): HomeroomSettings {
  return {
    yearStart: r.year_start,
    term2Start: r.term2_start,
    yearEnd: r.year_end,
    twoSessions: r.two_sessions,
    alertConsecutive: r.alert_consecutive,
    alertUnexcusedMonth: r.alert_unexcused_month,
  };
}

function profileOf(r: ProfileRow | undefined): Profile {
  if (!r) return emptyProfile();
  return {
    gender: r.gender,
    ethnicity: r.ethnicity,
    permanentAddress: r.permanent_address,
    currentAddress: r.current_address,
    classRole: r.class_role,
    groupName: r.group_name,
    seat: r.seat,
    careNote: r.care_note,
    privateNote: r.private_note,
    status: r.status,
    statusDate: r.status_date,
  };
}

function profileValues(p: Partial<Profile>): Record<string, unknown> {
  const map: Record<keyof Profile, string> = {
    gender: "gender",
    ethnicity: "ethnicity",
    permanentAddress: "permanent_address",
    currentAddress: "current_address",
    classRole: "class_role",
    groupName: "group_name",
    seat: "seat",
    careNote: "care_note",
    privateNote: "private_note",
    status: "status",
    statusDate: "status_date",
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) out[map[k as keyof Profile]] = v;
  return out;
}

async function db() {
  const { examDb } = await import("@/lib/exam/db.server");
  return examDb();
}

async function owned(userId: string, classId: string) {
  const { ownedClass } = await import("@/lib/exam/db.server");
  return ownedClass(userId, classId);
}

async function classStudents(classId: string): Promise<StudentRow[]> {
  const { data, error } = await (
    await db()
  )
    .from("exam_students")
    .select("id,full_name,birth_date,student_code")
    .eq("class_id", classId);
  if (error) throw new Error("Không đọc được danh sách học sinh");
  return (data ?? []) as StudentRow[];
}

async function profileRows(ids: string[], withPhoto: boolean): Promise<Map<string, ProfileRow>> {
  if (!ids.length) return new Map();
  const cols = withPhoto ? "*" : "student_id,gender,status,status_date";
  const { data, error } = await (
    await db()
  )
    .from("hr_student_profiles")
    .select(cols)
    .in("student_id", ids);
  if (error) throw new Error(NOT_READY);
  return new Map(((data ?? []) as unknown as ProfileRow[]).map((r) => [r.student_id, r]));
}

async function settingsRow(classId: string): Promise<SettingsRow | null> {
  const { data, error } = await (
    await db()
  )
    .from("hr_class_settings")
    .select("*")
    .eq("class_id", classId)
    .maybeSingle();
  if (error) throw new Error(NOT_READY);
  return (data as SettingsRow | null) ?? null;
}

/** Every class of the teacher, with its homeroom settings when it is a homeroom class. */
export const listHomeroomClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeroomClass[]> => {
    const d = await db();
    const { data, error } = await d
      .from("exam_classes")
      .select("id,name,school_year,archived,created_at")
      .eq("owner_id", context.userId)
      .order("created_at");
    if (error) throw new Error("Không đọc được danh sách lớp");
    const classes = (
      (data ?? []) as {
        id: string;
        name: string;
        school_year: string;
        archived: boolean;
      }[]
    ).filter((c) => !c.archived);
    const settings = await d.from("hr_class_settings").select("*").eq("owner_id", context.userId);
    if (settings.error) throw new Error(NOT_READY);
    const byClass = new Map(
      ((settings.data ?? []) as SettingsRow[]).map((r) => [r.class_id, settingsOf(r)]),
    );
    const { data: students } = await d
      .from("exam_students")
      .select("class_id")
      .eq("owner_id", context.userId);
    const counts = new Map<string, number>();
    for (const s of (students ?? []) as { class_id: string }[])
      counts.set(s.class_id, (counts.get(s.class_id) ?? 0) + 1);
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      schoolYear: c.school_year,
      studentCount: counts.get(c.id) ?? 0,
      settings: byClass.get(c.id) ?? null,
    }));
  });

/** Make a class a homeroom class (or update its settings); homeroom=false removes the mark only. */
export const saveHomeroomSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      homeroom: z.boolean(),
      yearStart: day.nullable().default(null),
      term2Start: day.nullable().default(null),
      yearEnd: day.nullable().default(null),
      twoSessions: z.boolean().default(false),
      alertConsecutive: z.number().int().min(1).max(30).default(3),
      alertUnexcusedMonth: z.number().int().min(1).max(30).default(2),
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    const d = await db();
    if (!data.homeroom) {
      const { error } = await d.from("hr_class_settings").delete().eq("class_id", data.classId);
      if (error) throw new Error(NOT_READY);
      return { ok: true };
    }
    if (data.yearStart && data.term2Start && data.term2Start <= data.yearStart)
      throw new Error("Ngày bắt đầu học kỳ II phải sau ngày khai giảng");
    if (data.term2Start && data.yearEnd && data.yearEnd <= data.term2Start)
      throw new Error("Ngày kết thúc năm học phải sau ngày bắt đầu học kỳ II");
    const { error } = await d.from("hr_class_settings").upsert({
      class_id: data.classId,
      owner_id: context.userId,
      year_start: data.yearStart,
      term2_start: data.term2Start,
      year_end: data.yearEnd,
      two_sessions: data.twoSessions,
      alert_consecutive: data.alertConsecutive,
      alert_unexcused_month: data.alertUnexcusedMonth,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(NOT_READY);
    return { ok: true };
  });

/** Full profiles (with guardians and photos) of every student in the class. */
export const listProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid }))
  .handler(async ({ data, context }): Promise<StudentProfile[]> => {
    await owned(context.userId, data.classId);
    const students = await classStudents(data.classId);
    const ids = students.map((s) => s.id);
    const profiles = await profileRows(ids, true);
    const guardians = new Map<string, (Guardian & { id: string })[]>();
    if (ids.length) {
      const { data: rows, error } = await (
        await db()
      )
        .from("hr_guardians")
        .select("*")
        .in("student_id", ids)
        .order("position");
      if (error) throw new Error(NOT_READY);
      for (const g of (rows ?? []) as GuardianRow[])
        guardians.set(g.student_id, [
          ...(guardians.get(g.student_id) ?? []),
          {
            id: g.id,
            fullName: g.full_name,
            relation: g.relation,
            phone: g.phone,
            zalo: g.zalo,
            isPrimary: g.is_primary,
          },
        ]);
    }
    return students.map((s) => {
      const p = profileOf(profiles.get(s.id));
      return {
        id: s.id,
        fullName: s.full_name,
        birthDate: s.birth_date,
        studentCode: s.student_code,
        gender: p.gender,
        status: p.status,
        profile: p,
        guardians: guardians.get(s.id) ?? [],
        photo: profiles.get(s.id)?.photo ?? null,
      };
    });
  });

async function replaceGuardians(ownerId: string, studentId: string, list: Guardian[]) {
  const d = await db();
  const { error } = await d.from("hr_guardians").delete().eq("student_id", studentId);
  if (error) throw new Error(NOT_READY);
  const kept = normalizeGuardians(list);
  if (!kept.length) return;
  const ins = await d.from("hr_guardians").insert(
    kept.map((g, i) => ({
      student_id: studentId,
      owner_id: ownerId,
      full_name: g.fullName,
      relation: g.relation,
      phone: g.phone,
      zalo: g.zalo,
      is_primary: g.isPrimary,
      position: i,
    })),
  );
  if (ins.error) throw new Error("Không lưu được thông tin người giám hộ");
}

async function checkStudent(classId: string, studentId: string) {
  const { studentsInClass } = await import("@/lib/exam/db.server");
  const ok = await studentsInClass(classId, [studentId]);
  if (!ok.length) throw new Error("Học sinh không thuộc lớp này");
}

/** Save one student's profile and the full list of their guardians. */
export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      studentId: uuid,
      profile: profileSchema,
      guardians: z.array(guardianSchema).max(6),
      /** undefined = keep; null = remove; string = small JPEG data URL */
      photo: z
        .string()
        .max(60000)
        .regex(/^data:image\/(jpeg|png|webp);base64,/)
        .nullable()
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    await checkStudent(data.classId, data.studentId);
    const { error } = await (await db()).from("hr_student_profiles").upsert({
      student_id: data.studentId,
      owner_id: context.userId,
      ...profileValues(data.profile),
      ...(data.photo === undefined ? {} : { photo: data.photo }),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(NOT_READY);
    await replaceGuardians(context.userId, data.studentId, data.guardians);
    return { ok: true };
  });

/** Profile sheet import: fills only the cells the sheet has; a guardian replaces the main contact. */
export const importProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      rows: z
        .array(
          z.object({
            studentId: uuid,
            profile: profileSchema.partial(),
            guardian: guardianSchema.nullable(),
          }),
        )
        .max(200),
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    const { studentsInClass } = await import("@/lib/exam/db.server");
    const valid = new Set(
      await studentsInClass(
        data.classId,
        data.rows.map((r) => r.studentId),
      ),
    );
    const rows = data.rows.filter((r) => valid.has(r.studentId));
    const d = await db();
    const existing = await profileRows(
      rows.map((r) => r.studentId),
      true,
    );
    for (const r of rows) {
      const given = Object.fromEntries(
        Object.entries(r.profile).filter(([, v]) => v !== undefined),
      ) as Partial<Profile>;
      const merged = { ...profileOf(existing.get(r.studentId)), ...given };
      const { error } = await d.from("hr_student_profiles").upsert({
        student_id: r.studentId,
        owner_id: context.userId,
        ...profileValues(merged),
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(NOT_READY);
      if (r.guardian) {
        const { data: gs } = await d
          .from("hr_guardians")
          .select("*")
          .eq("student_id", r.studentId)
          .order("position");
        const list: Guardian[] = ((gs ?? []) as GuardianRow[]).map((g) => ({
          fullName: g.full_name,
          relation: g.relation,
          phone: g.phone,
          zalo: g.zalo,
          isPrimary: g.is_primary,
        }));
        const at = list.findIndex((g) => g.isPrimary);
        if (at >= 0) list[at] = r.guardian;
        else list.unshift(r.guardian);
        await replaceGuardians(context.userId, r.studentId, list);
      }
    }
    return { saved: rows.length };
  });

/** Students, absences and taken sessions of a class between two days (for attendance pages). */
export const attendanceData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid, from: day, to: day }))
  .handler(async ({ data, context }): Promise<AttendanceData> => {
    await owned(context.userId, data.classId);
    if (data.to < data.from) throw new Error("Khoảng ngày không hợp lệ");
    const students = await classStudents(data.classId);
    const profiles = await profileRows(
      students.map((s) => s.id),
      false,
    );
    const d = await db();
    const [abs, days, settings] = await Promise.all([
      d
        .from("hr_absences")
        .select("student_id,day,session,kind,reason")
        .eq("class_id", data.classId)
        .gte("day", data.from)
        .lte("day", data.to),
      d
        .from("hr_attendance_days")
        .select("day,session")
        .eq("class_id", data.classId)
        .gte("day", data.from)
        .lte("day", data.to),
      settingsRow(data.classId),
    ]);
    if (abs.error || days.error) throw new Error(NOT_READY);
    return {
      settings: settings ? settingsOf(settings) : DEFAULT_SETTINGS,
      students: students.map((s) => {
        const p = profiles.get(s.id);
        return {
          id: s.id,
          fullName: s.full_name,
          birthDate: s.birth_date,
          studentCode: s.student_code,
          gender: p?.gender ?? null,
          status: p?.status ?? "dang_hoc",
        };
      }),
      absences: (
        (abs.data ?? []) as {
          student_id: string;
          day: string;
          session: Session;
          kind: AbsenceKind;
          reason: string;
        }[]
      ).map((r) => ({
        studentId: r.student_id,
        day: r.day,
        session: r.session,
        kind: r.kind,
        reason: r.reason,
      })),
      taken: (days.data ?? []) as TakenSession[],
    };
  });

/** Save one session's roll call: the listed students were absent or late, everyone else present. */
export const saveAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      day,
      session,
      entries: z
        .array(
          z.object({
            studentId: uuid,
            kind: z.enum(["co_phep", "khong_phep", "di_muon"]),
            reason: z.string().trim().max(200).default(""),
          }),
        )
        .max(200),
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    const { studentsInClass } = await import("@/lib/exam/db.server");
    const valid = new Set(
      await studentsInClass(
        data.classId,
        data.entries.map((e) => e.studentId),
      ),
    );
    if (valid.size !== new Set(data.entries.map((e) => e.studentId)).size)
      throw new Error("Có học sinh không thuộc lớp này");
    const d = await db();
    const del = await d
      .from("hr_absences")
      .delete()
      .eq("class_id", data.classId)
      .eq("day", data.day)
      .eq("session", data.session);
    if (del.error) throw new Error(NOT_READY);
    if (data.entries.length) {
      const ins = await d.from("hr_absences").insert(
        data.entries.map((e) => ({
          class_id: data.classId,
          student_id: e.studentId,
          owner_id: context.userId,
          day: data.day,
          session: data.session,
          kind: e.kind,
          reason: e.reason,
        })),
      );
      if (ins.error) throw new Error("Không lưu được điểm danh");
    }
    const mark = await d.from("hr_attendance_days").upsert({
      class_id: data.classId,
      owner_id: context.userId,
      day: data.day,
      session: data.session,
      taken_at: new Date().toISOString(),
    });
    if (mark.error) throw new Error("Không lưu được điểm danh");
    return { ok: true };
  });
