// Teacher-side server functions for the personal gradebook (sổ điểm cá nhân) and the in-class
// learning-process records. One book = one class + subject + term; students are the class's
// exam_students rows. Every call checks ownership before touching gb_* / hr_behavior_events
// with the service role. Tables: docs/quan-ly-hoc-sinh/02-dot-2a-so-diem.sql.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BEHAVIOR_KINDS,
  bonusRuleSchema,
  columnsSchema,
  type BehaviorKind,
  type BonusRule,
  type BookColumn,
  type Counts,
} from "./scores";
import { periodRange, vnToday } from "@/lib/homeroom/periods";
import type { StudentStatus } from "@/lib/homeroom/profiles";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const NOT_READY =
  "Chưa có bảng dữ liệu sổ điểm. Hãy nhờ Lovable áp dụng docs/quan-ly-hoc-sinh/02-dot-2a-so-diem.sql.";

export interface BookSummary {
  id: string;
  classId: string;
  className: string;
  subject: string;
  semester: 1 | 2;
  schoolYear: string;
  studentCount: number;
  hasSmas: boolean;
  updatedAt: string;
}

export interface SmasMap {
  sheetPath: string;
  /** column key → sheet column letter */
  columns: Record<string, string>;
  /** sheet row → student id (null = row whose student is not in the class) */
  rows: { row: number; studentId: string | null; fullName: string }[];
}

export interface BookData {
  book: BookSummary & {
    columns: BookColumn[];
    bonusTarget: string | null;
    bonusRule: BonusRule | null;
    termFrom: string;
    termTo: string;
  };
  students: { id: string; fullName: string; studentCode: string | null; status: StudentStatus }[];
  scores: { studentId: string; key: string; num: number | null; txt: string | null }[];
  bonus: { studentId: string; plus: number; minus: number; note: string }[];
  /** learning-process records of this subject in the term, per student */
  counts: Record<string, Counts>;
}

interface BookRow {
  id: string;
  owner_id: string;
  class_id: string;
  subject: string;
  semester: 1 | 2;
  school_year: string;
  columns: BookColumn[];
  bonus_target: string | null;
  bonus_rule: BonusRule | null;
  smas_template: string | null;
  smas_map: SmasMap | null;
  updated_at: string;
}

async function db() {
  const { examDb } = await import("@/lib/exam/db.server");
  return examDb();
}

async function owned(userId: string, classId: string) {
  const { ownedClass } = await import("@/lib/exam/db.server");
  return ownedClass(userId, classId);
}

async function ownedBook(userId: string, bookId: string): Promise<BookRow> {
  const { data, error } = await (
    await db()
  )
    .from("gb_books")
    .select("*")
    .eq("id", bookId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(NOT_READY);
  if (!data) throw new Error("Không tìm thấy sổ điểm");
  return data as BookRow;
}

/** Term dates: the homeroom settings of the class when it has them, else the usual dates. */
async function termRange(classId: string, schoolYear: string, semester: 1 | 2) {
  const start = Number(schoolYear.slice(0, 4)) || Number(vnToday().slice(0, 4));
  const { data } = await (
    await db()
  )
    .from("hr_class_settings")
    .select("year_start,term2_start,year_end")
    .eq("class_id", classId)
    .maybeSingle();
  const s = (data ?? {}) as { year_start?: string; term2_start?: string; year_end?: string };
  const terms = {
    yearStart: s.year_start ?? null,
    term2Start: s.term2_start ?? null,
    yearEnd: s.year_end ?? null,
  };
  return periodRange(
    semester === 1 ? "term1" : "term2",
    semester === 1 ? `${start}-10-01` : `${start + 1}-03-01`,
    terms,
  );
}

export const listBooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BookSummary[]> => {
    const d = await db();
    const { data, error } = await d
      .from("gb_books")
      .select("id,class_id,subject,semester,school_year,updated_at,smas_map")
      .eq("owner_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(NOT_READY);
    const rows = (data ?? []) as (Omit<BookRow, "columns" | "smas_template"> & {
      smas_map: unknown;
    })[];
    const { data: classes } = await d
      .from("exam_classes")
      .select("id,name")
      .eq("owner_id", context.userId);
    const names = new Map(
      ((classes ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
    );
    const { data: students } = await d
      .from("exam_students")
      .select("class_id")
      .eq("owner_id", context.userId);
    const counts = new Map<string, number>();
    for (const s of (students ?? []) as { class_id: string }[])
      counts.set(s.class_id, (counts.get(s.class_id) ?? 0) + 1);
    return rows.map((r) => ({
      id: r.id,
      classId: r.class_id,
      className: names.get(r.class_id) ?? "",
      subject: r.subject,
      semester: r.semester,
      schoolYear: r.school_year,
      studentCount: counts.get(r.class_id) ?? 0,
      hasSmas: !!r.smas_map,
      updatedAt: r.updated_at,
    }));
  });

export const createBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      subject: z.string().trim().min(1).max(60),
      semester: z.union([z.literal(1), z.literal(2)]),
      schoolYear: z.string().trim().max(20),
      columns: columnsSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    const { data: row, error } = await (
      await db()
    )
      .from("gb_books")
      .insert({
        owner_id: context.userId,
        class_id: data.classId,
        subject: data.subject,
        semester: data.semester,
        school_year: data.schoolYear,
        columns: data.columns,
      })
      .select("id")
      .single();
    if (error?.code === "23505") throw new Error("Lớp này đã có sổ điểm môn đó trong học kỳ này");
    if (error || !row) throw new Error(NOT_READY);
    return { id: (row as { id: string }).id };
  });

export const updateBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      bookId: uuid,
      columns: columnsSchema.optional(),
      bonusTarget: z.string().max(20).nullable().optional(),
      bonusRule: bonusRuleSchema.nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const book = await ownedBook(context.userId, data.bookId);
    const columns = data.columns ?? book.columns;
    if (data.columns && book.smas_map) {
      const kept = new Set(Object.keys(book.smas_map.columns));
      if ([...kept].some((k) => !columns.some((c) => c.key === k)))
        throw new Error("Không xóa được cột lấy từ file SMAS (cần để xuất lại đúng mẫu)");
    }
    const target = data.bonusTarget === undefined ? book.bonus_target : data.bonusTarget;
    if (target && !columns.some((c) => c.key === target && c.kind === "tx"))
      throw new Error("Điểm cộng/trừ chỉ áp vào một cột ĐĐG thường xuyên");
    const { error } = await (
      await db()
    )
      .from("gb_books")
      .update({
        columns,
        bonus_target: target,
        ...(data.bonusRule === undefined ? {} : { bonus_rule: data.bonusRule }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", book.id);
    if (error) throw new Error("Không lưu được sổ điểm");
    return { ok: true };
  });

export const deleteBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ bookId: uuid }))
  .handler(async ({ data, context }) => {
    const book = await ownedBook(context.userId, data.bookId);
    const { error } = await (await db()).from("gb_books").delete().eq("id", book.id);
    if (error) throw new Error("Không xóa được sổ điểm");
    return { ok: true };
  });

export const bookData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ bookId: uuid }))
  .handler(async ({ data, context }): Promise<BookData> => {
    const book = await ownedBook(context.userId, data.bookId);
    const cls = await owned(context.userId, book.class_id);
    const d = await db();
    const range = await termRange(book.class_id, book.school_year, book.semester);
    const [students, scores, bonus, events] = await Promise.all([
      d.from("exam_students").select("id,full_name,student_code").eq("class_id", book.class_id),
      d.from("gb_scores").select("student_id,column_key,num,txt").eq("book_id", book.id),
      d.from("gb_bonus").select("student_id,plus,minus,note").eq("book_id", book.id),
      d
        .from("hr_behavior_events")
        .select("student_id,kind")
        .eq("class_id", book.class_id)
        .eq("subject", book.subject)
        .gte("day", range.from)
        .lte("day", range.to),
    ]);
    if (students.error || scores.error || bonus.error || events.error) throw new Error(NOT_READY);
    const ids = ((students.data ?? []) as { id: string }[]).map((s) => s.id);
    const status = new Map<string, StudentStatus>();
    if (ids.length) {
      const { data: prof } = await d
        .from("hr_student_profiles")
        .select("student_id,status")
        .in("student_id", ids);
      for (const p of (prof ?? []) as { student_id: string; status: StudentStatus }[])
        status.set(p.student_id, p.status);
    }
    const counts: Record<string, Counts> = {};
    for (const e of (events.data ?? []) as { student_id: string; kind: BehaviorKind }[]) {
      const c = (counts[e.student_id] ??= {});
      c[e.kind] = (c[e.kind] ?? 0) + 1;
    }
    const total = ids.length;
    return {
      book: {
        id: book.id,
        classId: book.class_id,
        className: cls.name,
        subject: book.subject,
        semester: book.semester,
        schoolYear: book.school_year,
        studentCount: total,
        hasSmas: !!book.smas_map,
        updatedAt: book.updated_at,
        columns: book.columns,
        bonusTarget: book.bonus_target,
        bonusRule: book.bonus_rule,
        termFrom: range.from,
        termTo: range.to,
      },
      students: (
        (students.data ?? []) as { id: string; full_name: string; student_code: string | null }[]
      ).map((s) => ({
        id: s.id,
        fullName: s.full_name,
        studentCode: s.student_code,
        status: status.get(s.id) ?? "dang_hoc",
      })),
      scores: (
        (scores.data ?? []) as {
          student_id: string;
          column_key: string;
          num: number | string | null;
          txt: string | null;
        }[]
      ).map((r) => ({
        studentId: r.student_id,
        key: r.column_key,
        num: r.num === null ? null : Number(r.num),
        txt: r.txt,
      })),
      bonus: (
        (bonus.data ?? []) as {
          student_id: string;
          plus: number | string;
          minus: number | string;
          note: string;
        }[]
      ).map((b) => ({
        studentId: b.student_id,
        plus: Number(b.plus),
        minus: Number(b.minus),
        note: b.note,
      })),
      counts,
    };
  });

const cellSchema = z.object({
  studentId: uuid,
  key: z.string().regex(/^[a-z0-9_]{1,20}$/),
  num: z.number().min(0).max(10).nullable(),
  txt: z.string().trim().max(255).nullable(),
});

async function writeCells(
  bookId: string,
  classId: string,
  cells: z.infer<typeof cellSchema>[],
  onlyEmpty = false,
) {
  if (!cells.length) return 0;
  const { studentsInClass } = await import("@/lib/exam/db.server");
  const valid = new Set(
    await studentsInClass(classId, [...new Set(cells.map((c) => c.studentId))]),
  );
  let list = cells.filter((c) => valid.has(c.studentId));
  const d = await db();
  if (onlyEmpty) {
    const { data } = await d
      .from("gb_scores")
      .select("student_id,column_key")
      .eq("book_id", bookId);
    const taken = new Set(
      ((data ?? []) as { student_id: string; column_key: string }[]).map(
        (r) => `${r.student_id}|${r.column_key}`,
      ),
    );
    list = list.filter((c) => !taken.has(`${c.studentId}|${c.key}`));
  }
  const blank = list.filter((c) => c.num === null && !c.txt);
  const filled = list.filter((c) => c.num !== null || !!c.txt);
  for (const c of blank) {
    const { error } = await d
      .from("gb_scores")
      .delete()
      .eq("book_id", bookId)
      .eq("student_id", c.studentId)
      .eq("column_key", c.key);
    if (error) throw new Error("Không lưu được điểm");
  }
  if (filled.length) {
    const now = new Date().toISOString();
    const { error } = await d.from("gb_scores").upsert(
      filled.map((c) => ({
        book_id: bookId,
        student_id: c.studentId,
        column_key: c.key,
        num: c.num,
        txt: c.txt || null,
        updated_at: now,
      })),
    );
    if (error) throw new Error("Không lưu được điểm");
  }
  await d.from("gb_books").update({ updated_at: new Date().toISOString() }).eq("id", bookId);
  return list.length;
}

export const saveScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ bookId: uuid, cells: z.array(cellSchema).max(1000) }))
  .handler(async ({ data, context }) => {
    const book = await ownedBook(context.userId, data.bookId);
    const keys = new Set(book.columns.map((c) => c.key));
    if (data.cells.some((c) => !keys.has(c.key))) throw new Error("Cột điểm không có trong sổ");
    return { saved: await writeCells(book.id, book.class_id, data.cells) };
  });

export const saveBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      bookId: uuid,
      studentId: uuid,
      plus: z.number().min(0).max(10),
      minus: z.number().min(0).max(10),
      note: z.string().trim().max(300).default(""),
    }),
  )
  .handler(async ({ data, context }) => {
    const book = await ownedBook(context.userId, data.bookId);
    const { studentsInClass } = await import("@/lib/exam/db.server");
    if (!(await studentsInClass(book.class_id, [data.studentId])).length)
      throw new Error("Học sinh không thuộc lớp này");
    const d = await db();
    const { data: old } = await d
      .from("gb_bonus")
      .select("plus,minus")
      .eq("book_id", book.id)
      .eq("student_id", data.studentId)
      .maybeSingle();
    const prev = {
      plus: Number((old as { plus?: number } | null)?.plus ?? 0),
      minus: Number((old as { minus?: number } | null)?.minus ?? 0),
    };
    const round = (n: number) => Math.round(n * 100) / 100;
    const plus = round(data.plus);
    const minus = round(data.minus);
    const { error } = await d.from("gb_bonus").upsert({
      book_id: book.id,
      student_id: data.studentId,
      plus,
      minus,
      note: data.note,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Không lưu được điểm cộng/trừ");
    if (prev.plus !== plus || prev.minus !== minus)
      await d.from("gb_bonus_log").insert({
        book_id: book.id,
        student_id: data.studentId,
        owner_id: context.userId,
        plus_old: prev.plus,
        plus_new: plus,
        minus_old: prev.minus,
        minus_new: minus,
        note: data.note,
      });
    return { ok: true };
  });

export const bonusHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ bookId: uuid, studentId: uuid }))
  .handler(async ({ data, context }) => {
    const book = await ownedBook(context.userId, data.bookId);
    const { data: rows, error } = await (
      await db()
    )
      .from("gb_bonus_log")
      .select("plus_old,plus_new,minus_old,minus_new,note,at")
      .eq("book_id", book.id)
      .eq("student_id", data.studentId)
      .order("at", { ascending: false })
      .limit(50);
    if (error) throw new Error(NOT_READY);
    return (
      (rows ?? []) as {
        plus_old: number;
        plus_new: number;
        minus_old: number;
        minus_new: number;
        note: string;
        at: string;
      }[]
    ).map((r) => ({
      plusOld: Number(r.plus_old),
      plusNew: Number(r.plus_new),
      minusOld: Number(r.minus_old),
      minusNew: Number(r.minus_new),
      note: r.note,
      at: r.at,
    }));
  });

/**
 * Import a SMAS sheet into a book (created when missing). Scores fill empty cells unless
 * overwrite is set; students matched by name get their SMAS code when they had none.
 */
export const importSmas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      subject: z.string().trim().min(1).max(60),
      semester: z.union([z.literal(1), z.literal(2)]),
      schoolYear: z.string().trim().max(20),
      columns: columnsSchema,
      template: z.string().max(3_000_000),
      map: z.object({
        sheetPath: z.string().max(100),
        columns: z.record(z.string(), z.string().regex(/^[A-Z]{1,3}$/)),
        rows: z
          .array(
            z.object({
              row: z.number().int().min(1),
              studentId: uuid.nullable(),
              fullName: z.string().max(100),
            }),
          )
          .max(200),
      }),
      cells: z.array(cellSchema).max(3000),
      overwrite: z.boolean(),
      setCodes: z
        .array(z.object({ studentId: uuid, code: z.string().trim().min(1).max(30) }))
        .max(200),
    }),
  )
  .handler(async ({ data, context }) => {
    await owned(context.userId, data.classId);
    const d = await db();
    const { data: existing, error: readErr } = await d
      .from("gb_books")
      .select("id,columns")
      .eq("class_id", data.classId)
      .eq("subject", data.subject)
      .eq("semester", data.semester)
      .maybeSingle();
    if (readErr) throw new Error(NOT_READY);
    let bookId = (existing as { id: string } | null)?.id;
    const values = {
      school_year: data.schoolYear,
      smas_template: data.template,
      smas_map: data.map,
      updated_at: new Date().toISOString(),
    };
    if (bookId) {
      // keep the teacher's own extra columns, take SMAS's columns as they are now
      const own = ((existing as { columns: BookColumn[] }).columns ?? []).filter(
        (c) => !c.smasCode && !data.columns.some((x) => x.key === c.key),
      );
      const { error } = await d
        .from("gb_books")
        .update({ ...values, columns: [...data.columns, ...own] })
        .eq("id", bookId);
      if (error) throw new Error("Không cập nhật được sổ điểm");
    } else {
      const { data: row, error } = await d
        .from("gb_books")
        .insert({
          ...values,
          owner_id: context.userId,
          class_id: data.classId,
          subject: data.subject,
          semester: data.semester,
          columns: data.columns,
        })
        .select("id")
        .single();
      if (error || !row) throw new Error(NOT_READY);
      bookId = (row as { id: string }).id;
    }
    const { studentsInClass } = await import("@/lib/exam/db.server");
    const valid = new Set(
      await studentsInClass(
        data.classId,
        data.setCodes.map((c) => c.studentId),
      ),
    );
    for (const c of data.setCodes.filter((x) => valid.has(x.studentId)))
      await d
        .from("exam_students")
        .update({ student_code: c.code })
        .eq("id", c.studentId)
        .is("student_code", null);
    const saved = await writeCells(bookId, data.classId, data.cells, !data.overwrite);
    return { bookId, saved };
  });

/** The stored SMAS file and where each student's row is, for exporting back into SMAS. */
export const smasTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ bookId: uuid }))
  .handler(async ({ data, context }) => {
    const book = await ownedBook(context.userId, data.bookId);
    if (!book.smas_template || !book.smas_map) throw new Error("Sổ này không tạo từ file SMAS");
    return { template: book.smas_template, map: book.smas_map };
  });

// ---------- in-class records ----------

export interface BehaviorEvent {
  id: string;
  studentId: string;
  kind: BehaviorKind;
  createdAt: string;
}

export const recordBehavior = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      classId: uuid,
      studentId: uuid,
      kind: z.enum(BEHAVIOR_KINDS),
      subject: z.string().trim().max(60),
      day,
      note: z.string().trim().max(200).default(""),
    }),
  )
  .handler(async ({ data, context }): Promise<BehaviorEvent> => {
    await owned(context.userId, data.classId);
    const { studentsInClass } = await import("@/lib/exam/db.server");
    if (!(await studentsInClass(data.classId, [data.studentId])).length)
      throw new Error("Học sinh không thuộc lớp này");
    const { data: row, error } = await (
      await db()
    )
      .from("hr_behavior_events")
      .insert({
        class_id: data.classId,
        student_id: data.studentId,
        owner_id: context.userId,
        day: data.day,
        kind: data.kind,
        subject: data.subject,
        note: data.note,
      })
      .select("id,created_at")
      .single();
    if (error || !row) throw new Error(NOT_READY);
    const r = row as { id: string; created_at: string };
    return { id: r.id, studentId: data.studentId, kind: data.kind, createdAt: r.created_at };
  });

export const undoBehavior = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: uuid }))
  .handler(async ({ data, context }) => {
    const { error } = await (
      await db()
    )
      .from("hr_behavior_events")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error("Không xóa được ghi nhận");
    return { ok: true };
  });

export const behaviorOfDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ classId: uuid, subject: z.string().trim().max(60), day }))
  .handler(async ({ data, context }): Promise<BehaviorEvent[]> => {
    await owned(context.userId, data.classId);
    const { data: rows, error } = await (
      await db()
    )
      .from("hr_behavior_events")
      .select("id,student_id,kind,created_at")
      .eq("class_id", data.classId)
      .eq("subject", data.subject)
      .eq("day", data.day)
      .order("created_at");
    if (error) throw new Error(NOT_READY);
    return (
      (rows ?? []) as { id: string; student_id: string; kind: BehaviorKind; created_at: string }[]
    ).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      kind: r.kind,
      createdAt: r.created_at,
    }));
  });
