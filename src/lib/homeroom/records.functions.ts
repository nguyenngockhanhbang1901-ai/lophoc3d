// Homeroom server functions, đợt 2b: incidents (khen thưởng – vi phạm), in-class records of every
// subject, weekly competition results, term evaluations, parent contacts and the class's score
// books. Same rules as homeroom.functions.ts: ownership check first, then service-role access.
// Tables: docs/quan-ly-hoc-sinh/03-dot-2b-danh-gia-thi-dua.sql.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BehaviorKind, BookColumn } from "@/lib/gradebook/scores";
import type { Level } from "./evaluation";
import { DEFAULT_WEEKLY_RULE, weeklyRuleSchema, type WeeklyRule } from "./weekly";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const level = z.enum(["tot", "kha", "dat", "chua_dat"]);
const NOT_READY =
  "Chưa có bảng dữ liệu đợt 2b. Hãy nhờ Lovable áp dụng docs/quan-ly-hoc-sinh/03-dot-2b-danh-gia-thi-dua.sql.";

async function db() {
  const { examDb } = await import("@/lib/exam/db.server");
  return examDb();
}
async function owned(userId: string, classId: string) {
  const { ownedClass } = await import("@/lib/exam/db.server");
  return ownedClass(userId, classId);
}
async function inClass(classId: string, ids: string[]) {
  const { studentsInClass } = await import("@/lib/exam/db.server");
  const ok = new Set(await studentsInClass(classId, [...new Set(ids)]));
  if (ids.some((id) => !ok.has(id))) throw new Error("Có học sinh không thuộc lớp này");
}

// ---------- incidents ----------

export const INCIDENT_CATEGORIES = {
  khen: {
    hoc_tap: "Thành tích học tập",
    phong_trao: "Thành tích phong trào",
    tap_the: "Hoạt động tập thể",
    khac: "Khác",
  },
  vi_pham: {
    khong_hoan_thanh: "Không hoàn thành nhiệm vụ",
    noi_quy: "Vi phạm nội quy",
    khac: "Trường hợp khác",
  },
} as const;

export interface Incident {
  id: string;
  studentId: string;
  day: string;
  type: "khen" | "vi_pham";
  category: string;
  content: string;
  action: string;
  points: number;
}

export const listIncidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid, from: day, to: day }))
  .handler(async ({ data, context }): Promise<Incident[]> => {
    await owned(context.userId, data.classId);
    const { data: rows, error } = await (
      await db()
    )
      .from("hr_incidents")
      .select("id,student_id,day,type,category,content,action,points")
      .eq("class_id", data.classId)
      .gte("day", data.from)
      .lte("day", data.to)
      .order("day", { ascending: false });
    if (error) throw new Error(NOT_READY);
    return (
      (rows ?? []) as {
        id: string;
        student_id: string;
        day: string;
        type: "khen" | "vi_pham";
        category: string;
        content: string;
        action: string;
        points: number;
      }[]
    ).map((r) => ({ ...r, studentId: r.student_id }));
  });

export const saveIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      id: uuid.optional(),
      studentIds: z.array(uuid).min(1).max(60),
      day,
      type: z.enum(["khen", "vi_pham"]),
      category: z.string().regex(/^[a-z_]{2,30}$/),
      content: z.string().trim().min(1).max(500),
      action: z.string().trim().max(300).default(""),
      points: z.number().int().min(-100).max(100),
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    await inClass(data.classId, data.studentIds);
    const d = await db();
    const values = {
      day: data.day,
      type: data.type,
      category: data.category,
      content: data.content,
      action: data.action,
      points: data.points,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await d
        .from("hr_incidents")
        .update({ ...values, student_id: data.studentIds[0] })
        .eq("id", data.id)
        .eq("class_id", data.classId);
      if (error) throw new Error("Không lưu được");
      return { saved: 1 };
    }
    const { error } = await d.from("hr_incidents").insert(
      data.studentIds.map((studentId) => ({
        ...values,
        class_id: data.classId,
        student_id: studentId,
        owner_id: context.userId,
      })),
    );
    if (error) throw new Error(NOT_READY);
    return { saved: data.studentIds.length };
  });

export const deleteIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid }))
  .handler(async ({ data, context }) => {
    const { error } = await (
      await db()
    )
      .from("hr_incidents")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error("Không xóa được");
    return { ok: true };
  });

// ---------- in-class records of every subject ----------

export interface ClassEvent {
  id: string;
  studentId: string;
  day: string;
  kind: BehaviorKind;
  subject: string;
}

export const behaviorRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid, from: day, to: day }))
  .handler(async ({ data, context }): Promise<ClassEvent[]> => {
    await owned(context.userId, data.classId);
    const { data: rows, error } = await (
      await db()
    )
      .from("hr_behavior_events")
      .select("id,student_id,day,kind,subject")
      .eq("class_id", data.classId)
      .gte("day", data.from)
      .lte("day", data.to);
    if (error) throw new Error(NOT_READY);
    return (
      (rows ?? []) as {
        id: string;
        student_id: string;
        day: string;
        kind: BehaviorKind;
        subject: string;
      }[]
    ).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      day: r.day,
      kind: r.kind,
      subject: r.subject,
    }));
  });

// ---------- weekly results ----------

export interface WeeklyResult {
  studentId: string;
  weekStart: string;
  points: number;
  level: Level;
  note: string;
  lockedAt: string;
}

export const weeklyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid, from: day, to: day }))
  .handler(async ({ data, context }): Promise<{ rule: WeeklyRule; results: WeeklyResult[] }> => {
    await owned(context.userId, data.classId);
    const d = await db();
    const [settings, rows] = await Promise.all([
      d.from("hr_class_settings").select("weekly_rule").eq("class_id", data.classId).maybeSingle(),
      d
        .from("hr_weekly_results")
        .select("student_id,week_start,points,level,note,locked_at")
        .eq("class_id", data.classId)
        .gte("week_start", data.from)
        .lte("week_start", data.to),
    ]);
    if (settings.error || rows.error) throw new Error(NOT_READY);
    const parsed = weeklyRuleSchema.safeParse(
      (settings.data as { weekly_rule?: unknown } | null)?.weekly_rule,
    );
    return {
      rule: parsed.success ? parsed.data : DEFAULT_WEEKLY_RULE,
      results: (
        (rows.data ?? []) as {
          student_id: string;
          week_start: string;
          points: number;
          level: Level;
          note: string;
          locked_at: string;
        }[]
      ).map((r) => ({
        studentId: r.student_id,
        weekStart: r.week_start,
        points: r.points,
        level: r.level,
        note: r.note,
        lockedAt: r.locked_at,
      })),
    };
  });

export const saveWeeklyRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid, rule: weeklyRuleSchema }))
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    if (!(data.rule.tot >= data.rule.kha && data.rule.kha >= data.rule.dat))
      throw new Error("Mốc Tốt ≥ Khá ≥ Đạt");
    const { error } = await (
      await db()
    )
      .from("hr_class_settings")
      .update({ weekly_rule: data.rule, updated_at: new Date().toISOString() })
      .eq("class_id", data.classId);
    if (error) throw new Error(NOT_READY);
    return { ok: true };
  });

export const lockWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      weekStart: day,
      rows: z
        .array(
          z.object({
            studentId: uuid,
            points: z.number().int().min(-10000).max(10000),
            level,
            note: z.string().trim().max(300).default(""),
          }),
        )
        .max(200),
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    await inClass(
      data.classId,
      data.rows.map((r) => r.studentId),
    );
    if (!data.rows.length) return { saved: 0 };
    const now = new Date().toISOString();
    const { error } = await (await db()).from("hr_weekly_results").upsert(
      data.rows.map((r) => ({
        class_id: data.classId,
        student_id: r.studentId,
        owner_id: context.userId,
        week_start: data.weekStart,
        points: r.points,
        level: r.level,
        note: r.note,
        locked_at: now,
      })),
    );
    if (error) throw new Error(NOT_READY);
    return { saved: data.rows.length };
  });

// ---------- score books of the class (all subjects) ----------

export interface ClassBook {
  id: string;
  subject: string;
  semester: 1 | 2;
  columns: BookColumn[];
  bonusTarget: string | null;
  mine: boolean;
  scores: {
    studentId: string;
    key: string;
    num: number | null;
    txt: string | null;
    updatedAt: string;
  }[];
  bonus: { studentId: string; plus: number; minus: number }[];
}

/** Every score book of this class the teacher owns (her own subject + files imported from others). */
export const classBooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid }))
  .handler(async ({ data, context }): Promise<ClassBook[]> => {
    await owned(context.userId, data.classId);
    const d = await db();
    const { data: books, error } = await d
      .from("gb_books")
      .select("id,subject,semester,columns,bonus_target")
      .eq("class_id", data.classId)
      .eq("owner_id", context.userId);
    if (error) throw new Error("Chưa có bảng dữ liệu sổ điểm (đợt 2a)");
    const list = (books ?? []) as {
      id: string;
      subject: string;
      semester: 1 | 2;
      columns: BookColumn[];
      bonus_target: string | null;
    }[];
    if (!list.length) return [];
    const ids = list.map((b) => b.id);
    const [scores, bonus] = await Promise.all([
      d
        .from("gb_scores")
        .select("book_id,student_id,column_key,num,txt,updated_at")
        .in("book_id", ids),
      d.from("gb_bonus").select("book_id,student_id,plus,minus").in("book_id", ids),
    ]);
    if (scores.error || bonus.error) throw new Error("Không đọc được điểm");
    return list.map((b) => ({
      id: b.id,
      subject: b.subject,
      semester: b.semester,
      columns: b.columns,
      bonusTarget: b.bonus_target,
      mine: true,
      scores: (
        (scores.data ?? []) as {
          book_id: string;
          student_id: string;
          column_key: string;
          num: number | string | null;
          txt: string | null;
          updated_at: string;
        }[]
      )
        .filter((s) => s.book_id === b.id)
        .map((s) => ({
          studentId: s.student_id,
          key: s.column_key,
          num: s.num === null ? null : Number(s.num),
          txt: s.txt,
          updatedAt: s.updated_at,
        })),
      bonus: (
        (bonus.data ?? []) as { book_id: string; student_id: string; plus: number; minus: number }[]
      )
        .filter((x) => x.book_id === b.id)
        .map((x) => ({ studentId: x.student_id, plus: Number(x.plus), minus: Number(x.minus) })),
    }));
  });

// ---------- evaluations ----------

export interface Evaluation {
  studentId: string;
  term: 1 | 2 | 3;
  studyLevel: Level | null;
  conductLevel: Level | null;
  comment: string;
}

export const listEvaluations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid }))
  .handler(async ({ data, context }): Promise<Evaluation[]> => {
    await owned(context.userId, data.classId);
    const { data: rows, error } = await (
      await db()
    )
      .from("hr_evaluations")
      .select("student_id,term,study_level,conduct_level,comment")
      .eq("class_id", data.classId);
    if (error) throw new Error(NOT_READY);
    return (
      (rows ?? []) as {
        student_id: string;
        term: 1 | 2 | 3;
        study_level: Level | null;
        conduct_level: Level | null;
        comment: string;
      }[]
    ).map((r) => ({
      studentId: r.student_id,
      term: r.term,
      studyLevel: r.study_level,
      conductLevel: r.conduct_level,
      comment: r.comment,
    }));
  });

export const saveEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      studentId: uuid,
      term: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      studyLevel: level.nullable(),
      conductLevel: level.nullable(),
      comment: z.string().trim().max(2000),
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    await inClass(data.classId, [data.studentId]);
    const { error } = await (await db()).from("hr_evaluations").upsert({
      class_id: data.classId,
      student_id: data.studentId,
      owner_id: context.userId,
      term: data.term,
      study_level: data.studyLevel,
      conduct_level: data.conductLevel,
      comment: data.comment,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(NOT_READY);
    return { ok: true };
  });

// ---------- parent contacts ----------

export const CHANNEL_LABEL = {
  dien_thoai: "Điện thoại",
  zalo: "Zalo",
  gap_mat: "Gặp trực tiếp",
  hop_phu_huynh: "Họp phụ huynh",
  khac: "Khác",
} as const;
export type Channel = keyof typeof CHANNEL_LABEL;

export interface ParentContact {
  id: string;
  studentId: string;
  day: string;
  guardianName: string;
  channel: Channel;
  content: string;
  result: string;
  followUp: string | null;
  followUpDone: boolean;
}

export const listParentContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid }))
  .handler(async ({ data, context }): Promise<ParentContact[]> => {
    await owned(context.userId, data.classId);
    const { data: rows, error } = await (
      await db()
    )
      .from("hr_parent_contacts")
      .select("id,student_id,day,guardian_name,channel,content,result,follow_up,follow_up_done")
      .eq("class_id", data.classId)
      .order("day", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(NOT_READY);
    return (
      (rows ?? []) as {
        id: string;
        student_id: string;
        day: string;
        guardian_name: string;
        channel: Channel;
        content: string;
        result: string;
        follow_up: string | null;
        follow_up_done: boolean;
      }[]
    ).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      day: r.day,
      guardianName: r.guardian_name,
      channel: r.channel,
      content: r.content,
      result: r.result,
      followUp: r.follow_up,
      followUpDone: r.follow_up_done,
    }));
  });

export const saveParentContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      id: uuid.optional(),
      studentId: uuid,
      day,
      guardianName: z.string().trim().max(100),
      channel: z.enum(["dien_thoai", "zalo", "gap_mat", "hop_phu_huynh", "khac"]),
      content: z.string().trim().min(1).max(2000),
      result: z.string().trim().max(1000),
      followUp: day.nullable(),
      followUpDone: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    await inClass(data.classId, [data.studentId]);
    const values = {
      student_id: data.studentId,
      day: data.day,
      guardian_name: data.guardianName,
      channel: data.channel,
      content: data.content,
      result: data.result,
      follow_up: data.followUp,
      follow_up_done: data.followUpDone,
      updated_at: new Date().toISOString(),
    };
    const d = await db();
    const { error } = data.id
      ? await d
          .from("hr_parent_contacts")
          .update(values)
          .eq("id", data.id)
          .eq("class_id", data.classId)
      : await d
          .from("hr_parent_contacts")
          .insert({ ...values, class_id: data.classId, owner_id: context.userId });
    if (error) throw new Error(NOT_READY);
    return { ok: true };
  });

export const deleteParentContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid }))
  .handler(async ({ data, context }) => {
    const { error } = await (
      await db()
    )
      .from("hr_parent_contacts")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error("Không xóa được");
    return { ok: true };
  });
